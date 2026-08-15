import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const MAX_POINTS = 60;
const SAMPLE_STEPS = 10; // 10 seconds experiment

const STRATEGIES = {
  CPU:     { color: '#3b82f6', light: '#60a5fa', icon: '🖥',  name: 'CPU Strategy',     short: 'CPU',
    desc: 'Watches how hard your processor is working. Adds more servers when CPU gets too hot (>75%).',
    trigger: 'CPU > 75%  → Scale UP  |  CPU < 30% → Scale DOWN' },
  TREND:   { color: '#10b981', light: '#34d399', icon: '📈', name: 'Trend Strategy',   short: 'TREND',
    desc: 'Predicts future load by watching how fast CPU is rising. Scales proactively before problems hit.',
    trigger: 'Rising trend > 1.2x → Scale UP' },
  LATENCY: { color: '#a855f7', light: '#c084fc', icon: '⏱', name: 'Latency Strategy', short: 'LATENCY',
    desc: 'Tracks response times driven by memory pressure. Scales when users would start feeling slowness.',
    trigger: 'Latency > 300 ms → Scale UP' },
};

// ─────────────────────────────────────────────────────────
// SVG Line Chart
// ─────────────────────────────────────────────────────────
function LineChart({ series, height = 140 }) {
  const W = 800, H = height;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      <defs>
        {series.map(s => (
          <linearGradient key={s.key} id={`lg-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>
      {[25, 50, 75].map(pct => (
        <line key={pct} x1="0" y1={H*(1-pct/100)} x2={W} y2={H*(1-pct/100)}
          stroke="#0f172a" strokeWidth="1" strokeDasharray="6,4" />
      ))}
      {series.map(s => {
        if (!s.data || s.data.length < 2) return null;
        const pts = s.data.map((v, i) => [
          (i / (MAX_POINTS - 1)) * W,
          H - Math.min(1, v / 100) * H,
        ]);
        const line = pts.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const area = `${line} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
        return (
          <g key={s.key}>
            <path d={area} fill={`url(#lg-${s.key})`} />
            <path d={line}  fill="none" stroke={s.color} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${s.color}70)` }} />
            {/* Current value dot */}
            {pts.length > 0 && (
              <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="4"
                fill={s.color} style={{ filter: `drop-shadow(0 0 6px ${s.color})` }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// Metric Pill
// ─────────────────────────────────────────────────────────
function MetricPill({ label, value, unit, color, icon }) {
  const lvl   = value > 80 ? 'HIGH' : value > 50 ? 'MED' : 'LOW';
  const lvlClr = value > 80 ? '#ef4444' : value > 50 ? '#f59e0b' : '#34d399';
  return (
    <div style={{ display:'flex', flexDirection:'column', background:'rgba(8,13,26,0.9)', border:`1px solid ${color}25`, borderRadius:'14px', padding:'18px 22px', flex:'1 1 160px', gap:'8px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'12px', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{icon} {label}</span>
        <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'8px', background:`${lvlClr}18`, color:lvlClr, border:`1px solid ${lvlClr}30`, fontWeight:700 }}>{lvl}</span>
      </div>
      <div style={{ fontSize:'34px', fontWeight:900, color, lineHeight:1 }}>
        {value != null ? value.toFixed(1) : '--'}
        <span style={{ fontSize:'14px', fontWeight:500, color:'#334155' }}>{unit}</span>
      </div>
      <div style={{ height:'6px', background:'#0f172a', borderRadius:'3px', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min(100,value||0)}%`, background:`linear-gradient(90deg,${color},${lvlClr})`, borderRadius:'3px', transition:'width 1s ease', boxShadow:`0 0 8px ${color}50` }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Strategy Result Bar
// ─────────────────────────────────────────────────────────
function StratBar({ s, isBest, maxLat }) {
  const meta = STRATEGIES[s.strategy] || STRATEGIES.CPU;
  const pct  = maxLat > 0 ? (s.averageResponseTime / maxLat) * 100 : 0;
  return (
    <div style={{ background: isBest ? `${meta.color}10` : 'rgba(8,13,26,0.7)', border:`1px solid ${isBest ? meta.color+'50' : '#0f172a'}`, borderRadius:'14px', padding:'18px 20px', marginBottom:'10px', transition:'all 0.4s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'22px' }}>{meta.icon}</span>
        <span style={{ fontWeight:700, color:meta.light, fontSize:'15px' }}>{meta.name}</span>
        {isBest && (
          <span style={{ padding:'3px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:800, background:`${meta.color}20`, border:`1px solid ${meta.color}50`, color:meta.light, marginLeft:'auto' }}>
            🏆 WINNER — Best for this load
          </span>
        )}
        <div style={{ display:'flex', gap:'20px', marginLeft: isBest ? '0' : 'auto' }}>
          <span style={{ fontSize:'12px', color:'#475569' }}>Final servers: <b style={{ color:meta.light }}>{s.finalReplicas}</b></span>
          <span style={{ fontSize:'12px', color:'#475569' }}>Scaling events: <b style={{ color:'#94a3b8' }}>{s.scalingEventCount}</b></span>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
        <span style={{ fontSize:'11px', color:'#334155', minWidth:'90px' }}>Avg latency</span>
        <div style={{ flex:1, height:'10px', background:'#080d1a', borderRadius:'5px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${meta.color},${meta.light})`, borderRadius:'5px', transition:'width 1.2s ease', boxShadow:`0 0 10px ${meta.color}50` }} />
        </div>
        <span style={{ fontSize:'14px', fontWeight:800, color:'#e2e8f0', minWidth:'80px', textAlign:'right' }}>
          {s.averageResponseTime.toFixed(1)} <span style={{ fontWeight:400, color:'#334155', fontSize:'11px' }}>ms</span>
        </span>
      </div>
      <p style={{ fontSize:'12px', color:'#334155', marginTop:'10px', lineHeight:1.6 }}>{meta.desc}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Progress Bar (during experiment)
// ─────────────────────────────────────────────────────────
function ProgressRing({ pct }) {
  const r = 54, c = 2*Math.PI*r;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="#0f172a" strokeWidth="8" />
      <circle cx="65" cy="65" r={r} fill="none" stroke="url(#pgr)" strokeWidth="8"
        strokeDasharray={c} strokeDashoffset={c*(1-pct/100)} strokeLinecap="round"
        style={{ transformOrigin:'center', transform:'rotate(-90deg)', transition:'stroke-dashoffset 0.9s ease' }} />
      <defs>
        <linearGradient id="pgr" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <text x="65" y="60" textAnchor="middle" fill="#e2e8f0" fontSize="22" fontWeight="900" fontFamily="Inter">{pct}%</text>
      <text x="65" y="80" textAnchor="middle" fill="#475569" fontSize="11" fontFamily="Inter">sampling</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected]  = useState(false);
  const [cpuData,   setCpuData]    = useState(Array(MAX_POINTS).fill(0));
  const [memData,   setMemData]    = useState(Array(MAX_POINTS).fill(0));
  const [snap,      setSnap]       = useState(null);
  const [loading,   setLoading]    = useState(false);
  const [progress,  setProgress]   = useState(0);
  const [result,    setResult]     = useState(null);
  const [history,   setHistory]    = useState([]);
  const [error,     setError]      = useState(null);
  const [tab,       setTab]        = useState('monitor');
  const [tooltip,   setTooltip]    = useState(null);
  const sseRef = useRef(null);
  const progRef = useRef(null);

  // ── SSE with polling fallback ──────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    try {
      const es = new EventSource(`${API_URL}/api/metrics/stream`);
      es.onopen    = () => setConnected(true);
      es.onerror   = () => {
        setConnected(false);
        es.close();
        // fallback: poll every 3s
        const id = setInterval(async () => {
          try {
            const r = await fetch(`${API_URL}/api/metrics`);
            if (r.ok) {
              const d = await r.json();
              setConnected(true);
              handleMetric(d);
            }
          } catch (_) { setConnected(false); }
        }, 3000);
        return () => clearInterval(id);
      };
      es.onmessage = e => {
        try { handleMetric(JSON.parse(e.data)); } catch (_) {}
      };
      sseRef.current = es;
    } catch (_) { setConnected(false); }
  }, []);

  const handleMetric = d => {
    setSnap(d);
    setCpuData(prev => [...prev.slice(1), d.cpuUsage  ?? 0]);
    setMemData(prev => [...prev.slice(1), d.memoryUsage ?? 0]);
  };

  useEffect(() => { connectSSE(); return () => sseRef.current?.close(); }, [connectSSE]);
  useEffect(() => {
    fetch(`${API_URL}/api/history`).then(r=>r.json()).then(setHistory).catch(()=>{});
  }, [result]);

  // ── Run experiment with animated progress ─────────────
  const runExperiment = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);

    // Animate progress ring over ~SAMPLE_STEPS seconds
    let step = 0;
    progRef.current = setInterval(() => {
      step++;
      setProgress(Math.min(95, Math.round((step / SAMPLE_STEPS) * 100)));
    }, 1000);

    try {
      const res = await fetch(`${API_URL}/api/experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies: ['CPU', 'TREND', 'LATENCY'] }),
      });
      clearInterval(progRef.current);
      setProgress(100);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setTimeout(() => {
        setResult(data);
        setTab('results');
        setLoading(false);
        setProgress(0);
      }, 500);
    } catch (e) {
      clearInterval(progRef.current);
      setLoading(false);
      setProgress(0);
      setError(e.message.includes('Failed to fetch')
        ? 'Cannot reach the backend. If on Render free tier, wait 30–60 seconds for it to wake up, then try again.'
        : `Experiment failed: ${e.message}`);
    }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type:'application/json' });
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download:`experiment-${Date.now()}.json` }).click();
  };

  const maxLat = result?.strategies ? Math.max(...result.strategies.map(s=>s.averageResponseTime)) : 1;
  const navStyle = active => ({
    padding:'8px 18px', borderRadius:'8px 8px 0 0', fontSize:'13px', fontWeight:600,
    border:'none', cursor:'pointer', background:'transparent',
    color: active ? '#a5b4fc' : '#475569',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    transition:'all 0.2s',
  });

  return (
    <div style={{ minHeight:'100vh', background:'#060b14', color:'#e2e8f0', fontFamily:"'Inter',-apple-system,sans-serif" }}>

      {/* Ambient blobs */}
      <div style={{ position:'fixed', top:'-200px', left:'-200px', width:'600px', height:'600px', background:'radial-gradient(circle,rgba(59,130,246,0.05)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', bottom:'-200px', right:'-200px', width:'600px', height:'600px', background:'radial-gradient(circle,rgba(168,85,247,0.05)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }} />

      {/* ── Nav ─────────────────────────────────────────── */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(6,11,20,0.95)', backdropFilter:'blur(14px)', borderBottom:'1px solid #0f172a', padding:'0 24px', display:'flex', alignItems:'center', height:'60px', gap:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginRight:'8px' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', boxShadow:'0 0 16px rgba(99,102,241,0.4)' }}>☁</div>
          <div>
            <div style={{ fontWeight:900, fontSize:'15px', background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.1 }}>CloudScale</div>
            <div style={{ fontSize:'10px', color:'#334155', lineHeight:1 }}>Auto-scaling Simulator</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'2px', borderBottom:'2px solid #0f172a' }}>
          {[['monitor','📡 Monitor'],['results','📊 Results'],['history','🕐 History']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={navStyle(tab===t)}>{l}</button>
          ))}
        </div>

        {/* Right side */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          {/* Connection badge */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 12px', borderRadius:'20px', background: connected ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', border:`1px solid ${connected ? '#34d39940':'#ef444440'}` }}>
            <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:connected?'#34d399':'#ef4444', boxShadow:connected?'0 0 8px #34d399':'none', display:'inline-block', animation:connected?'pulse 2s infinite':'none' }} />
            <span style={{ fontSize:'11px', fontWeight:700, color:connected?'#34d399':'#ef4444' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          {result && <button onClick={exportJSON} style={{ padding:'7px 14px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:'8px', color:'#a5b4fc', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ Export JSON</button>}
          <button onClick={runExperiment} disabled={loading}
            style={{ padding:'9px 22px', fontWeight:700, fontSize:'13px', color:'#fff', background:loading?'#1e293b':'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'9px', cursor:loading?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 18px rgba(99,102,241,0.4)', transition:'all 0.2s', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⚙ Running...' : '▶ Run Experiment'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'28px 20px', position:'relative', zIndex:1 }}>

        {/* ── Error Banner ──────────────────────────────── */}
        {error && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'16px 20px', marginBottom:'20px', display:'flex', gap:'12px', alignItems:'flex-start' }}>
            <span style={{ fontSize:'20px' }}>⚠️</span>
            <div>
              <p style={{ fontWeight:700, color:'#fca5a5', marginBottom:'4px' }}>Something went wrong</p>
              <p style={{ fontSize:'13px', color:'#7f1d1d' }}>{error}</p>
              <button onClick={()=>setError(null)} style={{ marginTop:'10px', padding:'5px 14px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'7px', color:'#fca5a5', fontSize:'12px', cursor:'pointer' }}>Dismiss</button>
            </div>
          </div>
        )}

        {/* ── MONITOR TAB ───────────────────────────────── */}
        {tab === 'monitor' && (
          <>
            {/* Welcome banner (first load, not connected yet) */}
            {!connected && !snap && (
              <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(168,85,247,0.08))', border:'1px solid rgba(99,102,241,0.2)', borderRadius:'16px', padding:'28px', marginBottom:'24px', textAlign:'center' }}>
                <div style={{ fontSize:'48px', marginBottom:'12px' }}>☁️</div>
                <h2 style={{ fontSize:'22px', fontWeight:800, background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'8px' }}>Welcome to CloudScale Simulator</h2>
                <p style={{ color:'#475569', fontSize:'14px', maxWidth:'500px', margin:'0 auto', lineHeight:1.7 }}>
                  This platform reads <b style={{ color:'#94a3b8' }}>real CPU and memory</b> from the server it's running on, then figures out which auto-scaling strategy would keep your app fast under that exact load.
                </p>
                <div style={{ marginTop:'20px', display:'inline-flex', alignItems:'center', gap:'8px', padding:'8px 18px', borderRadius:'20px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)' }}>
                  <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'pulse 1.5s infinite' }} />
                  <span style={{ fontSize:'12px', color:'#fca5a5' }}>Connecting to backend... (may take 30-60s if just woke up)</span>
                </div>
              </div>
            )}

            {/* Metric pills */}
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'20px' }}>
              <MetricPill label="CPU Usage"    value={snap?.cpuUsage}    unit="%" color="#60a5fa" icon="🖥" />
              <MetricPill label="Memory Usage" value={snap?.memoryUsage} unit="%" color="#a78bfa" icon="🧠" />
              <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', background:'rgba(8,13,26,0.9)', border:'1px solid #0f172a', borderRadius:'14px', padding:'18px 22px', flex:'0 0 auto', gap:'6px', minWidth:'160px' }}>
                <span style={{ fontSize:'12px', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>⏱ Updates</span>
                <span style={{ fontSize:'22px', fontWeight:900, color:'#34d399' }}>Every 2s</span>
                <span style={{ fontSize:'11px', color:'#1e293b' }}>via Server-Sent Events</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', background:'rgba(8,13,26,0.9)', border:'1px solid #0f172a', borderRadius:'14px', padding:'18px 22px', flex:'0 0 auto', gap:'6px', minWidth:'160px' }}>
                <span style={{ fontSize:'12px', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>📦 Source</span>
                <span style={{ fontSize:'22px', fontWeight:900, color:'#f59e0b' }}>Real OS</span>
                <span style={{ fontSize:'11px', color:'#1e293b' }}>No simulation</span>
              </div>
            </div>

            {/* Live chart */}
            <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'16px', padding:'20px', marginBottom:'20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', flexWrap:'wrap', gap:'8px' }}>
                <div>
                  <h2 style={{ fontSize:'14px', fontWeight:700, color:'#94a3b8' }}>📈 Live System Metrics — last 60 readings</h2>
                  <p style={{ fontSize:'11px', color:'#334155', marginTop:'3px' }}>Each dot = one 2-second sample from the real server</p>
                </div>
                <div style={{ display:'flex', gap:'16px' }}>
                  {[{l:'CPU',c:'#60a5fa'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#475569' }}>
                      <div style={{ width:'20px', height:'3px', background:x.c, borderRadius:'2px', boxShadow:`0 0 6px ${x.c}` }} />
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', fontSize:'10px', color:'#1e293b', paddingBottom:'2px', minWidth:'30px', textAlign:'right' }}>
                  {['100%','75%','50%','25%','0%'].map(v=><span key={v}>{v}</span>)}
                </div>
                <div style={{ flex:1 }}>
                  <LineChart series={[
                    { key:'cpu', data:cpuData, color:'#60a5fa' },
                    { key:'mem', data:memData, color:'#a78bfa' },
                  ]} height={160} />
                </div>
              </div>
            </div>

            {/* Strategy cards */}
            <h3 style={{ fontSize:'13px', fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'12px' }}>How each strategy works</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'12px' }}>
              {Object.entries(STRATEGIES).map(([key, meta]) => (
                <div key={key} style={{ background:'rgba(8,13,26,0.8)', border:`1px solid ${meta.color}20`, borderRadius:'13px', padding:'18px', transition:'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = meta.color + '50'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = meta.color + '20'}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                    <span style={{ fontSize:'24px' }}>{meta.icon}</span>
                    <span style={{ fontWeight:700, color:meta.light, fontSize:'14px' }}>{meta.name}</span>
                  </div>
                  <p style={{ fontSize:'13px', color:'#475569', lineHeight:1.7, marginBottom:'10px' }}>{meta.desc}</p>
                  <div style={{ padding:'8px 12px', background:`${meta.color}08`, border:`1px solid ${meta.color}15`, borderRadius:'8px', fontSize:'11px', color:`${meta.color}90`, fontFamily:'monospace' }}>
                    {meta.trigger}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            {connected && !loading && (
              <div style={{ marginTop:'24px', textAlign:'center' }}>
                <button onClick={runExperiment} style={{ padding:'14px 36px', fontWeight:800, fontSize:'15px', color:'#fff', background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'12px', cursor:'pointer', boxShadow:'0 6px 28px rgba(99,102,241,0.45)', transition:'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 36px rgba(99,102,241,0.55)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 6px 28px rgba(99,102,241,0.45)'; }}>
                  ▶ Run Experiment Now (~{SAMPLE_STEPS}s)
                </button>
                <p style={{ marginTop:'10px', fontSize:'12px', color:'#334155' }}>
                  Captures {SAMPLE_STEPS} real CPU & memory snapshots, then tells you which strategy wins.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── RESULTS TAB ───────────────────────────────── */}
        {tab === 'results' && (
          <>
            {/* Loading state with progress ring */}
            {loading && (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <ProgressRing pct={progress} />
                <p style={{ color:'#475569', fontSize:'14px', marginTop:'20px', marginBottom:'6px', fontWeight:600 }}>
                  Sampling real server metrics...
                </p>
                <p style={{ color:'#334155', fontSize:'12px' }}>
                  Collecting {SAMPLE_STEPS} one-second snapshots of actual CPU & memory
                </p>
                <div style={{ marginTop:'20px', display:'flex', justifyContent:'center', gap:'20px', flexWrap:'wrap' }}>
                  {Object.entries(STRATEGIES).map(([k,m])=>(
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#334155' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:m.color, animation:'pulse 1.5s infinite' }} />
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No results yet */}
            {!result && !loading && (
              <div style={{ textAlign:'center', padding:'80px 20px' }}>
                <div style={{ fontSize:'56px', marginBottom:'16px' }}>🧪</div>
                <h2 style={{ fontSize:'20px', fontWeight:800, color:'#1e293b', marginBottom:'10px' }}>No experiment run yet</h2>
                <p style={{ fontSize:'14px', color:'#334155', maxWidth:'400px', margin:'0 auto 24px', lineHeight:1.7 }}>
                  Click Run Experiment to capture real server metrics and compare all three auto-scaling strategies.
                </p>
                <button onClick={()=>setTab('monitor')} style={{ padding:'10px 24px', background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:'9px', color:'#a5b4fc', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
                  ← Back to Monitor
                </button>
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <>
                {/* System metrics row */}
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'20px' }}>
                  {[
                    { label:'Peak CPU (real)',   value:`${result.peakCpuUsage}%`,  color:'#f59e0b', icon:'🖥' },
                    { label:'Peak RAM (real)',   value:`${result.peakMemUsage}%`,  color:'#a78bfa', icon:'🧠' },
                    { label:'Avg CPU (real)',    value:`${result.avgCpuUsage}%`,   color:'#60a5fa', icon:'📊' },
                    { label:'Samples taken',    value:result.sampleCount,         color:'#34d399', icon:'📡' },
                  ].map(c => (
                    <div key={c.label} style={{ background:'rgba(8,13,26,0.9)', border:`1px solid ${c.color}20`, borderRadius:'12px', padding:'16px 20px', flex:'1 1 140px' }}>
                      <p style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>{c.icon} {c.label}</p>
                      <p style={{ fontSize:'24px', fontWeight:900, color:c.color }}>{c.value}</p>
                    </div>
                  ))}
                </div>

                {/* What this means (plain English) */}
                <div style={{ background:`${STRATEGIES[result.bestStrategy]?.color || '#3b82f6'}08`, border:`1px solid ${STRATEGIES[result.bestStrategy]?.color || '#3b82f6'}30`, borderRadius:'14px', padding:'20px', marginBottom:'20px', display:'flex', gap:'16px', alignItems:'flex-start' }}>
                  <span style={{ fontSize:'36px' }}>🏆</span>
                  <div>
                    <p style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>Under today's server load, the winner is</p>
                    <p style={{ fontSize:'28px', fontWeight:900, color: STRATEGIES[result.bestStrategy]?.light || '#60a5fa', marginBottom:'8px' }}>{result.bestStrategy} Strategy</p>
                    <p style={{ fontSize:'13px', color:'#475569', lineHeight:1.7 }}>
                      {STRATEGIES[result.bestStrategy]?.desc} It responded best to the real CPU ({result.avgCpuUsage}%) and memory ({result.avgMemUsage}%) conditions on this server.
                    </p>
                  </div>
                </div>

                {/* Comparison bars */}
                <h3 style={{ fontSize:'13px', fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'12px' }}>
                  Strategy Comparison — sorted by performance
                </h3>
                {result.strategies?.sort((a,b)=>a.averageResponseTime-b.averageResponseTime).map(s=>(
                  <StratBar key={s.strategy} s={s} isBest={s.strategy===result.bestStrategy} maxLat={maxLat} />
                ))}

                {/* Scaling events table */}
                <div style={{ background:'rgba(8,13,26,0.8)', border:'1px solid #0f172a', borderRadius:'14px', padding:'20px', marginTop:'20px' }}>
                  <h3 style={{ fontSize:'13px', fontWeight:700, color:'#334155', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'14px' }}>
                    📋 Scaling Events — {result.bestStrategy} (Winner)
                    <span style={{ marginLeft:'8px', fontWeight:400, color:'#1e293b' }}>({result.scalingEvents?.length||0} times it added/removed servers)</span>
                  </h3>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #080d1a' }}>
                          {['Time','Strategy','Servers','What happened'].map(h=>(
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#1e293b', fontWeight:700, textTransform:'uppercase', fontSize:'10px', letterSpacing:'0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(!result.scalingEvents?.length)
                          ? <tr><td colSpan={4} style={{ padding:'28px', textAlign:'center', color:'#1e293b' }}>✅ No scaling needed — load was stable throughout.</td></tr>
                          : result.scalingEvents.map((ev,i)=>{
                              const meta = STRATEGIES[ev.strategyName]||STRATEGIES.CPU;
                              const up   = ev.newReplicas > ev.oldReplicas;
                              return (
                                <tr key={i} style={{ borderBottom:'1px solid #080d1a', transition:'background 0.15s' }}
                                  onMouseEnter={e=>e.currentTarget.style.background='rgba(15,23,42,0.8)'}
                                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                  <td style={{ padding:'10px 12px', color:'#334155', fontFamily:'monospace' }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                                  <td style={{ padding:'10px 12px' }}><span style={{ padding:'2px 10px', borderRadius:'20px', fontSize:'10px', fontWeight:700, background:`${meta.color}12`, color:meta.light, border:`1px solid ${meta.color}25` }}>{ev.strategyName}</span></td>
                                  <td style={{ padding:'10px 12px', fontFamily:'monospace' }}>
                                    <span style={{ color:'#334155' }}>{ev.oldReplicas}</span>
                                    <span style={{ margin:'0 8px', color:'#1e293b' }}>→</span>
                                    <span style={{ color:up?'#34d399':'#f87171', fontWeight:800 }}>{ev.newReplicas} {up?'▲ scaled up':'▼ scaled down'}</span>
                                  </td>
                                  <td style={{ padding:'10px 12px', color:'#475569' }}>{ev.reason}</td>
                                </tr>
                              );
                            })
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── HISTORY TAB ───────────────────────────────── */}
        {tab === 'history' && (
          <>
            <h2 style={{ fontSize:'14px', fontWeight:700, color:'#475569', marginBottom:'16px', textTransform:'uppercase', letterSpacing:'0.07em' }}>🕐 Past Experiments (last 10)</h2>
            {history.length === 0
              ? (
                <div style={{ textAlign:'center', padding:'60px', color:'#1e293b' }}>
                  <div style={{ fontSize:'40px', marginBottom:'12px' }}>🕐</div>
                  <p>No history yet — run your first experiment!</p>
                </div>
              )
              : history.map((h,i) => {
                  const meta = STRATEGIES[h.bestStrategy] || STRATEGIES.CPU;
                  return (
                    <div key={i} style={{ background:'rgba(8,13,26,0.8)', border:'1px solid #0f172a', borderRadius:'12px', padding:'16px 20px', marginBottom:'10px', display:'flex', alignItems:'center', gap:'16px', flexWrap:'wrap', transition:'border-color 0.2s' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='#1e293b'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor='#0f172a'}>
                      <span style={{ fontSize:'11px', color:'#1e293b', fontFamily:'monospace', minWidth:'80px' }}>{new Date(h.runAt).toLocaleTimeString()}</span>
                      <span style={{ fontWeight:800, color:meta.light, fontSize:'14px' }}>{meta.icon} {h.bestStrategy} won</span>
                      <span style={{ fontSize:'12px', color:'#334155' }}>CPU peak: <b style={{ color:'#f59e0b' }}>{h.peakCpuUsage}%</b></span>
                      <span style={{ fontSize:'12px', color:'#334155' }}>RAM peak: <b style={{ color:'#a78bfa' }}>{h.peakMemUsage}%</b></span>
                      <button onClick={()=>{setResult(h);setTab('results');}}
                        style={{ marginLeft:'auto', padding:'6px 16px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'8px', color:'#a5b4fc', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                        View details →
                      </button>
                    </div>
                  );
                })
            }
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:#080d1a; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:3px; }
      `}</style>
    </div>
  );
}
