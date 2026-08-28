import { useState, useEffect, useRef, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

// True when running on Render (Docker daemon not available there)
const IS_RENDER = !!import.meta.env.VITE_API_URL;

const MAX_LIVE = 60;

const STRAT = {
  CPU:     { color:'#3b82f6', light:'#93c5fd', icon:'🖥',  label:'CPU Strategy'     },
  TREND:   { color:'#10b981', light:'#6ee7b7', icon:'📈', label:'Trend Strategy'   },
  LATENCY: { color:'#a855f7', light:'#d8b4fe', icon:'⏱', label:'Latency Strategy' },
};

const SEV = {
  CRITICAL: { bg:'rgba(239,68,68,0.1)',  border:'rgba(239,68,68,0.35)',  text:'#fca5a5' },
  WARNING:  { bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.3)',  text:'#fcd34d' },
  INFO:     { bg:'rgba(59,130,246,0.1)', border:'rgba(59,130,246,0.3)',  text:'#93c5fd' },
};

const fmt    = v => typeof v === 'number' ? (Math.round(v * 10) / 10) : (v ?? '—');
const fmtUsd = v => `$${(+(v ?? 0)).toFixed(4)}`;
const fmtPct = v => `${fmt(v)}%`;
const SLA_COLOR = g => ({ AAA:'#34d399', AA:'#10b981', A:'#6ee7b7', B:'#fbbf24', C:'#f87171' })[String(g).toUpperCase().replace(' ','')] || '#94a3b8';
const fmtTs = ts => {
  if (!ts) return '—';
  try {
    if (Array.isArray(ts)) { const [,,,h=0,mi=0,s=0]=ts; return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
    return new Date(ts).toLocaleTimeString();
  } catch { return String(ts); }
};

// ── Sparkline chart ─────────────────────────────────────────────────────────
function Spark({ data, color, height=48 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const W=240, H=height, max=Math.max(...data,1);
  const pts = data.map((v,i) => [(i/(data.length-1))*W, H-(v/max)*(H-4)-2]);
  const line = pts.map(([x,y],i) => `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
  const gid = `sg${color.replace('#','')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
        <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="2" style={{ filter:`drop-shadow(0 0 4px ${color}80)` }}/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="4" fill={color} style={{ filter:`drop-shadow(0 0 5px ${color})` }}/>
    </svg>
  );
}

// ── Multi-series chart with grid labels ──────────────────────────────────────
function Chart({ series, height=120, yMax=100, showDots=false, label='' }) {
  const W=800, H=height;
  const y = v => H - Math.min(1, Math.max(0, v/yMax))*(H-4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs>{series.map(s=>(
        <linearGradient key={s.key} id={`cg${s.key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={s.color} stopOpacity="0.02"/>
        </linearGradient>
      ))}</defs>
      {[0,25,50,75,100].map(p=>(
        <g key={p}>
          <line x1="0" y1={y(p)} x2={W} y2={y(p)} stroke="#0f172a" strokeWidth="1" strokeDasharray="4,3"/>
          <text x="4" y={y(p)-3} fill="#1e293b" fontSize="9" fontFamily="monospace">{p}{label}</text>
        </g>
      ))}
      {series.map(s => {
        if (!s.data || s.data.length < 2) return null;
        const pts = s.data.map((v,i) => [(i/(s.data.length-1))*W, y(v)]);
        const l = pts.map(([x,yy],i) => `${i===0?'M':'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
        const a = `${l} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
        return (
          <g key={s.key}>
            <path d={a} fill={`url(#cg${s.key})`}/>
            <path d={l} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ filter:`drop-shadow(0 0 5px ${s.color}60)` }}/>
            {showDots && pts.filter((_,i)=>i%Math.max(1,Math.floor(pts.length/20))===0).map(([x,yy],i)=>(
              <circle key={i} cx={x} cy={yy} r="3" fill={s.color} style={{ filter:`drop-shadow(0 0 4px ${s.color})` }}/>
            ))}
            {!showDots && pts.length>0 && (
              <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="5" fill={s.color} style={{ filter:`drop-shadow(0 0 6px ${s.color})` }}/>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Radar / Spider chart ──────────────────────────────────────────────────────
function RadarChart({ data, size=220 }) {
  // data = [{ label, values:{CPU,TREND,LATENCY} }]
  if (!data || data.length === 0) return null;
  const cx=size/2, cy=size/2, R=size/2-28;
  const axes = data.map(d=>d.label);
  const n = axes.length;
  const angle = i => (Math.PI*2/n)*i - Math.PI/2;
  const pt = (i, r) => [cx + r*Math.cos(angle(i)), cy + r*Math.sin(angle(i))];
  const strategies = Object.keys(STRAT);
  // normalise values 0→1
  const maxVals = data.map((_,i) => Math.max(...strategies.map(s=>data[i]?.values[s]||0), 1));
  return (
    <svg width={size} height={size} style={{ display:'block', margin:'0 auto' }}>
      {/* grid rings */}
      {[0.25,0.5,0.75,1].map(r=>(
        <polygon key={r} points={axes.map((_,i)=>pt(i,R*r).join(',')).join(' ')}
          fill="none" stroke="#0f172a" strokeWidth="1"/>
      ))}
      {/* axis lines */}
      {axes.map((_,i)=>(
        <line key={i} x1={cx} y1={cy} x2={pt(i,R)[0]} y2={pt(i,R)[1]} stroke="#1e293b" strokeWidth="1"/>
      ))}
      {/* axis labels */}
      {axes.map((label,i)=>{
        const [x,y]=pt(i,R+14);
        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#475569" fontSize="10" fontFamily="Inter">{label}</text>;
      })}
      {/* strategy polygons */}
      {strategies.map(s=>{
        const pts = data.map((d,i)=>{
          const v = (d.values[s]||0)/maxVals[i];
          return pt(i,R*v).join(',');
        });
        const m = STRAT[s];
        return (
          <polygon key={s} points={pts.join(' ')}
            fill={m.color+'22'} stroke={m.color} strokeWidth="2"
            style={{ filter:`drop-shadow(0 0 4px ${m.color}40)` }}/>
        );
      })}
    </svg>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, unit='', sub, color='#60a5fa', spark, trend, badge }) {
  const tUp=trend>0, tDown=trend<0;
  return (
    <div style={{ background:'rgba(8,13,26,0.9)', border:`1px solid ${color}18`, borderRadius:'16px',
      padding:'18px 20px', flex:'1 1 150px', display:'flex', flexDirection:'column', gap:'8px',
      transition:'all 0.2s', cursor:'default', position:'relative', overflow:'hidden' }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${color}45`; e.currentTarget.style.transform='translateY(-1px)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=`${color}18`; e.currentTarget.style.transform='translateY(0)'; }}>
      <div style={{ position:'absolute', top:0, right:0, width:'100px', height:'100px',
        background:`radial-gradient(circle at 100% 0%,${color}08,transparent 70%)`, pointerEvents:'none' }}/>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700 }}>{icon} {label}</span>
        {trend!=null && <span style={{ fontSize:'10px', fontWeight:700, color:tUp?'#34d399':tDown?'#f87171':'#475569' }}>{tUp?'↑':tDown?'↓':'→'}{Math.abs(trend).toFixed(1)}%</span>}
        {badge && <span style={{ fontSize:'9px', fontWeight:800, padding:'1px 6px', borderRadius:'20px', background:`${color}20`, color }}>{badge}</span>}
      </div>
      <div style={{ fontSize:'30px', fontWeight:900, color, lineHeight:1, letterSpacing:'-1.5px', fontVariantNumeric:'tabular-nums' }}>
        {value}<span style={{ fontSize:'13px', color:'#334155', fontWeight:400, marginLeft:'2px' }}>{unit}</span>
      </div>
      {sub && <span style={{ fontSize:'11px', color:'#334155' }}>{sub}</span>}
      {spark && <Spark data={spark} color={color} height={40}/>}
    </div>
  );
}

// ── Gauge ring ────────────────────────────────────────────────────────────────
function Gauge({ pct, color, size=80, label }) {
  const r=30, c=2*Math.PI*r, safe=Math.min(100,Math.max(0,pct||0));
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
      <svg width={size} height={size} viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="#0f172a" strokeWidth="7"/>
        <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={c} strokeDashoffset={c*(1-safe/100)}
          strokeLinecap="round" style={{ transformOrigin:'center', transform:'rotate(-90deg)', transition:'stroke-dashoffset 1s ease' }}/>
        <text x="35" y="39" textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="900" fontFamily="Inter">{Math.round(safe)}%</text>
      </svg>
      {label && <span style={{ fontSize:'10px', color:'#475569', textAlign:'center', lineHeight:1.3 }}>{label}</span>}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toasts({ toasts, dismiss }) {
  return (
    <div style={{ position:'fixed', bottom:'20px', right:'20px', zIndex:9999, display:'flex', flexDirection:'column-reverse', gap:'8px', maxWidth:'360px' }}>
      {toasts.map(t => {
        const c = SEV[t.severity] || SEV.INFO;
        return (
          <div key={t.id} style={{ background:'rgba(6,11,20,0.97)', border:`1px solid ${c.border}`,
            borderLeft:`3px solid ${c.text}`, borderRadius:'10px', padding:'12px 14px',
            display:'flex', gap:'10px', alignItems:'flex-start', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
            animation:'slideIn 0.3s ease' }}>
            <span style={{ fontSize:'16px' }}>{t.severity==='CRITICAL'?'🚨':t.severity==='WARNING'?'⚠️':'ℹ️'}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:'12px', fontWeight:700, color:c.text, marginBottom:'2px' }}>{t.severity}</p>
              <p style={{ fontSize:'11px', color:'#94a3b8', lineHeight:1.5 }}>{t.message}</p>
            </div>
            <button onClick={()=>dismiss(t.id)} style={{ background:'none', border:'none', color:'#334155', cursor:'pointer', fontSize:'14px' }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Winner Podium ─────────────────────────────────────────────────────────────
function WinnerPodium({ strategies, costs }) {
  if (!strategies || strategies.length === 0) return null;
  const sorted = [...strategies].sort((a,b) => a.averageResponseTime - b.averageResponseTime);
  const medals = ['🥇','🥈','🥉'];
  const heights = ['120px','90px','70px'];
  const podiumColors = ['linear-gradient(135deg,#fbbf24,#f59e0b)','linear-gradient(135deg,#94a3b8,#64748b)','linear-gradient(135deg,#d97706,#92400e)'];
  return (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:'12px', padding:'20px 0 0' }}>
      {sorted.slice(0,3).map((s, rank) => {
        const m = STRAT[s.strategy] || STRAT.CPU;
        const cost = costs?.find(c=>c.strategy===s.strategy);
        return (
          <div key={s.strategy} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', flex:'1', maxWidth:'200px' }}>
            <div style={{ fontSize:'28px' }}>{medals[rank]}</div>
            <div style={{ background:`rgba(8,13,26,0.9)`, border:`2px solid ${m.color}`, borderRadius:'14px',
              padding:'14px 16px', textAlign:'center', width:'100%', boxShadow:`0 0 20px ${m.color}30`,
              transition:'transform 0.2s' }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.03)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <div style={{ fontSize:'24px', marginBottom:'4px' }}>{m.icon}</div>
              <div style={{ fontWeight:900, color:m.light, fontSize:'13px', marginBottom:'6px' }}>{s.strategy}</div>
              <div style={{ fontSize:'11px', color:'#475569', marginBottom:'4px' }}>Avg Latency</div>
              <div style={{ fontSize:'18px', fontWeight:900, color:'#e2e8f0' }}>{fmt(s.averageResponseTime)}<span style={{ fontSize:'10px', color:'#334155', marginLeft:'2px' }}>ms</span></div>
              <div style={{ fontSize:'11px', color:'#475569', marginTop:'4px' }}>{s.finalReplicas} replicas</div>
              {cost && <div style={{ fontSize:'11px', color:'#34d399', marginTop:'4px', fontWeight:700 }}>{fmtUsd(cost.costPerHourUsd)}/hr</div>}
            </div>
            <div style={{ height:heights[rank], width:'100%', background:podiumColors[rank], borderRadius:'10px 10px 0 0', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontWeight:900, color:'rgba(0,0,0,0.6)', fontSize:'22px' }}>#{rank+1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, color='#3b82f6', max=100, height=6 }) {
  const pct = Math.min(100, (value/max)*100);
  return (
    <div style={{ height, background:'#0f172a', borderRadius:'99px', overflow:'hidden', width:'100%' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${color},${color}bb)`,
        borderRadius:'99px', transition:'width 0.5s ease' }}/>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return (
    <div style={{ background:'rgba(8,13,26,0.88)', border:'1px solid #0f172a', borderRadius:'14px', padding:'18px', ...style }}>
      {children}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ icon, title, right }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
      <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em' }}>{icon} {title}</p>
      {right}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ emoji, title, sub, action, onClick }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px' }}>
      <div style={{ fontSize:'52px', marginBottom:'14px' }}>{emoji}</div>
      <h3 style={{ color:'#e2e8f0', fontSize:'16px', fontWeight:800, marginBottom:'8px' }}>{title}</h3>
      {sub && <p style={{ color:'#334155', fontSize:'13px', marginBottom:'20px' }}>{sub}</p>}
      {action && (
        <button onClick={onClick} style={{ padding:'9px 22px', background:'rgba(99,102,241,0.12)',
          border:'1px solid rgba(99,102,241,0.3)', borderRadius:'9px', color:'#a5b4fc',
          fontSize:'13px', fontWeight:600, cursor:'pointer' }}>{action}</button>
      )}
    </div>
  );
}

// ── Animated Counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, duration=1200, prefix='', suffix='' }) {
  const [val, setVal] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    const t = typeof target === 'number' ? target : parseFloat(target) || 0;
    const start = performance.now();
    const tick = now => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - pct, 3);
      setVal(Math.round(ease * t * 10) / 10);
      if (pct < 1) startRef.current = requestAnimationFrame(tick);
    };
    startRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(startRef.current);
  }, [target, duration]);
  return <>{prefix}{val}{suffix}</>;
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ width='100%', height=18, radius=6, style={} }) {
  return (
    <div style={{ width, height, borderRadius:radius, background:'linear-gradient(90deg,#0f172a 25%,#1e293b 50%,#0f172a 75%)',
      backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite', ...style }}/>
  );
}

// ── Confetti burst ────────────────────────────────────────────────────────────
function Confetti({ active }) {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    if (!active) return;
    const cols = ['#3b82f6','#10b981','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899'];
    setParticles(Array.from({length:80}, (_,i) => ({
      id:i, x:Math.random()*100, delay:Math.random()*0.6,
      col:cols[Math.floor(Math.random()*cols.length)],
      size:Math.random()*8+4, rot:Math.random()*360,
      vx:(Math.random()-0.5)*8, vy:Math.random()*-12-4,
    })));
    const t = setTimeout(() => setParticles([]), 3500);
    return () => clearTimeout(t);
  }, [active]);
  if (!particles.length) return null;
  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:99999, overflow:'hidden' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position:'absolute', left:`${p.x}%`, top:'-20px',
          width:p.size, height:p.size, background:p.col, borderRadius:'2px',
          animation:`confettiFall 3s ${p.delay}s ease-in forwards`,
          transform:`rotate(${p.rot}deg)`,
        }}/>
      ))}
    </div>
  );
}

// ── Hero / Welcome Screen ─────────────────────────────────────────────────────
function HeroScreen({ onStart, onSkip }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep(1), 200);
    return () => clearTimeout(t);
  }, []);
  const stats = [
    { icon:'🖥', label:'Strategies Compared', val:3 },
    { icon:'💰', label:'Cost Reduction', val:40, suffix:'%' },
    { icon:'⚡', label:'Latency Improvement', val:60, suffix:'%' },
    { icon:'📊', label:'Live Metrics/s', val:1 },
  ];
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'#060b14',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'24px', overflow:'hidden' }}>
      {/* Background glows */}
      <div style={{ position:'absolute', top:'-20%', left:'-10%', width:'60vw', height:'60vw',
        background:'radial-gradient(circle,rgba(59,130,246,0.12),transparent 65%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:'60vw', height:'60vw',
        background:'radial-gradient(circle,rgba(168,85,247,0.10),transparent 65%)', pointerEvents:'none' }}/>
      {/* Grid lines */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px)',
        backgroundSize:'60px 60px', pointerEvents:'none' }}/>

      <div style={{ position:'relative', maxWidth:'700px', width:'100%', textAlign:'center',
        opacity:step?1:0, transform:step?'translateY(0)':'translateY(30px)', transition:'all 0.8s ease' }}>

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'6px 16px',
          background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)',
          borderRadius:'99px', marginBottom:'28px' }}>
          <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#34d399',
            boxShadow:'0 0 10px #34d399', animation:'pulse 2s infinite', display:'inline-block' }}/>
          <span style={{ fontSize:'12px', fontWeight:700, color:'#60a5fa', letterSpacing:'0.06em' }}>
            CLOUD-AGNOSTIC AUTO-SCALING PLATFORM
          </span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize:'clamp(2rem,5vw,3.8rem)', fontWeight:900, lineHeight:1.1,
          marginBottom:'20px', letterSpacing:'-2px' }}>
          <span style={{ background:'linear-gradient(135deg,#e2e8f0,#94a3b8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Find the Best{' '}
          </span>
          <span style={{ background:'linear-gradient(135deg,#3b82f6,#a855f7)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Scaling Strategy
          </span>
          <br/>
          <span style={{ background:'linear-gradient(135deg,#e2e8f0,#94a3b8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            for Your Cloud
          </span>
        </h1>

        <p style={{ fontSize:'16px', color:'#475569', maxWidth:'520px', margin:'0 auto 36px', lineHeight:1.8 }}>
          Run experiments on <strong style={{color:'#60a5fa'}}>CPU</strong>, <strong style={{color:'#10b981'}}>Trend</strong>, and <strong style={{color:'#a855f7'}}>Latency</strong> strategies simultaneously.
          Compare costs, SLA uptime, and response times — all in under 10 seconds.
        </p>

        {/* Stats row */}
        <div style={{ display:'flex', justifyContent:'center', gap:'28px', flexWrap:'wrap', marginBottom:'44px' }}>
          {stats.map((s,i) => (
            <div key={i} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'26px', fontWeight:900, color:'#e2e8f0', lineHeight:1 }}>
                {step && <AnimatedCounter target={s.val} duration={1000+i*200} suffix={s.suffix||''}/>}
              </div>
              <div style={{ fontSize:'11px', color:'#334155', marginTop:'4px', letterSpacing:'0.04em' }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display:'flex', gap:'12px', justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={onStart}
            style={{ padding:'15px 40px', fontWeight:800, fontSize:'16px', color:'#fff',
              background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'14px',
              cursor:'pointer', boxShadow:'0 0 40px rgba(99,102,241,0.5)', transition:'all 0.25s',
              letterSpacing:'0.02em' }}
            onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px) scale(1.03)';e.currentTarget.style.boxShadow='0 0 60px rgba(99,102,241,0.7)';}}
            onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0) scale(1)';e.currentTarget.style.boxShadow='0 0 40px rgba(99,102,241,0.5)';}}>
            🚀 Start Demo Experiment
          </button>
          <button onClick={onSkip}
            style={{ padding:'15px 32px', fontWeight:600, fontSize:'15px', color:'#475569',
              background:'transparent', border:'1px solid #1e293b', borderRadius:'14px',
              cursor:'pointer', transition:'all 0.2s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#334155';e.currentTarget.style.color='#94a3b8';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e293b';e.currentTarget.style.color='#475569';}}>
            Skip → Dashboard
          </button>
        </div>

        {/* Feature pills */}
        <div style={{ display:'flex', gap:'8px', justifyContent:'center', flexWrap:'wrap', marginTop:'36px' }}>
          {['Real CPU metrics','AWS cost analysis','SLA tracking','Auto-healing','Live SSE stream','Docker support'].map(f=>(
            <span key={f} style={{ fontSize:'11px', padding:'4px 12px', borderRadius:'99px',
              background:'rgba(255,255,255,0.03)', border:'1px solid #0f172a', color:'#334155' }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Quick Start card ──────────────────────────────────────────────────────────
function QuickStart({ onRun }) {
  return (
    <Card style={{ border:'1px solid rgba(99,102,241,0.25)', background:'rgba(99,102,241,0.04)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
        <div style={{ width:'42px', height:'42px', borderRadius:'12px', background:'rgba(99,102,241,0.15)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px',
          boxShadow:'0 0 16px rgba(99,102,241,0.3)' }}>🚀</div>
        <div>
          <div style={{ fontWeight:800, color:'#e2e8f0', fontSize:'15px' }}>Quick Start</div>
          <div style={{ fontSize:'12px', color:'#475569' }}>Run your first experiment in 10 seconds</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:'10px', marginBottom:'20px' }}>
        {[['1','Click Run Experiment','🧪'],['2','Wait 10 seconds','⏱'],['3','See winner + costs','🏆']].map(([n,t,ic])=>(
          <div key={n} style={{ flex:1, textAlign:'center', padding:'12px 8px', background:'rgba(8,13,26,0.6)',
            borderRadius:'10px', border:'1px solid #0f172a' }}>
            <div style={{ fontSize:'20px', marginBottom:'6px' }}>{ic}</div>
            <div style={{ fontSize:'11px', color:'#475569', lineHeight:1.5 }}><strong style={{color:'#60a5fa'}}>Step {n}</strong><br/>{t}</div>
          </div>
        ))}
      </div>
      <button onClick={onRun} style={{ width:'100%', padding:'13px', fontWeight:800, fontSize:'14px',
        color:'#fff', background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none',
        borderRadius:'11px', cursor:'pointer', boxShadow:'0 6px 20px rgba(99,102,241,0.4)',
        transition:'all 0.2s' }}
        onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';}}
        onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';}}>
        ▶ Run Demo Experiment Now
      </button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGES CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const PAGES = [
  { id:'dashboard',  icon:'🏠', label:'Dashboard'  },
  { id:'monitor',    icon:'📡', label:'Monitor'     },
  { id:'experiment', icon:'🧪', label:'Experiment'  },
  { id:'results',    icon:'📊', label:'Results'     },
  { id:'healing',    icon:'🛡', label:'Auto-Heal'  },
  { id:'alerts',     icon:'🚨', label:'Alerts'      },
  { id:'sla',        icon:'📋', label:'SLA'         },
  { id:'config',     icon:'⚙️', label:'Config'      },
  { id:'audit',      icon:'📝', label:'Audit Log'   },
  { id:'history',    icon:'🕐', label:'History'     },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,       setPage]    = useState('dashboard');
  const [connected,  setConn]    = useState(false);
  const [snap,       setSnap]    = useState(null);
  const [cpuHist,    setCpuH]    = useState(Array(MAX_LIVE).fill(0));
  const [memHist,    setMemH]    = useState(Array(MAX_LIVE).fill(0));
  const [loading,    setLoad]    = useState(false);
  const [progress,   setProg]    = useState(0);
  const [result,     setResult]  = useState(null);
  const [history,    setHistory] = useState([]);
  const [error,      setError]   = useState(null);
  const [dockerImg,  setDocker]  = useState('');
  const [showHero,   setHero]    = useState(() => !localStorage.getItem('css_seen'));
  const [confetti,   setConfetti]= useState(false);

  const runRef = useRef(null);

  const handleHeroStart = useCallback(() => {
    localStorage.setItem('css_seen','1');
    setHero(false);
    setPage('experiment');
    setTimeout(() => runRef.current?.(), 600);
  }, []);

  const handleHeroSkip = useCallback(() => {
    localStorage.setItem('css_seen','1');
    setHero(false);
  }, []);
  const [healEvents, setHealEvt] = useState([]);
  const [healStatus, setHealSt]  = useState(null);
  const [alerts,     setAlerts]  = useState([]);
  const [toasts,     setToasts]  = useState([]);
  const [slaData,    setSlaData] = useState([]);
  const [configs,    setConfigs] = useState({});
  const [auditLog,   setAudit]   = useState([]);
  const [loadActive, setLoadAct] = useState(false);
  const [sidebarOpen,setSidebar] = useState(true);
  const [configEdit, setConfigEd]= useState({});
  const [savingCfg,  setSaveCfg] = useState({});

  const sseRef   = useRef(null);
  const healRef  = useRef(null);
  const alertRef = useRef(null);
  const progRef  = useRef(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = useCallback((message, severity='INFO') => {
    const id = Date.now()+Math.random();
    setToasts(p=>[{id,message,severity},...p].slice(0,5));
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 6000);
  }, []);
  const dismissToast = id => setToasts(p=>p.filter(t=>t.id!==id));

  // ── Metrics push ──────────────────────────────────────────────────────────
  const pushMetric = d => {
    setSnap(d);
    setCpuH(p=>[...p.slice(1), d.cpuUsage??0]);
    setMemH(p=>[...p.slice(1), d.memoryUsage??0]);
  };

  const startPoll = useCallback(() => {
    const id = setInterval(async () => {
      try { const r=await fetch(`${API}/api/metrics`); if(r.ok){setConn(true);pushMetric(await r.json());}else setConn(false); } catch { setConn(false); }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API}/api/metrics/stream`);
    let opened=false;
    es.onopen    = () => { setConn(true); opened=true; };
    es.onmessage = e => { try { pushMetric(JSON.parse(e.data)); } catch {} };
    es.onerror   = () => { es.close(); setConn(false); if(!opened) startPoll(); else setTimeout(connectSSE,5000); };
    sseRef.current = es;
  }, [startPoll]);

  useEffect(() => { connectSSE(); return () => sseRef.current?.close(); }, [connectSSE]);

  // ── Healing SSE ────────────────────────────────────────────────────────────
  const connectHealSSE = useCallback(() => {
    if (healRef.current) healRef.current.close();
    const es = new EventSource(`${API}/api/healing/stream`);
    es.addEventListener('healing', e => {
      try { const evt=JSON.parse(e.data); setHealEvt(p=>[evt,...p].slice(0,100)); toast(`[${evt.mode}] ${evt.strategy}: ${evt.message}`,'INFO'); } catch {}
    });
    es.addEventListener('status', e => { try { setHealSt(JSON.parse(e.data)); } catch {} });
    es.onerror = () => { es.close(); setTimeout(connectHealSSE,5000); };
    healRef.current = es;
  }, [toast]);

  useEffect(() => { connectHealSSE(); return () => healRef.current?.close(); }, [connectHealSSE]);

  // ── Alerts SSE ─────────────────────────────────────────────────────────────
  const connectAlertSSE = useCallback(() => {
    if (alertRef.current) alertRef.current.close();
    const es = new EventSource(`${API}/api/alerts/stream`);
    es.addEventListener('alert', e => {
      try { const a=JSON.parse(e.data); setAlerts(p=>[a,...p].slice(0,50)); toast(a.message, a.severity); } catch {}
    });
    es.addEventListener('history', () => {
      fetch(`${API}/api/alerts`).then(r=>r.ok?r.json():[]).then(setAlerts).catch(()=>{});
    });
    es.onerror = () => { es.close(); setTimeout(connectAlertSSE,5000); };
    alertRef.current = es;
  }, [toast]);

  useEffect(() => { connectAlertSSE(); return () => alertRef.current?.close(); }, [connectAlertSSE]);

  // ── Periodic fetches ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [sl,cfg,al,hist,hs,ls] = await Promise.allSettled([
          fetch(`${API}/api/sla`).then(r=>r.json()),
          fetch(`${API}/api/config`).then(r=>r.json()),
          fetch(`${API}/api/audit`).then(r=>r.json()),
          fetch(`${API}/api/history`).then(r=>r.json()),
          fetch(`${API}/api/healing/status`).then(r=>r.json()),
          fetch(`${API}/api/load/status`).then(r=>r.json()),
        ]);
        if (sl.status==='fulfilled')   setSlaData(sl.value||[]);
        if (cfg.status==='fulfilled')  { setConfigs(cfg.value||{}); setConfigEd(cfg.value||{}); }
        if (al.status==='fulfilled')   setAudit((al.value||[]).slice(0,50));
        if (hist.status==='fulfilled') setHistory(hist.value||[]);
        if (hs.status==='fulfilled')   setHealSt(hs.value);
        if (ls.status==='fulfilled')   setLoadAct(ls.value?.active||false);
      } catch {}
    };
    load();
    const iv = setInterval(async()=>{
      try {
        const [sl,cfg,al] = await Promise.allSettled([
          fetch(`${API}/api/sla`).then(r=>r.json()),
          fetch(`${API}/api/config`).then(r=>r.json()),
          fetch(`${API}/api/audit`).then(r=>r.json()),
        ]);
        if (sl.status==='fulfilled')  setSlaData(sl.value||[]);
        if (cfg.status==='fulfilled') setConfigs(cfg.value||{});
        if (al.status==='fulfilled')  setAudit((al.value||[]).slice(0,50));
      } catch {}
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (result) fetch(`${API}/api/history`).then(r=>r.json()).then(setHistory).catch(()=>{});
  }, [result]);

  // ── Run experiment ─────────────────────────────────────────────────────────
  const run = async () => {
    setLoad(true); setError(null); setProg(0);
    const dur = dockerImg ? 30 : 10;
    let step=0;
    progRef.current = setInterval(()=>{ step++; setProg(Math.min(95, Math.round((step/dur)*100))); }, 1000);
    toast('Experiment started — sampling real server metrics…','INFO');
    try {
      const payload = { strategies:['CPU','TREND','LATENCY'] };
      if (dockerImg) payload.dockerImage = dockerImg;
      const r = await fetch(`${API}/api/experiment`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      clearInterval(progRef.current); setProg(100);
      let data; try { data=await r.json(); } catch { data=null; }
      if (!r.ok) { throw new Error(data?.message||data?.error||`Server error ${r.status}`); }
      if (data?.error && !data?.strategies) { throw new Error(data.message||data.error); }
      if (!data || !data.bestStrategy) { throw new Error('Empty response from server. Check Render backend logs.'); }
      setResult(data);
      setPage('results');
      toast(`✅ Experiment complete! Winner: ${data.bestStrategy} (${data.dockerMode||'SIMULATION'})`,'INFO');
      if (data.dockerNote) toast(`ℹ️ ${data.dockerNote}`,'INFO');
      setConfetti(true); setTimeout(()=>setConfetti(false), 100);
    } catch(e) {
      clearInterval(progRef.current);
      const msg = (e.message||'').includes('fetch')
        ? 'Cannot reach backend. Wait 30–60s for Render to wake up (free tier cold start).'
        : e.message || 'Experiment failed';
      setError(msg); toast(msg,'CRITICAL');
    } finally { setLoad(false); setProg(0); }
  };
  runRef.current = run; // keep ref fresh for hero screen

  // ── Load gen toggle ────────────────────────────────────────────────────────
  const toggleLoad = async () => {
    try {
      const url = loadActive ? `${API}/api/load/stop` : `${API}/api/load/start?durationSeconds=30`;
      const r = await fetch(url,{method:'POST'});
      if (r.ok) { const d=await r.json(); setLoadAct(d.status==='STARTED'); toast(d.status==='STARTED'?'Load gen started (30s)':'Load gen stopped','INFO'); }
    } catch(e) { toast('Load gen error: '+e.message,'WARNING'); }
  };

  // ── Exports ────────────────────────────────────────────────────────────────
  const exportJSON = () => {
    if (!result) return;
    const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`cloudscale-${Date.now()}.json`}).click();
    toast('JSON exported','INFO');
  };
  const exportCSV = () => {
    if (!result?.strategies) return;
    const costs=result.costAnalysis||[];
    const rows=[['Strategy','Avg Latency (ms)','Final Replicas','Events','$/hr','Efficiency%']];
    result.strategies.forEach(s=>{
      const c=costs.find(x=>x.strategy===s.strategy)||{};
      rows.push([s.strategy,s.averageResponseTime,s.finalReplicas,s.scalingEventCount,c.costPerHourUsd??'',c.efficiencyScore??'']);
    });
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`cloudscale-${Date.now()}.csv`}).click();
    toast('CSV exported','INFO');
  };
  const printReport = () => window.print();

  // ── Chaos actions ──────────────────────────────────────────────────────────
  const armHeal    = async () => { try { await fetch(`${API}/api/healing/arm`,{method:'POST'}); toast('Auto-Heal ARMED 🛡','INFO'); } catch(e) { toast(e.message,'WARNING'); } };
  const disarmHeal = async () => { try { await fetch(`${API}/api/healing/disarm`,{method:'POST'}); toast('Auto-Heal DISARMED','WARNING'); } catch(e) { toast(e.message,'WARNING'); } };
  const injectChaos= async () => { try { await fetch(`${API}/api/chaos/crash`,{method:'POST'}); toast('💥 Chaos injected!','WARNING'); } catch(e) { toast('Chaos: '+e.message,'WARNING'); } };

  // ── Config save ────────────────────────────────────────────────────────────
  const saveCfg = async (strategy) => {
    setSaveCfg(p=>({...p,[strategy]:true}));
    try {
      const cfg = configEdit[strategy];
      const r = await fetch(`${API}/api/config/${strategy}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
      if (r.ok) toast(`${strategy} config saved ✅`,'INFO'); else toast(`Save failed`,'WARNING');
    } catch(e) { toast(e.message,'WARNING'); }
    setTimeout(()=>setSaveCfg(p=>({...p,[strategy]:false})),1200);
  };

  // ── Alert ack ──────────────────────────────────────────────────────────────
  const ackAlert = async id => {
    try {
      await fetch(`${API}/api/alerts/${id}/acknowledge`,{method:'POST'});
      setAlerts(p=>p.map(a=>a.id===id?{...a,acknowledged:true}:a));
    } catch {}
  };

  // ── Radar data builder ─────────────────────────────────────────────────────
  const buildRadar = () => {
    if (!result?.strategies) return null;
    const strats = result.strategies;
    const costs = result.costAnalysis || [];
    const maxLat = Math.max(...strats.map(s=>s.averageResponseTime||1),1);
    const maxRep = Math.max(...strats.map(s=>s.finalReplicas||1),1);
    const maxCost= Math.max(...costs.map(c=>c.costPerHourUsd||0.001),0.001);
    const maxEvt = Math.max(...strats.map(s=>s.scalingEventCount||0),1);
    const obj={};
    strats.forEach(s=>{
      const c=costs.find(x=>x.strategy===s.strategy)||{};
      obj[s.strategy]={
        latency: (1-(s.averageResponseTime/maxLat))*100,
        efficiency: c.efficiencyScore||0,
        stability: Math.max(0,100-(s.scalingEventCount||0)/maxEvt*100),
        cost: (1-(c.costPerHourUsd||0)/maxCost)*100,
      };
    });
    return [
      {label:'Low Latency',values:Object.fromEntries(strats.map(s=>[s.strategy,obj[s.strategy].latency]))},
      {label:'Cost Efficiency',values:Object.fromEntries(strats.map(s=>[s.strategy,obj[s.strategy].efficiency]))},
      {label:'Stability',values:Object.fromEntries(strats.map(s=>[s.strategy,obj[s.strategy].stability]))},
      {label:'Low Cost',values:Object.fromEntries(strats.map(s=>[s.strategy,obj[s.strategy].cost]))},
    ];
  };

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const alertCount = alerts.filter(a=>!a.acknowledged).length;
  const SBtn = ({id,icon,label,badge}) => (
    <button onClick={()=>setPage(id)} style={{
      width:'100%', display:'flex', alignItems:'center', gap:'10px',
      padding:'9px 12px', borderRadius:'9px', border:'none', cursor:'pointer',
      background:page===id?'rgba(99,102,241,0.18)':'transparent',
      color:page===id?'#a5b4fc':'#475569',
      fontSize:'13px', fontWeight:page===id?700:500,
      transition:'all 0.15s', textAlign:'left',
    }}
    onMouseEnter={e=>{ if(page!==id){e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#94a3b8';} }}
    onMouseLeave={e=>{ e.currentTarget.style.background=page===id?'rgba(99,102,241,0.18)':'transparent'; e.currentTarget.style.color=page===id?'#a5b4fc':'#475569'; }}>
      <span style={{ fontSize:'15px', flexShrink:0 }}>{icon}</span>
      {sidebarOpen && <><span style={{flex:1}}>{label}</span>{badge>0&&<span style={{fontSize:'10px',fontWeight:800,padding:'1px 6px',borderRadius:'10px',background:'rgba(239,68,68,0.2)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.3)'}}>{badge}</span>}</>}
    </button>
  );

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#060b14;font-family:'Inter',-apple-system,sans-serif}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#060b14}
        ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @media print{aside,header,.no-print{display:none!important}main{padding:0!important}.card-print{break-inside:avoid}}
      `}</style>

      {showHero && <HeroScreen onStart={handleHeroStart} onSkip={handleHeroSkip}/>}
      <Confetti active={confetti}/>

      <div style={{ display:'flex', minHeight:'100vh', background:'#060b14', color:'#e2e8f0', fontFamily:"'Inter',-apple-system,sans-serif" }}>
        {/* Glow blobs */}
        <div style={{ position:'fixed', top:'-200px', left:'-200px', width:'700px', height:'700px', background:'radial-gradient(circle,rgba(59,130,246,0.06)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>
        <div style={{ position:'fixed', bottom:'-200px', right:'-200px', width:'700px', height:'700px', background:'radial-gradient(circle,rgba(168,85,247,0.06)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>

        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        <aside style={{ width:sidebarOpen?'210px':'56px', flexShrink:0, background:'rgba(8,13,26,0.97)', borderRight:'1px solid #0f172a', display:'flex', flexDirection:'column', padding:'12px 8px', gap:'2px', transition:'width 0.22s', position:'sticky', top:0, height:'100vh', overflowY:'auto', overflowX:'hidden', zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'6px 6px', marginBottom:'12px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'10px', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0, boxShadow:'0 0 18px rgba(99,102,241,0.55)' }}>☁</div>
            {sidebarOpen && (
              <div>
                <div style={{ fontWeight:900, fontSize:'14px', background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', whiteSpace:'nowrap' }}>CloudScale</div>
                <div style={{ fontSize:'9px', color:'#1e293b', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>ENTERPRISE</div>
              </div>
            )}
          </div>

          {PAGES.map(p=>(
            <SBtn key={p.id} id={p.id} icon={p.icon} label={p.label} badge={p.id==='alerts'?alertCount:0}/>
          ))}

          <div style={{ marginTop:'auto', padding:'8px 4px', display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background:connected?'#34d399':'#ef4444', boxShadow:connected?'0 0 10px #34d399':'none', animation:connected?'pulse 2s infinite':'none' }}/>
            {sidebarOpen && <span style={{ fontSize:'11px', color:connected?'#34d399':'#ef4444', fontWeight:700 }}>{connected?'LIVE':'OFFLINE'}</span>}
          </div>
          <button onClick={()=>setSidebar(p=>!p)} style={{ padding:'6px', background:'transparent', border:'1px solid #1e293b', borderRadius:'7px', color:'#334155', cursor:'pointer', fontSize:'12px' }}>
            {sidebarOpen?'◀':'▶'}
          </button>
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, position:'relative', zIndex:1 }}>

          {/* Header */}
          <header className="no-print" style={{ background:'rgba(6,11,20,0.97)', backdropFilter:'blur(16px)', borderBottom:'1px solid #0f172a', padding:'0 22px', display:'flex', alignItems:'center', gap:'10px', height:'56px', position:'sticky', top:0, zIndex:9 }}>
            <h1 style={{ fontSize:'14px', fontWeight:700, color:'#94a3b8', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {PAGES.find(p=>p.id===page)?.icon} {PAGES.find(p=>p.id===page)?.label}
            </h1>
            {IS_RENDER && (
              <span style={{ fontSize:'10px', fontWeight:800, padding:'3px 10px', borderRadius:'99px',
                background:'rgba(99,102,241,0.15)', color:'#a5b4fc',
                border:'1px solid rgba(99,102,241,0.3)', letterSpacing:'0.06em', flexShrink:0 }}>LIVE DEMO</span>
            )}
            <div style={{ display:'flex', gap:'8px', alignItems:'center', flexShrink:0 }}>
              {snap && <span style={{ fontSize:'11px', color:'#334155', fontFamily:'monospace', whiteSpace:'nowrap' }}>CPU {fmt(snap.cpuUsage)}% | MEM {fmt(snap.memoryUsage)}%</span>}
              <button onClick={toggleLoad} style={{ padding:'5px 12px', fontWeight:700, fontSize:'11px',
                color:loadActive?'#fca5a5':'#94a3b8', background:loadActive?'rgba(239,68,68,0.12)':'rgba(51,65,85,0.3)',
                border:`1px solid ${loadActive?'rgba(239,68,68,0.3)':'rgba(51,65,85,0.5)'}`, borderRadius:'7px', cursor:'pointer' }}>
                {loadActive?'🔴 Stop Load':'⚡ Load Gen'}
              </button>
              {result && <>
                <button onClick={exportJSON} style={{ padding:'5px 11px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'7px', color:'#34d399', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>⬇ JSON</button>
                <button onClick={exportCSV}  style={{ padding:'5px 11px', background:'rgba(59,130,246,0.1)',  border:'1px solid rgba(59,130,246,0.25)',  borderRadius:'7px', color:'#60a5fa', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>⬇ CSV</button>
                <button onClick={printReport}style={{ padding:'5px 11px', background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.25)', borderRadius:'7px', color:'#d8b4fe', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>🖨 Print</button>
              </>}
              <button onClick={()=>{ setPage('experiment'); }} disabled={loading} style={{ padding:'7px 18px', fontWeight:800, fontSize:'12px', color:'#fff',
                background:loading?'#1e293b':'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'8px',
                cursor:loading?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 14px rgba(99,102,241,0.4)',
                opacity:loading?0.7:1, whiteSpace:'nowrap' }}>
                {loading?`⚙ ${progress}%`:'▶ Run Experiment'}
              </button>
            </div>
          </header>

          {/* Error banner */}
          {error && (
            <div className="no-print" style={{ background:'rgba(239,68,68,0.07)', borderBottom:'1px solid rgba(239,68,68,0.2)', padding:'10px 22px', display:'flex', gap:'10px', alignItems:'center' }}>
              <span>⚠️</span><span style={{ flex:1, fontSize:'12px', color:'#fca5a5' }}>{error}</span>
              <button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer' }}>✕</button>
            </div>
          )}

          <main style={{ flex:1, padding:'22px', overflowY:'auto' }}>

            {/* ════════ DASHBOARD ════════ */}
            {page==='dashboard' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'18px', animation:'fadeIn 0.3s ease' }}>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <KPI icon="🖥" label="CPU Usage"    value={fmt(snap?.cpuUsage)}    unit="%" color="#60a5fa" spark={cpuHist} sub={snap?.status||'real-time'}/>
                  <KPI icon="🧠" label="RAM Usage"    value={fmt(snap?.memoryUsage)} unit="%" color="#a78bfa" spark={memHist}/>
                  <KPI icon="🧪" label="Experiments"  value={history.length}              color="#34d399" sub="total runs"/>
                  <KPI icon="🛡" label="Heals"        value={healStatus?.totalHeals??0}   color="#fbbf24" sub={healStatus?.mode||'—'}/>
                  <KPI icon="🚨" label="Active Alerts"value={alertCount}                  color="#f87171" sub="unacknowledged"/>
                  <KPI icon="📡" label="Stream"       value={connected?'LIVE':'OFF'}      color={connected?'#34d399':'#ef4444'}/>
                </div>

                {history.length === 0 && !loading && (
                  <QuickStart onRun={() => { setPage('experiment'); setTimeout(run, 300); }}/>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:'14px' }}>
                  <Card>
                    <SectionHead icon="📈" title="Live CPU & Memory"/>
                    <Chart series={[{key:'cpu',data:cpuHist,color:'#60a5fa'},{key:'mem',data:memHist,color:'#a78bfa'}]} height={120} label="%"/>
                    <div style={{ display:'flex', gap:'16px', marginTop:'8px' }}>
                      {[{l:'CPU',c:'#60a5fa'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                        <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                          <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px' }}/>{x.l}
                        </div>
                      ))}
                    </div>
                  </Card>
                  {result?.cpuTimeline && (
                    <Card>
                      <SectionHead icon="🧪" title={`Last Experiment — CPU (Winner: ${result.bestStrategy})`}/>
                      <Chart series={[{key:'tcpu',data:result.cpuTimeline,color:'#f59e0b'},{key:'tmem',data:result.memTimeline||[],color:'#a78bfa'}]} height={120} label="%"/>
                    </Card>
                  )}
                </div>

                {slaData.length>0 && (
                  <Card>
                    <SectionHead icon="📋" title="SLA Status — All Strategies"/>
                    <div style={{ display:'flex', gap:'32px', flexWrap:'wrap', justifyContent:'space-around' }}>
                      {slaData.map(s=>{
                        const m=STRAT[s.strategy]||STRAT.CPU;
                        return (
                          <div key={s.strategy} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px' }}>
                            <Gauge pct={s.uptimePct} color={m.color} label={m.label}/>
                            <span style={{ fontSize:'12px', fontWeight:800, color:SLA_COLOR(s.slaGrade) }}>{s.slaGrade}</span>
                            <span style={{ fontSize:'10px', color:'#334155' }}>{fmt(s.uptimePct)}% uptime</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {history.length>0 && (
                  <Card>
                    <SectionHead icon="🕐" title="Recent Experiments" right={<button onClick={()=>setPage('history')} style={{ fontSize:'11px', color:'#a5b4fc', background:'none', border:'none', cursor:'pointer' }}>View all →</button>}/>
                    {history.slice(0,5).map((h,i)=>{
                      const m=STRAT[h.bestStrategy]||STRAT.CPU;
                      return (
                        <div key={i} onClick={()=>{setResult(h);setPage('results');}}
                          style={{ display:'flex', alignItems:'center', gap:'12px', padding:'9px 10px', borderRadius:'9px', cursor:'pointer', transition:'background 0.15s', marginBottom:'4px' }}
                          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <span style={{ fontSize:'11px', color:'#1e293b', fontFamily:'monospace', minWidth:'70px' }}>{new Date(h.runAt||0).toLocaleTimeString()}</span>
                          <span style={{ fontWeight:700, color:m.light, fontSize:'12px' }}>{m.icon} {h.bestStrategy} won</span>
                          <span style={{ fontSize:'11px', color:'#334155' }}>CPU {h.peakCpuUsage}% peak</span>
                          <span style={{ marginLeft:'auto', fontSize:'11px', color:'#a5b4fc' }}>View →</span>
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            )}

            {/* ════════ MONITOR ════════ */}
            {page==='monitor' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', animation:'fadeIn 0.3s ease' }}>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <KPI icon="🖥" label="CPU"      value={fmt(snap?.cpuUsage)}   unit="%" color="#60a5fa" spark={cpuHist}/>
                  <KPI icon="🧠" label="Memory"   value={fmt(snap?.memoryUsage)} unit="%" color="#a78bfa" spark={memHist}/>
                  <KPI icon="⚡" label="Load Gen" value={loadActive?'ACTIVE':'OFF'} color={loadActive?'#ef4444':'#475569'} sub="CPU stress test"/>
                  <KPI icon="🔌" label="Stream"   value={connected?'SSE':'POLL'} color={connected?'#34d399':'#fbbf24'}/>
                </div>
                <Card>
                  <SectionHead icon="📈" title={`Live System Metrics — last ${MAX_LIVE} samples`} right={
                    <div style={{ display:'flex', gap:'14px' }}>
                      {[{l:'CPU',c:'#60a5fa'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                        <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                          <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px' }}/>{x.l}
                        </div>
                      ))}
                    </div>
                  }/>
                  <Chart series={[{key:'cpu',data:cpuHist,color:'#60a5fa'},{key:'mem',data:memHist,color:'#a78bfa'}]} height={180} label="%"/>
                </Card>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:'12px' }}>
                  {Object.entries(STRAT).map(([key,m])=>(
                    <Card key={key} style={{ border:`1px solid ${m.color}18`, transition:'border-color 0.2s', cursor:'default' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                        <span style={{ fontSize:'24px' }}>{m.icon}</span>
                        <span style={{ fontWeight:800, color:m.light, fontSize:'14px' }}>{m.label}</span>
                      </div>
                      <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.8 }}>
                        {key==='CPU'    &&'Reactive scaling based on real CPU utilisation. Scales up when CPU > 75%, scales down when < 30%.'}
                        {key==='TREND'  &&'Predictive scaling on CPU growth rate. Detects acceleration and scales before overload occurs.'}
                        {key==='LATENCY'&&'Aggressive response-time scaling. Adds 3 replicas instantly when latency spikes above threshold.'}
                      </p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ════════ EXPERIMENT ════════ */}
            {page==='experiment' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', maxWidth:'660px', margin:'0 auto', animation:'fadeIn 0.3s ease' }}>
                <Card style={{ border:'1px solid #1e293b' }}>
                  <h2 style={{ fontSize:'18px', fontWeight:900, color:'#e2e8f0', marginBottom:'6px' }}>🧪 Run an Experiment</h2>
                  <p style={{ fontSize:'13px', color:'#475569', marginBottom:'22px', lineHeight:1.8 }}>
                    CloudScale samples {dockerImg?'30':'10'} seconds of real server metrics and simulates all 3 strategies simultaneously against the same traffic wave.
                  </p>

                  <label style={{ display:'block', fontSize:'12px', color:'#94a3b8', fontWeight:700, marginBottom:'8px' }}>
                    🐳 Docker Image <span style={{ color:'#1e293b', fontWeight:400 }}>(optional — leave blank for instant simulation)</span>
                  </label>
                  {IS_RENDER && (
                    <div style={{ background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:'10px', padding:'10px 14px', marginBottom:'12px', display:'flex', gap:'8px', alignItems:'flex-start' }}>
                      <span style={{ fontSize:'15px', flexShrink:0 }}>⚠️</span>
                      <p style={{ fontSize:'12px', color:'#fcd34d', lineHeight:1.7 }}>
                        <strong>Render Cloud:</strong> Docker daemon is not available on Render's free tier.
                        Any image you enter will be <strong>ignored</strong> and the experiment runs in fast
                        simulation mode automatically. Use <strong>localhost</strong> to test real Docker images.
                      </p>
                    </div>
                  )}
                  <input type="text" placeholder={IS_RENDER ? "Docker not available on Render — runs as simulation" : "e.g. nginx:alpine, redis:latest"} value={dockerImg} onChange={e=>setDocker(e.target.value)}
                    style={{ width:'100%', padding:'11px 14px', borderRadius:'10px', border:'1px solid #334155', background:'#080d1a', color: IS_RENDER ? '#334155' : '#e2e8f0', fontSize:'13px', outline:'none', marginBottom:'18px', boxSizing:'border-box',
                      transition:'border-color 0.2s', opacity: IS_RENDER ? 0.6 : 1 }}
                    onFocus={e=>{ if(!IS_RENDER) e.target.style.borderColor='#3b82f6'; }}
                    onBlur={e=>e.target.style.borderColor='#334155'}/>



                  {loading && (
                    <div style={{ textAlign:'center', padding:'24px' }}>
                      <div style={{ fontSize:'40px', marginBottom:'10px', animation:'spin 2s linear infinite', display:'inline-block' }}>⚙️</div>
                      <p style={{ color:'#94a3b8', fontSize:'14px', fontWeight:700, marginBottom:'12px' }}>Sampling real server metrics…</p>
                      <ProgressBar value={progress} color="#3b82f6"/>
                      <p style={{ color:'#334155', fontSize:'12px', marginTop:'8px' }}>{progress}% — {dockerImg?'30':'10'}s sampling window</p>
                      <div style={{ display:'flex', justifyContent:'space-around', marginTop:'16px' }}>
                        {['Sampling','Simulating','Calculating'].map((step,i)=>{
                          const active = progress<40?i===0:progress<80?i===1:i===2;
                          return (
                            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                              <div style={{ width:'28px', height:'28px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800,
                                background:active?'rgba(59,130,246,0.2)':'rgba(30,41,59,0.5)',
                                border:`1px solid ${active?'rgba(59,130,246,0.5)':'#0f172a'}`,
                                color:active?'#60a5fa':'#334155' }}>{i+1}</div>
                              <span style={{ fontSize:'10px', color:active?'#60a5fa':'#334155', fontWeight:active?700:400 }}>{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!loading && (
                    <button onClick={run} style={{ width:'100%', padding:'14px', fontWeight:800, fontSize:'15px', color:'#fff',
                      background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'11px', cursor:'pointer',
                      boxShadow:'0 8px 24px rgba(99,102,241,0.45)', transition:'all 0.2s' }}
                      onMouseEnter={e=>{e.target.style.transform='translateY(-1px)';e.target.style.boxShadow='0 12px 32px rgba(99,102,241,0.6)';}}
                      onMouseLeave={e=>{e.target.style.transform='translateY(0)';e.target.style.boxShadow='0 8px 24px rgba(99,102,241,0.45)';}}>
                      ▶ Start Experiment {dockerImg?'(~30s)':'(~10s)'}
                    </button>
                  )}
                </Card>

                <Card style={{ border:'1px solid #0f172a' }}>
                  <SectionHead icon="💡" title="Pro Tips"/>
                  {[['⚡','Click Load Gen to spike CPU before running — results are more dramatic.'],
                    ['🛡','Arm Auto-Heal before starting to capture healing events in results.'],
                    ['🐳','Enter a Docker image to run real containers instead of simulation.'],
                    ['📋','Results include AWS t3.small pricing — $0.023/replica/hr.'],
                    ['📊','All 3 strategies run against the identical traffic wave for fair comparison.'],
                  ].map(([icon,tip],i)=>(
                    <div key={i} style={{ display:'flex', gap:'10px', marginBottom:'10px', fontSize:'12px', color:'#475569', lineHeight:1.7 }}>
                      <span style={{ fontSize:'14px', flexShrink:0 }}>{icon}</span><span>{tip}</span>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* ════════ RESULTS ════════ */}
            {page==='results' && !result && (
              <Empty emoji="🧪" title="No experiment yet" sub="Run your first experiment to see strategy comparison, cost analysis, and SLA data." action="→ Go to Experiment" onClick={()=>setPage('experiment')}/>
            )}

            {page==='results' && result && (
              <div style={{ display:'flex', flexDirection:'column', gap:'18px', animation:'fadeIn 0.3s ease' }}>

                {/* KPI row */}
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <KPI icon="🏆" label="Winner"     value={result.bestStrategy||'—'} color={STRAT[result.bestStrategy]?.color||'#34d399'} badge="BEST"/>
                  <KPI icon="🖥" label="Peak CPU"   value={fmt(result.peakCpuUsage)} unit="%" color="#f59e0b"/>
                  <KPI icon="🧠" label="Peak RAM"   value={fmt(result.peakMemUsage)} unit="%" color="#a78bfa"/>
                  <KPI icon="📊" label="Samples"    value={result.sampleCount||0} color="#60a5fa" sub="1s intervals"/>
                  <KPI icon="💰" label="Best $/hr"  value={`$${(result.bestStrategyCostPerHour||0).toFixed(4)}`} color="#34d399" sub="AWS t3.small"/>
                  <KPI icon="⏱" label="Best Latency" value={fmt(result.averageResponseTime)} unit="ms" color="#10b981"/>
                </div>

                {/* Winner Podium */}
                {result.strategies?.length>0 && (
                  <Card>
                    <SectionHead icon="🏆" title="Strategy Comparison — Podium"/>
                    <WinnerPodium strategies={result.strategies} costs={result.costAnalysis}/>
                  </Card>
                )}

                {/* Charts row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:'14px' }}>
                  {result.cpuTimeline?.length>1 && (
                    <Card>
                      <SectionHead icon="📈" title="CPU & Memory During Experiment"/>
                      <Chart series={[{key:'cpu',data:result.cpuTimeline,color:'#f59e0b'},{key:'mem',data:result.memTimeline||[],color:'#a78bfa'}]} height={130} showDots label="%"/>
                      <div style={{ display:'flex', gap:'16px', marginTop:'8px' }}>
                        {[{l:'CPU',c:'#f59e0b'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                          <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                            <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px' }}/>{x.l}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {result.strategies?.[0]?.replicaTimeline?.length>1 && (
                    <Card>
                      <SectionHead icon="🔢" title="Replica Count — All Strategies"/>
                      <Chart series={result.strategies.map(s=>({key:s.strategy,data:s.replicaTimeline||[],color:STRAT[s.strategy]?.color||'#60a5fa'}))}
                        height={130} yMax={Math.max(8,...(result.strategies||[]).flatMap(s=>s.replicaTimeline||[0]))} showDots label=" replicas"/>
                      <div style={{ display:'flex', gap:'16px', marginTop:'8px' }}>
                        {result.strategies.map(s=>(
                          <div key={s.strategy} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                            <div style={{ width:'18px', height:'2px', background:STRAT[s.strategy]?.color||'#60a5fa', borderRadius:'1px' }}/>{s.strategy}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>

                {/* Radar + Cost row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:'14px' }}>
                  {/* Radar chart */}
                  {result.strategies?.length>0 && (
                    <Card>
                      <SectionHead icon="🎯" title="Multi-Dimension Comparison"/>
                      <RadarChart data={buildRadar()} size={200}/>
                      <div style={{ display:'flex', justifyContent:'center', gap:'16px', marginTop:'12px' }}>
                        {Object.entries(STRAT).map(([s,m])=>(
                          <div key={s} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                            <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:m.color }}/>{s}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Per-strategy stats */}
                  {result.strategies?.length>0 && (
                    <Card>
                      <SectionHead icon="📋" title="Strategy Details"/>
                      {result.strategies.map(s=>{
                        const m=STRAT[s.strategy]||STRAT.CPU;
                        const isWinner=s.strategy===result.bestStrategy;
                        return (
                          <div key={s.strategy} style={{ marginBottom:'14px', padding:'12px', borderRadius:'10px',
                            background:`${m.color}08`, border:`1px solid ${m.color}${isWinner?'50':'18'}`,
                            boxShadow:isWinner?`0 0 12px ${m.color}20`:undefined }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                              <span style={{ fontSize:'16px' }}>{m.icon}</span>
                              <span style={{ fontWeight:800, color:m.light, fontSize:'13px' }}>{s.strategy}</span>
                              {isWinner && <span style={{ fontSize:'9px', fontWeight:800, padding:'1px 7px', borderRadius:'20px', background:`${m.color}25`, color:m.light, border:`1px solid ${m.color}40` }}>WINNER</span>}
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                              {[['Avg Latency',`${fmt(s.averageResponseTime)} ms`],['Final Replicas',s.finalReplicas],['Scaling Events',s.scalingEventCount],['Healing Events',s.healingEventCount??0]].map(([l,v])=>(
                                <div key={l}>
                                  <div style={{ fontSize:'10px', color:'#334155', marginBottom:'2px' }}>{l}</div>
                                  <div style={{ fontSize:'14px', fontWeight:800, color:'#e2e8f0' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            {s.replicaTimeline?.length>1 && (
                              <div style={{ marginTop:'10px' }}>
                                <Spark data={s.replicaTimeline} color={m.color} height={32}/>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </Card>
                  )}
                </div>

                {/* Cost analysis table */}
                {result.costAnalysis?.length>0 && (
                  <Card>
                    <SectionHead icon="💰" title="Cost Analysis (AWS t3.small @ $0.023/replica/hr)"/>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                        <thead>
                          <tr style={{ borderBottom:'1px solid #0f172a' }}>
                            {['Strategy','Avg Replicas','Peak','Cost/hr','Savings vs Worst','Efficiency','Verdict'].map(h=>(
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#334155', fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.costAnalysis.map((c,i)=>{
                            const m=STRAT[c.strategy]||STRAT.CPU;
                            const isWinner=c.strategy===result.bestStrategy;
                            return (
                              <tr key={i} style={{ borderBottom:'1px solid #0f172a', background:isWinner?`${m.color}08`:'transparent', transition:'background 0.15s' }}
                                onMouseEnter={e=>e.currentTarget.style.background=`${m.color}12`}
                                onMouseLeave={e=>e.currentTarget.style.background=isWinner?`${m.color}08`:'transparent'}>
                                <td style={{ padding:'10px 12px' }}>
                                  <span style={{ color:m.light, fontWeight:800 }}>{m.icon} {c.strategy}</span>
                                  {isWinner && <span style={{ marginLeft:'6px', fontSize:'9px', color:m.color }}>★</span>}
                                </td>
                                <td style={{ padding:'10px 12px', color:'#94a3b8' }}>{c.avgReplicas}</td>
                                <td style={{ padding:'10px 12px', color:'#94a3b8' }}>{c.peakReplicas}</td>
                                <td style={{ padding:'10px 12px', color:'#fbbf24', fontWeight:700, fontFamily:'monospace' }}>{fmtUsd(c.costPerHourUsd)}</td>
                                <td style={{ padding:'10px 12px', color:'#34d399', fontFamily:'monospace' }}>{fmtUsd(c.savingsVsWorstUsd)}</td>
                                <td style={{ padding:'10px 12px', minWidth:'100px' }}>
                                  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                                    <ProgressBar value={c.efficiencyScore||0} color={m.color} height={5}/>
                                    <span style={{ fontSize:'10px', color:'#475569', whiteSpace:'nowrap' }}>{fmt(c.efficiencyScore)}%</span>
                                  </div>
                                </td>
                                <td style={{ padding:'10px 12px', color:'#94a3b8', fontSize:'11px', whiteSpace:'nowrap' }}>{c.recommendation}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* Monthly projection */}
                {result.costProjection && (
                  <Card>
                    <SectionHead icon="📅" title="Monthly Cost Projection — Best Strategy"/>
                    <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                      {Object.entries(result.costProjection).map(([period,cost])=>(
                        <div key={period} style={{ background:'rgba(52,211,153,0.05)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:'12px', padding:'14px 20px', flex:'1 1 100px', textAlign:'center' }}>
                          <p style={{ fontSize:'10px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>{period}</p>
                          <p style={{ fontSize:'20px', fontWeight:900, color:'#34d399' }}>${(cost||0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* SLA snapshot */}
                {result.slaSnapshot?.length>0 && (
                  <Card>
                    <SectionHead icon="📋" title="SLA After This Experiment"/>
                    <div style={{ display:'flex', gap:'32px', flexWrap:'wrap', justifyContent:'space-around' }}>
                      {result.slaSnapshot.map(s=>{
                        const m=STRAT[s.strategy]||STRAT.CPU;
                        return (
                          <div key={s.strategy} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px' }}>
                            <Gauge pct={s.uptimePct} color={m.color} label={m.label}/>
                            <span style={{ fontSize:'13px', fontWeight:800, color:SLA_COLOR(s.slaGrade) }}>{s.slaGrade}</span>
                            {s.totalCrashes>0 && <span style={{ fontSize:'10px', color:'#475569' }}>MTTR {s.mttrMs}ms</span>}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Scaling events */}
                <Card>
                  <SectionHead icon="📋" title={`Scaling Events — ${result.bestStrategy||'Winner'}`}/>
                  {!result.scalingEvents?.length
                    ? <p style={{ color:'#334155', fontSize:'12px', textAlign:'center', padding:'24px' }}>✅ No scaling events fired — load was within stable range.</p>
                    : (
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #0f172a' }}>
                              {['Time','Strategy','Old→New','Direction','Reason'].map(h=>(
                                <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#334155', fontWeight:700, fontSize:'10px', textTransform:'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.scalingEvents.map((ev,i)=>{
                              const m=STRAT[ev.strategyName]||STRAT.CPU, up=ev.newReplicas>ev.oldReplicas;
                              return (
                                <tr key={i} style={{ borderBottom:'1px solid #0a1020' }}>
                                  <td style={{ padding:'9px 12px', color:'#334155', fontFamily:'monospace' }}>{fmtTs(ev.timestamp)}</td>
                                  <td style={{ padding:'9px 12px' }}><span style={{ padding:'2px 9px', borderRadius:'20px', fontSize:'10px', fontWeight:700, background:`${m.color}12`, color:m.light, border:`1px solid ${m.color}25` }}>{ev.strategyName}</span></td>
                                  <td style={{ padding:'9px 12px', fontFamily:'monospace', fontWeight:700, color:'#e2e8f0' }}>{ev.oldReplicas}→{ev.newReplicas}</td>
                                  <td style={{ padding:'9px 12px', fontWeight:700, color:up?'#34d399':'#f87171' }}>{up?'▲ Scale Up':'▼ Scale Down'}</td>
                                  <td style={{ padding:'9px 12px', color:'#475569' }}>{ev.reason}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  }
                </Card>
              </div>
            )}

            {/* ════════ AUTO-HEAL ════════ */}
            {page==='healing' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', animation:'fadeIn 0.3s ease' }}>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <KPI icon="🛡" label="Mode"         value={healStatus?.armed?'ARMED':'DISARMED'}  color={healStatus?.armed?'#34d399':'#475569'}/>
                  <KPI icon="🔧" label="Total Heals"  value={healStatus?.totalHeals??0}              color="#fbbf24"/>
                  <KPI icon="🐳" label="Active Containers" value={healStatus?.activeContainers??0}  color="#60a5fa"/>
                  <KPI icon="📡" label="Engine"       value={healStatus?.mode||'—'}                  color="#a78bfa"/>
                </div>

                <Card>
                  <SectionHead icon="⚡" title="Controls"/>
                  <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                    {[
                      ['🟢 Arm Auto-Heal',   'arm',   '#34d399', 'rgba(52,211,153,0.1)', armHeal],
                      ['🔴 Disarm',          'disarm','#f87171', 'rgba(239,68,68,0.1)',  disarmHeal],
                      ['💥 Inject Chaos',    'chaos', '#fbbf24', 'rgba(251,191,36,0.1)', injectChaos],
                    ].map(([label,,tc,bg,fn])=>(
                      <button key={label} onClick={fn} style={{ padding:'10px 20px', fontWeight:700, fontSize:'13px', color:tc, background:bg, border:`1px solid ${tc}40`, borderRadius:'10px', cursor:'pointer', transition:'all 0.15s' }}
                        onMouseEnter={e=>{e.target.style.transform='translateY(-1px)';}}
                        onMouseLeave={e=>{e.target.style.transform='translateY(0)';}}>{label}</button>
                    ))}
                  </div>
                </Card>

                <Card>
                  <SectionHead icon="📋" title={`Live Healing Events (${healEvents.length})`}/>
                  {healEvents.length===0
                    ? <Empty emoji="🛡" title="No healing events yet" sub="Arm the engine and inject chaos to see auto-healing in action."/>
                    : (
                      <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'500px', overflowY:'auto' }}>
                        {healEvents.map((ev,i)=>(
                          <div key={i} style={{ background:'rgba(8,13,26,0.7)', border:'1px solid #0f172a', borderRadius:'10px', padding:'12px 14px', display:'flex', gap:'12px', alignItems:'flex-start' }}>
                            <span style={{ fontSize:'20px' }}>{ev.mode==='DOCKER'?'🐳':'🔮'}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ display:'flex', gap:'10px', alignItems:'center', marginBottom:'3px' }}>
                                <span style={{ fontSize:'12px', fontWeight:700, color:STRAT[ev.strategy]?.light||'#e2e8f0' }}>{ev.strategy}</span>
                                <span style={{ fontSize:'10px', fontFamily:'monospace', color:'#334155' }}>{fmtTs(ev.timestamp||ev.time)}</span>
                              </div>
                              <p style={{ fontSize:'12px', color:'#94a3b8' }}>{ev.message}</p>
                            </div>
                            <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'6px', background:'rgba(52,211,153,0.1)', color:'#34d399', border:'1px solid rgba(52,211,153,0.2)', whiteSpace:'nowrap' }}>{ev.mode}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </Card>
              </div>
            )}

            {/* ════════ ALERTS ════════ */}
            {page==='alerts' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', animation:'fadeIn 0.3s ease' }}>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <KPI icon="🚨" label="Unacknowledged" value={alertCount} color="#f87171"/>
                  <KPI icon="✅" label="Acknowledged"   value={alerts.filter(a=>a.acknowledged).length} color="#34d399"/>
                  <KPI icon="📋" label="Total Alerts"   value={alerts.length} color="#60a5fa"/>
                </div>
                <Card>
                  <SectionHead icon="🚨" title="Alert Feed" right={
                    alertCount>0 && <button onClick={async()=>{await Promise.all(alerts.filter(a=>!a.acknowledged).map(a=>ackAlert(a.id)));}} style={{ fontSize:'11px', color:'#34d399', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Acknowledge all ✓</button>
                  }/>
                  {alerts.length===0
                    ? <Empty emoji="✅" title="No alerts fired" sub="Configure rules to monitor CPU, memory, and latency thresholds."/>
                    : (
                      <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'600px', overflowY:'auto' }}>
                        {alerts.map((a,i)=>{
                          const c=SEV[a.severity]||SEV.INFO;
                          return (
                            <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderLeft:`3px solid ${c.text}`, borderRadius:'10px', padding:'12px 14px',
                              display:'flex', gap:'12px', alignItems:'flex-start', opacity:a.acknowledged?0.45:1, transition:'opacity 0.3s' }}>
                              <span style={{ fontSize:'16px' }}>{a.severity==='CRITICAL'?'🚨':a.severity==='WARNING'?'⚠️':'ℹ️'}</span>
                              <div style={{ flex:1 }}>
                                <div style={{ display:'flex', gap:'10px', alignItems:'center', marginBottom:'3px' }}>
                                  <span style={{ fontSize:'11px', fontWeight:800, color:c.text }}>{a.severity}</span>
                                  {a.rule?.name && <span style={{ fontSize:'11px', color:'#475569' }}>{a.rule.name}</span>}
                                  <span style={{ fontSize:'10px', fontFamily:'monospace', color:'#334155', marginLeft:'auto' }}>{fmtTs(a.timestamp||a.firedAt)}</span>
                                </div>
                                <p style={{ fontSize:'12px', color:'#94a3b8' }}>{a.message}</p>
                              </div>
                              {!a.acknowledged && (
                                <button onClick={()=>ackAlert(a.id)} style={{ padding:'3px 10px', background:'rgba(255,255,255,0.05)', border:'1px solid #1e293b', borderRadius:'6px', color:'#475569', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}>Ack ✓</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  }
                </Card>
              </div>
            )}

            {/* ════════ SLA ════════ */}
            {page==='sla' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', animation:'fadeIn 0.3s ease' }}>
                {slaData.length===0
                  ? <Empty emoji="📋" title="No SLA data yet" sub="Run an experiment to generate SLA metrics." action="→ Run Experiment" onClick={()=>setPage('experiment')}/>
                  : (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:'14px' }}>
                        {slaData.map(s=>{
                          const m=STRAT[s.strategy]||STRAT.CPU;
                          return (
                            <Card key={s.strategy} style={{ border:`1px solid ${m.color}25` }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
                                <span style={{ fontSize:'22px' }}>{m.icon}</span>
                                <span style={{ fontWeight:800, color:m.light, fontSize:'15px' }}>{m.label}</span>
                                <span style={{ marginLeft:'auto', fontSize:'20px', fontWeight:900, color:SLA_COLOR(s.slaGrade) }}>{s.slaGrade}</span>
                              </div>
                              <Gauge pct={s.uptimePct} color={m.color} size={100}/>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'16px' }}>
                                {[['Uptime',`${fmt(s.uptimePct)}%`],['Total Ticks',s.totalTicks||0],['Crashes',s.totalCrashes||0],['MTTR',s.mttrMs?`${s.mttrMs}ms`:'—']].map(([l,v])=>(
                                  <div key={l} style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'10px', color:'#334155', marginBottom:'2px' }}>{l}</div>
                                    <div style={{ fontSize:'16px', fontWeight:800, color:'#e2e8f0' }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )
                }
              </div>
            )}

            {/* ════════ CONFIG ════════ */}
            {page==='config' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px', animation:'fadeIn 0.3s ease' }}>
                {Object.keys(configEdit).length===0
                  ? <Empty emoji="⚙️" title="Loading config…" sub="Fetching strategy thresholds from backend."/>
                  : Object.entries(configEdit).map(([strategy, cfg])=>{
                      const m=STRAT[strategy]||STRAT.CPU;
                      return (
                        <Card key={strategy} style={{ border:`1px solid ${m.color}20` }}>
                          <SectionHead icon={m.icon} title={`${strategy} Strategy — Runtime Thresholds`} right={
                            <button onClick={()=>saveCfg(strategy)} style={{ padding:'6px 18px', fontWeight:700, fontSize:'12px',
                              color:savingCfg[strategy]?'#34d399':'#fff', background:savingCfg[strategy]?'rgba(52,211,153,0.15)':'linear-gradient(135deg,#3b82f6,#6366f1)',
                              border:`1px solid ${savingCfg[strategy]?'rgba(52,211,153,0.4)':'transparent'}`, borderRadius:'8px', cursor:'pointer' }}>
                              {savingCfg[strategy]?'✓ Saved':'Save Changes'}
                            </button>
                          }/>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'12px' }}>
                            {Object.entries(cfg||{}).filter(([k])=>!k.startsWith('strategy')).map(([key,val])=>(
                              <div key={key}>
                                <label style={{ fontSize:'11px', color:'#475569', fontWeight:600, textTransform:'capitalize', marginBottom:'6px', display:'block' }}>
                                  {key.replace(/([A-Z])/g,' $1').trim()}
                                </label>
                                <input type="number" value={val??''} step="0.5"
                                  onChange={e=>setConfigEd(p=>({...p,[strategy]:{...p[strategy],[key]:Number(e.target.value)}}))}
                                  style={{ width:'100%', padding:'8px 12px', background:'#080d1a', border:`1px solid ${m.color}30`, borderRadius:'8px', color:'#e2e8f0', fontSize:'13px', outline:'none' }}
                                  onFocus={e=>e.target.style.borderColor=m.color}
                                  onBlur={e=>e.target.style.borderColor=`${m.color}30`}/>
                              </div>
                            ))}
                          </div>
                        </Card>
                      );
                    })
                }
              </div>
            )}

            {/* ════════ AUDIT LOG ════════ */}
            {page==='audit' && (
              <div style={{ animation:'fadeIn 0.3s ease' }}>
                <Card>
                  <SectionHead icon="📝" title={`Audit Log (${auditLog.length} entries)`}/>
                  {auditLog.length===0
                    ? <Empty emoji="📝" title="No audit entries" sub="Actions and experiments will be logged here."/>
                    : (
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #0f172a' }}>
                              {['Time','Level','Action','Entity','Details'].map(h=>(
                                <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#334155', fontWeight:700, fontSize:'10px', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {auditLog.map((e,i)=>(
                              <tr key={i} style={{ borderBottom:'1px solid #0a1020', transition:'background 0.15s' }}
                                onMouseEnter={x=>x.currentTarget.style.background='rgba(255,255,255,0.02)'}
                                onMouseLeave={x=>x.currentTarget.style.background='transparent'}>
                                <td style={{ padding:'9px 12px', color:'#334155', fontFamily:'monospace', whiteSpace:'nowrap' }}>{fmtTs(e.timestamp)}</td>
                                <td style={{ padding:'9px 12px' }}>
                                  <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'6px',
                                    background:e.level==='WARN'||e.level==='ERROR'?'rgba(239,68,68,0.1)':'rgba(59,130,246,0.08)',
                                    color:e.level==='WARN'||e.level==='ERROR'?'#fca5a5':'#93c5fd',
                                    border:`1px solid ${e.level==='WARN'||e.level==='ERROR'?'rgba(239,68,68,0.3)':'rgba(59,130,246,0.2)'}` }}>{e.level||'INFO'}</span>
                                </td>
                                <td style={{ padding:'9px 12px', color:'#94a3b8', whiteSpace:'nowrap' }}>{e.actionType||e.action||'—'}</td>
                                <td style={{ padding:'9px 12px', color:'#60a5fa', whiteSpace:'nowrap' }}>{e.entityType||e.entity||'—'}</td>
                                <td style={{ padding:'9px 12px', color:'#475569', maxWidth:'300px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.details||e.message||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  }
                </Card>
              </div>
            )}

            {/* ════════ HISTORY ════════ */}
            {page==='history' && (
              <div style={{ animation:'fadeIn 0.3s ease' }}>
                {history.length===0
                  ? <Empty emoji="🕐" title="No experiment history" sub="Run experiments to build up a history of results." action="→ Run Experiment" onClick={()=>setPage('experiment')}/>
                  : (
                    <Card>
                      <SectionHead icon="🕐" title={`Experiment History (${history.length} runs)`}/>
                      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                        {history.map((h,i)=>{
                          const m=STRAT[h.bestStrategy]||STRAT.CPU;
                          const cost=h.bestStrategyCostPerHour;
                          return (
                            <div key={i} onClick={()=>{setResult(h);setPage('results');}}
                              style={{ display:'flex', alignItems:'center', gap:'16px', padding:'12px 16px', borderRadius:'11px',
                                cursor:'pointer', border:`1px solid ${m.color}15`, background:`${m.color}05`,
                                transition:'all 0.15s' }}
                              onMouseEnter={e=>{e.currentTarget.style.background=`${m.color}0f`;e.currentTarget.style.borderColor=`${m.color}35`;}}
                              onMouseLeave={e=>{e.currentTarget.style.background=`${m.color}05`;e.currentTarget.style.borderColor=`${m.color}15`;}}>
                              <span style={{ fontSize:'20px' }}>{m.icon}</span>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:800, color:m.light, fontSize:'13px', marginBottom:'2px' }}>{h.bestStrategy} Strategy Won</div>
                                <div style={{ fontSize:'11px', color:'#475569' }}>
                                  Peak CPU {h.peakCpuUsage||'—'}% · {h.sampleCount||'—'} samples
                                  {h.dockerImage && ` · 🐳 ${h.dockerImage}`}
                                </div>
                              </div>
                              {cost && <div style={{ fontSize:'13px', fontWeight:700, color:'#34d399', textAlign:'right', whiteSpace:'nowrap' }}>
                                <div>{fmtUsd(cost)}/hr</div>
                                <div style={{ fontSize:'10px', color:'#475569' }}>AWS cost</div>
                              </div>}
                              <div style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                                <div style={{ fontSize:'11px', color:'#334155', fontFamily:'monospace' }}>{new Date(h.runAt||h.timestamp||0).toLocaleTimeString()}</div>
                                <div style={{ fontSize:'10px', color:'#a5b4fc', marginTop:'2px' }}>View results →</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )
                }
              </div>
            )}

          </main>
        </div>
      </div>

      <Toasts toasts={toasts} dismiss={dismissToast}/>
    </>
  );
}
