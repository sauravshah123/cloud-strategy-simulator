import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const MAX_LIVE = 60;

const STRAT = {
  CPU:     { color:'#3b82f6', light:'#60a5fa', icon:'🖥',  name:'CPU Strategy'     },
  TREND:   { color:'#10b981', light:'#34d399', icon:'📈', name:'Trend Strategy'   },
  LATENCY: { color:'#a855f7', light:'#c084fc', icon:'⏱', name:'Latency Strategy' },
};

// ── tiny helpers ─────────────────────────────────────────
const round1 = v => Math.round((v ?? 0) * 10) / 10;

// ── SVG multi-line chart ──────────────────────────────────
function Chart({ series, height = 120, yLabel = '%', yMax = 100, showDots = false }) {
  const W = 800, H = height;
  const y = v => H - Math.min(1, Math.max(0, v / yMax)) * (H - 4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs>
        {series.map(s => (
          <linearGradient key={s.key} id={`g${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={s.color} stopOpacity="0.02"/>
          </linearGradient>
        ))}
      </defs>
      {[25,50,75].map(p => (
        <line key={p} x1="0" y1={y(p)} x2={W} y2={y(p)} stroke="#0f172a" strokeWidth="1" strokeDasharray="5,4"/>
      ))}
      {series.map(s => {
        if (!s.data || s.data.length < 2) return null;
        const pts = s.data.map((v, i) => [
          (i / (s.data.length - 1)) * W,
          y(v),
        ]);
        const line = pts.map(([x,yy],i) => `${i===0?'M':'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
        const area = `${line} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
        return (
          <g key={s.key}>
            <path d={area} fill={`url(#g${s.key})`}/>
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round"
              style={{ filter:`drop-shadow(0 0 5px ${s.color}70)` }}/>
            {showDots && pts.map(([x,yy], i) => (
              <circle key={i} cx={x} cy={yy} r="4" fill={s.color}
                style={{ filter:`drop-shadow(0 0 4px ${s.color})` }}/>
            ))}
            {!showDots && pts.length > 0 && (
              <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="5"
                fill={s.color} style={{ filter:`drop-shadow(0 0 6px ${s.color})` }}/>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Metric pill ───────────────────────────────────────────
function Pill({ label, value, unit='%', color, icon, sub }) {
  const bad = value > 80, med = value > 50;
  const lvlC = bad ? '#ef4444' : med ? '#f59e0b' : '#34d399';
  const lvl  = bad ? 'HIGH' : med ? 'MED' : 'LOW';
  return (
    <div style={{ background:'rgba(8,13,26,0.9)', border:`1px solid ${color}25`, borderRadius:'13px', padding:'16px 20px', flex:'1 1 150px', display:'flex', flexDirection:'column', gap:'8px' }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:'11px', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{icon} {label}</span>
        {unit === '%' && <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'8px', background:`${lvlC}15`, color:lvlC, border:`1px solid ${lvlC}25`, fontWeight:700 }}>{lvl}</span>}
      </div>
      <div style={{ fontSize:'32px', fontWeight:900, color, lineHeight:1 }}>
        {typeof value === 'number' ? round1(value) : value}
        <span style={{ fontSize:'13px', fontWeight:500, color:'#334155', marginLeft:'2px' }}>{unit}</span>
      </div>
      {unit === '%' && (
        <div style={{ height:'5px', background:'#0f172a', borderRadius:'3px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(100,value||0)}%`, background:`linear-gradient(90deg,${color},${lvlC})`, borderRadius:'3px', transition:'width 1s ease', boxShadow:`0 0 8px ${color}50` }}/>
        </div>
      )}
      {sub && <span style={{ fontSize:'11px', color:'#1e293b' }}>{sub}</span>}
    </div>
  );
}

// ── Progress ring ─────────────────────────────────────────
function Ring({ pct }) {
  const r = 52, c = 2*Math.PI*r;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#0f172a" strokeWidth="8"/>
      <circle cx="60" cy="60" r={r} fill="none" stroke="url(#rg)" strokeWidth="8"
        strokeDasharray={c} strokeDashoffset={c*(1-pct/100)} strokeLinecap="round"
        style={{ transformOrigin:'center', transform:'rotate(-90deg)', transition:'stroke-dashoffset 0.8s ease' }}/>
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
      </defs>
      <text x="60" y="56" textAnchor="middle" fill="#e2e8f0" fontSize="20" fontWeight="900" fontFamily="Inter">{pct}%</text>
      <text x="60" y="72" textAnchor="middle" fill="#475569" fontSize="10" fontFamily="Inter">sampling</text>
    </svg>
  );
}

// ── Strategy comparison bar ───────────────────────────────
function StratBar({ s, isBest, maxLat }) {
  const m   = STRAT[s.strategy] || STRAT.CPU;
  const pct = maxLat > 0 ? (s.averageResponseTime / maxLat) * 100 : 0;
  return (
    <div style={{ background:isBest?`${m.color}0a`:'rgba(8,13,26,0.7)', border:`1px solid ${isBest?m.color+'50':'#0f172a'}`, borderRadius:'13px', padding:'16px 20px', marginBottom:'10px', transition:'all 0.4s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'20px' }}>{m.icon}</span>
        <span style={{ fontWeight:700, color:m.light, fontSize:'14px' }}>{m.name}</span>
        {isBest && <span style={{ padding:'2px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:800, background:`${m.color}20`, border:`1px solid ${m.color}50`, color:m.light, marginLeft:'auto' }}>🏆 WINNER</span>}
        <div style={{ display:'flex', gap:'16px', marginLeft:isBest?'0':'auto' }}>
          <span style={{ fontSize:'12px', color:'#475569' }}>Replicas: <b style={{ color:m.light }}>{s.finalReplicas}</b></span>
          <span style={{ fontSize:'12px', color:'#475569' }}>Events: <b style={{ color:'#94a3b8' }}>{s.scalingEventCount}</b></span>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <span style={{ fontSize:'11px', color:'#334155', minWidth:'80px' }}>Avg latency</span>
        <div style={{ flex:1, height:'8px', background:'#080d1a', borderRadius:'4px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${m.color},${m.light})`, borderRadius:'4px', transition:'width 1.2s ease', boxShadow:`0 0 8px ${m.color}50` }}/>
        </div>
        <span style={{ fontSize:'13px', fontWeight:800, color:'#e2e8f0', minWidth:'75px', textAlign:'right' }}>{round1(s.averageResponseTime)} <span style={{ color:'#334155', fontSize:'11px', fontWeight:400 }}>ms</span></span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConn]    = useState(false);
  const [snap,      setSnap]    = useState(null);
  const [cpuHist,   setCpuH]    = useState(Array(MAX_LIVE).fill(0));
  const [memHist,   setMemH]    = useState(Array(MAX_LIVE).fill(0));
  const [loading,   setLoad]    = useState(false);
  const [progress,  setProg]    = useState(0);
  const [result,    setResult]  = useState(null);
  const [history,   setHistory] = useState([]);
  const [error,     setError]   = useState(null);
  const [tab,       setTab]     = useState('monitor');
  const [loadActive,setLoadAct] = useState(false);
  const [dockerImg, setDocker]  = useState('');
  const sseRef  = useRef(null);
  const progRef = useRef(null);

  // ── SSE with poll fallback ────────────────────────────
  const push = d => {
    setSnap(d);
    setCpuH(p => [...p.slice(1), d.cpuUsage ?? 0]);
    setMemH(p => [...p.slice(1), d.memoryUsage ?? 0]);
  };

  const startPoll = useCallback(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/api/metrics`);
        if (r.ok) { setConn(true); push(await r.json()); }
        else setConn(false);
      } catch { setConn(false); }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API_URL}/api/metrics/stream`);
    let didOpen = false;
    es.onopen    = () => { setConn(true); didOpen = true; };
    es.onmessage = e => { try { push(JSON.parse(e.data)); } catch {} };
    es.onerror   = () => {
      es.close();
      setConn(false);
      if (!didOpen) startPoll(); // SSE blocked, fall back to poll
      else setTimeout(connectSSE, 5000);  // reconnect
    };
    sseRef.current = es;
  }, [startPoll]);

  useEffect(() => { connectSSE(); return () => sseRef.current?.close(); }, [connectSSE]);

  // ── Poll load status ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/api/load/status`);
        if (r.ok) { const d = await r.json(); setLoadAct(d.active); }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // ── History ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/history`).then(r=>r.json()).then(setHistory).catch(()=>{});
  }, [result]);

  // ── Run experiment ────────────────────────────────────
  const run = async () => {
    setLoad(true); setError(null); setProg(0);
    let step = 0;
    const duration = dockerImg ? 30 : 10;
    progRef.current = setInterval(() => {
      step++;
      setProg(Math.min(95, Math.round((step / duration) * 100)));
    }, 1000);
    try {
      const payload = { strategies:['CPU','TREND','LATENCY'] };
      if (dockerImg) payload.dockerImage = dockerImg;

      const res = await fetch(`${API_URL}/api/experiment`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      clearInterval(progRef.current); setProg(100);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTimeout(() => { setResult(data); setTab('results'); setLoad(false); setProg(0); }, 400);
    } catch (e) {
      clearInterval(progRef.current); setLoad(false); setProg(0);
      setError(e.message.includes('fetch') ? 'Cannot reach backend. Wait 30–60s for Render to wake up, then retry.' : `Error: ${e.message}`);
    }
  };

  // ── Load generator ────────────────────────────────────
  const toggleLoad = async () => {
    try {
      const url = loadActive ? `${API_URL}/api/load/stop` : `${API_URL}/api/load/start?durationSeconds=15`;
      const r = await fetch(url, { method:'POST' });
      if (r.ok) { const d = await r.json(); setLoadAct(d.status === 'STARTED'); }
    } catch (e) { setError('Load generator failed: ' + e.message); }
  };
  
  // ── Chaos Crash ───────────────────────────────────────
  const crashContainer = async () => {
    try {
      const r = await fetch(`${API_URL}/api/chaos/crash?strategy=CPU`, { method:'POST' });
      const data = await r.json();
      if (r.ok) alert(data.message);
      else alert("Chaos failed: " + data.message);
    } catch (e) { alert('Chaos API failed: ' + e.message); }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
    Object.assign(document.createElement('a'),{ href:URL.createObjectURL(blob), download:`experiment-${Date.now()}.json` }).click();
  };

  const maxLat = result?.strategies ? Math.max(...result.strategies.map(s => s.averageResponseTime)) : 1;
  const navBtn = active => ({
    padding:'8px 18px', borderRadius:'8px 8px 0 0', fontSize:'13px', fontWeight:600,
    border:'none', cursor:'pointer', background:'transparent',
    color:active?'#a5b4fc':'#475569',
    borderBottom:active?'2px solid #6366f1':'2px solid transparent',
    transition:'all 0.2s',
  });

  return (
    <div style={{ minHeight:'100vh', background:'#060b14', color:'#e2e8f0', fontFamily:"'Inter',-apple-system,sans-serif" }}>
      {/* Glow blobs */}
      <div style={{ position:'fixed', top:'-150px', left:'-150px', width:'500px', height:'500px', background:'radial-gradient(circle,rgba(59,130,246,0.06)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>
      <div style={{ position:'fixed', bottom:'-150px', right:'-150px', width:'500px', height:'500px', background:'radial-gradient(circle,rgba(168,85,247,0.06)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>

      {/* ── Navigation ─────────────────────────────────── */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(6,11,20,0.96)', backdropFilter:'blur(16px)', borderBottom:'1px solid #0f172a', padding:'0 20px', display:'flex', alignItems:'center', height:'58px', gap:'8px', flexWrap:'wrap' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginRight:'8px', flexShrink:0 }}>
          <div style={{ width:'30px', height:'30px', borderRadius:'7px', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', boxShadow:'0 0 14px rgba(99,102,241,0.45)' }}>☁</div>
          <div>
            <div style={{ fontWeight:900, fontSize:'14px', background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>CloudScale</div>
            <div style={{ fontSize:'10px', color:'#1e293b' }}>Industry-Grade Simulator</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'2px' }}>
          {[['monitor','📡 Monitor'],['results','📊 Results'],['history','🕐 History']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={navBtn(tab===t)}>{l}</button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
          {/* Live badge */}
          <div style={{ display:'flex', alignItems:'center', gap:'5px', padding:'4px 11px', borderRadius:'20px', background:connected?'rgba(52,211,153,0.1)':'rgba(239,68,68,0.1)', border:`1px solid ${connected?'#34d39935':'#ef444435'}` }}>
            <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:connected?'#34d399':'#ef4444', boxShadow:connected?'0 0 8px #34d399':'none', display:'inline-block', animation:connected?'pulse 2s infinite':'none' }}/>
            <span style={{ fontSize:'11px', fontWeight:700, color:connected?'#34d399':'#ef4444' }}>{connected?'LIVE':'OFFLINE'}</span>
          </div>

          {/* CPU Load toggle */}
          <button onClick={toggleLoad} style={{ padding:'6px 14px', fontWeight:700, fontSize:'12px', color:loadActive?'#fca5a5':'#94a3b8', background:loadActive?'rgba(239,68,68,0.12)':'rgba(51,65,85,0.3)', border:`1px solid ${loadActive?'rgba(239,68,68,0.35)':'rgba(51,65,85,0.5)'}`, borderRadius:'8px', cursor:'pointer', transition:'all 0.2s' }}>
            {loadActive ? '🔴 Stop Load' : '⚡ Generate Load'}
          </button>

          {/* Swagger docs */}
          <a href={`${API_URL}/swagger-ui.html`} target="_blank" rel="noreferrer"
            style={{ padding:'6px 14px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'8px', color:'#a5b4fc', fontSize:'12px', fontWeight:600, textDecoration:'none' }}>
            📖 API Docs
          </a>

          {result && <button onClick={exportJSON} style={{ padding:'6px 14px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'8px', color:'#34d399', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ Export JSON</button>}

          <button onClick={run} disabled={loading}
            style={{ padding:'8px 20px', fontWeight:700, fontSize:'13px', color:'#fff', background:loading?'#1e293b':'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'9px', cursor:loading?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 18px rgba(99,102,241,0.4)', transition:'all 0.2s', opacity:loading?0.7:1, flexShrink:0 }}>
            {loading?'⚙ Sampling...':'▶ Run Experiment'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'24px 18px', position:'relative', zIndex:1 }}>

        {/* Error */}
        {error && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'12px', padding:'14px 18px', marginBottom:'18px', display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <span style={{ fontSize:'18px' }}>⚠️</span>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700, color:'#fca5a5', marginBottom:'4px' }}>Something went wrong</p>
              <p style={{ fontSize:'12px', color:'#7f1d1d' }}>{error}</p>
            </div>
            <button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:'16px' }}>✕</button>
          </div>
        )}

        {/* Load generator active banner */}
        {loadActive && (
          <div style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'12px 18px', marginBottom:'18px', display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444', boxShadow:'0 0 10px #ef4444', display:'inline-block', animation:'pulse 1s infinite' }}/>
            <span style={{ fontSize:'13px', color:'#fca5a5', fontWeight:600 }}>CPU Load Generator is ACTIVE — watch real CPU spike on the Monitor tab, then run an experiment!</span>
          </div>
        )}

        {/* ──────────────────────────────────────────────── */}
        {/* MONITOR TAB                                     */}
        {/* ──────────────────────────────────────────────── */}
        {tab === 'monitor' && (
          <>
            {!connected && !snap && (
              <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.07),rgba(168,85,247,0.07))', border:'1px solid rgba(99,102,241,0.2)', borderRadius:'16px', padding:'28px', marginBottom:'24px', textAlign:'center' }}>
                <div style={{ fontSize:'44px', marginBottom:'12px' }}>☁️</div>
                <h2 style={{ fontSize:'20px', fontWeight:800, background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:'8px' }}>CloudScale — Industry-Grade Auto-Scaling Simulator</h2>
                <p style={{ color:'#475569', fontSize:'13px', maxWidth:'480px', margin:'0 auto', lineHeight:1.8 }}>
                  Reads <b style={{ color:'#94a3b8' }}>real CPU & memory</b> from the server via SSE stream. Run an experiment to compare 3 auto-scaling strategies against actual server load.
                </p>
                <div style={{ marginTop:'16px', display:'inline-flex', alignItems:'center', gap:'7px', padding:'7px 16px', borderRadius:'20px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
                  <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'pulse 1.5s infinite' }}/>
                  <span style={{ fontSize:'12px', color:'#fca5a5' }}>Connecting… (first load on Render may take 30–60s)</span>
                </div>
              </div>
            )}

            {/* Stat pills */}
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'18px' }}>
              <Pill label="CPU Usage"    value={snap?.cpuUsage}    color="#60a5fa" icon="🖥"/>
              <Pill label="Memory Usage" value={snap?.memoryUsage} color="#a78bfa" icon="🧠"/>
              <Pill label="Stream"  value={connected?'LIVE':'OFF'} unit="" color={connected?'#34d399':'#ef4444'} icon="📡" sub="Server-Sent Events"/>
              <Pill label="Load Gen" value={loadActive?'ACTIVE':'OFF'} unit="" color={loadActive?'#ef4444':'#475569'} icon="⚡" sub={loadActive?'Pinning CPU cores':'Idle'}/>
            </div>

            {/* Live chart */}
            <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'15px', padding:'18px', marginBottom:'18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                <div>
                  <h2 style={{ fontSize:'13px', fontWeight:700, color:'#475569' }}>📈 Live System Metrics</h2>
                  <p style={{ fontSize:'11px', color:'#1e293b', marginTop:'2px' }}>Last {MAX_LIVE} samples · pushed every 2 s via SSE</p>
                </div>
                <div style={{ display:'flex', gap:'14px' }}>
                  {[{l:'CPU',c:'#60a5fa'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                      <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px', boxShadow:`0 0 5px ${x.c}` }}/>{x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', fontSize:'10px', color:'#1e293b', minWidth:'28px', textAlign:'right', paddingBottom:'2px' }}>
                  {['100%','75%','50%','25%','0%'].map(v=><span key={v}>{v}</span>)}
                </div>
                <div style={{ flex:1 }}>
                  <Chart series={[
                    {key:'cpu',data:cpuHist,color:'#60a5fa'},
                    {key:'mem',data:memHist,color:'#a78bfa'},
                  ]} height={150}/>
                </div>
              </div>
            </div>

            {/* Strategy cards */}
            <h3 style={{ fontSize:'12px', fontWeight:700, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'10px' }}>How each strategy works</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:'10px', marginBottom:'24px' }}>
              {Object.entries(STRAT).map(([key,m])=>(
                <div key={key} style={{ background:'rgba(8,13,26,0.8)', border:`1px solid ${m.color}18`, borderRadius:'12px', padding:'16px', transition:'border-color 0.2s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=m.color+'45'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=m.color+'18'}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                    <span style={{ fontSize:'22px' }}>{m.icon}</span>
                    <span style={{ fontWeight:700, color:m.light, fontSize:'13px' }}>{m.name}</span>
                  </div>
                  <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.7 }}>
                    {key==='CPU'    && 'Monitors real processor load. Scales up when CPU > 75%, scales down when < 30%.'}
                    {key==='TREND'  && 'Watches CPU growth rate between samples. Scales proactively before overload hits.'}
                    {key==='LATENCY'&& 'Reacts to response times driven by memory pressure. Aggressive on latency spikes.'}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA */}
            {connected && !loading && (
              <div style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
                <div style={{ background:'rgba(8,13,26,0.6)', border:'1px solid #1e293b', padding:'12px 20px', borderRadius:'12px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', justifyContent:'center' }}>
                  <span style={{ fontSize:'13px', color:'#94a3b8', fontWeight:600 }}>🐳 Run on Docker:</span>
                  <input type="text" placeholder="e.g. nginx:alpine (leave blank for fast host run)" value={dockerImg} onChange={e=>setDocker(e.target.value)}
                    style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid #334155', background:'#060b14', color:'#e2e8f0', fontSize:'13px', width:'280px', outline:'none' }}/>
                  {dockerImg && <button onClick={crashContainer} style={{ padding:'8px 14px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', color:'#fca5a5', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>💥 Chaos Crash (Test Healing)</button>}
                </div>
                
                <button onClick={run} style={{ padding:'14px 36px', fontWeight:800, fontSize:'14px', color:'#fff', background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'12px', cursor:'pointer', boxShadow:'0 6px 26px rgba(99,102,241,0.45)', transition:'transform 0.15s,box-shadow 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 10px 34px rgba(99,102,241,0.55)';}}
                  onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 6px 26px rgba(99,102,241,0.45)';}}>
                  ▶ Run Experiment {dockerImg ? '(~30s)' : '(~10s)'}
                </button>
                <p style={{ marginTop:'8px', fontSize:'12px', color:'#1e293b' }}>
                  💡 Tip: Click <b style={{ color:'#fca5a5' }}>⚡ Generate Load</b> first to make CPU spike, then run the experiment for dramatic results!
                </p>
              </div>
            )}
          </>
        )}

        {/* ──────────────────────────────────────────────── */}
        {/* RESULTS TAB                                     */}
        {/* ──────────────────────────────────────────────── */}
        {tab === 'results' && (
          <>
            {loading && (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <Ring pct={progress}/>
                <p style={{ color:'#475569', fontSize:'14px', marginTop:'18px', fontWeight:600 }}>Capturing real server metrics…</p>
                <p style={{ color:'#334155', fontSize:'12px', marginTop:'4px' }}>10 one-second snapshots from the live OS</p>
                <div style={{ display:'flex', justifyContent:'center', gap:'18px', marginTop:'16px', flexWrap:'wrap' }}>
                  {Object.values(STRAT).map(m=>(
                    <div key={m.name} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#334155' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:m.color, animation:'pulse 1.5s infinite' }}/>{m.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!result && !loading && (
              <div style={{ textAlign:'center', padding:'70px 20px' }}>
                <div style={{ fontSize:'50px', marginBottom:'14px' }}>🧪</div>
                <h2 style={{ fontSize:'18px', fontWeight:800, color:'#1e293b', marginBottom:'8px' }}>No experiment yet</h2>
                <p style={{ fontSize:'13px', color:'#334155', maxWidth:'400px', margin:'0 auto 20px', lineHeight:1.8 }}>
                  Click <b style={{ color:'#a5b4fc' }}>▶ Run Experiment</b> to sample 10 seconds of real CPU &amp; memory and compare all 3 strategies.
                </p>
                <button onClick={()=>setTab('monitor')} style={{ padding:'9px 22px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'9px', color:'#a5b4fc', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>← Back to Monitor</button>
              </div>
            )}

            {result && !loading && (
              <>
                {/* System stat row */}
                <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'18px' }}>
                  {[
                    {label:'Peak CPU',   value:`${result.peakCpuUsage}%`, color:'#f59e0b', icon:'🖥'},
                    {label:'Peak RAM',   value:`${result.peakMemUsage}%`, color:'#a78bfa', icon:'🧠'},
                    {label:'Avg CPU',    value:`${result.avgCpuUsage}%`,  color:'#60a5fa', icon:'📊'},
                    {label:'Samples',    value:result.sampleCount,        color:'#34d399', icon:'📡'},
                    {label:'Winner',     value:result.bestStrategy,       color:STRAT[result.bestStrategy]?.light||'#34d399', icon:'🏆'},
                  ].map(c=>(
                    <div key={c.label} style={{ background:'rgba(8,13,26,0.9)', border:`1px solid ${c.color}20`, borderRadius:'11px', padding:'14px 18px', flex:'1 1 120px' }}>
                      <p style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>{c.icon} {c.label}</p>
                      <p style={{ fontSize:'22px', fontWeight:900, color:c.color }}>{c.value}</p>
                    </div>
                  ))}
                </div>

                {/* CPU / Memory timeline chart */}
                {result.cpuTimeline && (
                  <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'14px', padding:'18px', marginBottom:'18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                      <div>
                        <h2 style={{ fontSize:'13px', fontWeight:700, color:'#475569' }}>📈 CPU & Memory During Experiment</h2>
                        <p style={{ fontSize:'11px', color:'#1e293b', marginTop:'2px' }}>Actual OS readings — one per second</p>
                      </div>
                      <div style={{ display:'flex', gap:'14px' }}>
                        {[{l:'CPU',c:'#f59e0b'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                          <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                            <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px', boxShadow:`0 0 5px ${x.c}` }}/>{x.l}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Chart series={[
                      {key:'cpu',data:result.cpuTimeline,color:'#f59e0b'},
                      {key:'mem',data:result.memTimeline||[],color:'#a78bfa'},
                    ]} height={120} showDots/>
                  </div>
                )}

                {/* Replica timeline chart — all 3 strategies */}
                {result.strategies?.[0]?.replicaTimeline && (
                  <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'14px', padding:'18px', marginBottom:'18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                      <div>
                        <h2 style={{ fontSize:'13px', fontWeight:700, color:'#475569' }}>🔢 Replica Count Over Time — All 3 Strategies</h2>
                        <p style={{ fontSize:'11px', color:'#1e293b', marginTop:'2px' }}>How many servers each strategy would have spun up at each second</p>
                      </div>
                      <div style={{ display:'flex', gap:'14px' }}>
                        {result.strategies.map(s=>(
                          <div key={s.strategy} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                            <div style={{ width:'18px', height:'2px', background:STRAT[s.strategy]?.color||'#60a5fa', borderRadius:'1px', boxShadow:`0 0 5px ${STRAT[s.strategy]?.color||'#60a5fa'}` }}/>{s.strategy}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Chart series={result.strategies.map(s=>({
                      key:s.strategy,
                      data:s.replicaTimeline,
                      color:STRAT[s.strategy]?.color||'#60a5fa',
                    }))} height={120} yMax={Math.max(8,...result.strategies.flatMap(s=>s.replicaTimeline||[]))} showDots/>
                    <p style={{ fontSize:'10px', color:'#1e293b', textAlign:'right', marginTop:'4px' }}>Y-axis = number of server replicas</p>
                  </div>
                )}

                {/* Winner banner */}
                <div style={{ background:`${STRAT[result.bestStrategy]?.color||'#3b82f6'}08`, border:`1px solid ${STRAT[result.bestStrategy]?.color||'#3b82f6'}35`, borderRadius:'14px', padding:'18px 22px', marginBottom:'16px', display:'flex', gap:'14px', alignItems:'flex-start' }}>
                  <span style={{ fontSize:'34px' }}>🏆</span>
                  <div>
                    <p style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px' }}>Under today's real server load, the winner is</p>
                    <p style={{ fontSize:'26px', fontWeight:900, color:STRAT[result.bestStrategy]?.light||'#60a5fa', marginBottom:'6px' }}>{result.bestStrategy} Strategy</p>
                    <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.7 }}>
                      It had the lowest average response time across 10 real server samples (CPU avg: {result.avgCpuUsage}%, RAM peak: {result.peakMemUsage}%).
                    </p>
                  </div>
                </div>

                {/* Strategy bars */}
                <h3 style={{ fontSize:'12px', fontWeight:700, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'10px' }}>Strategy Comparison — sorted best → worst</h3>
                {result.strategies?.map(s=><StratBar key={s.strategy} s={s} isBest={s.strategy===result.bestStrategy} maxLat={maxLat}/>)}

                {/* Events table */}
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'18px', marginTop:'16px' }}>
                  <h3 style={{ fontSize:'12px', fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'12px' }}>
                    📋 Scaling Events — {result.bestStrategy} (Winner) · {result.scalingEvents?.length||0} events
                  </h3>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #080d1a' }}>
                          {['Time','Strategy','Servers','Reason'].map(h=>(
                            <th key={h} style={{ padding:'7px 12px', textAlign:'left', color:'#1e293b', fontWeight:700, textTransform:'uppercase', fontSize:'10px', letterSpacing:'0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!result.scalingEvents?.length
                          ? <tr><td colSpan={4} style={{ padding:'24px', textAlign:'center', color:'#1e293b' }}>✅ No scaling triggered — load was stable.</td></tr>
                          : result.scalingEvents.map((ev,i)=>{
                              const m=STRAT[ev.strategyName]||STRAT.CPU, up=ev.newReplicas>ev.oldReplicas;
                              return (
                                <tr key={i} style={{ borderBottom:'1px solid #080d1a', transition:'background 0.15s' }}
                                  onMouseEnter={e=>e.currentTarget.style.background='rgba(15,23,42,0.7)'}
                                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                  <td style={{ padding:'9px 12px', color:'#334155', fontFamily:'monospace' }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                                  <td style={{ padding:'9px 12px' }}><span style={{ padding:'2px 9px', borderRadius:'20px', fontSize:'10px', fontWeight:700, background:`${m.color}12`, color:m.light, border:`1px solid ${m.color}22` }}>{ev.strategyName}</span></td>
                                  <td style={{ padding:'9px 12px', fontFamily:'monospace' }}>
                                    <span style={{ color:'#334155' }}>{ev.oldReplicas}</span>
                                    <span style={{ margin:'0 6px', color:'#1e293b' }}>→</span>
                                    <span style={{ color:up?'#34d399':'#f87171', fontWeight:800 }}>{ev.newReplicas} {up?'▲':'▼'}</span>
                                  </td>
                                  <td style={{ padding:'9px 12px', color:'#475569' }}>{ev.reason}</td>
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

        {/* ──────────────────────────────────────────────── */}
        {/* HISTORY TAB                                     */}
        {/* ──────────────────────────────────────────────── */}
        {tab === 'history' && (
          <>
            <h2 style={{ fontSize:'12px', fontWeight:700, color:'#1e293b', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'14px' }}>🕐 Past Experiments — last 10 runs</h2>
            {history.length === 0
              ? <div style={{ textAlign:'center', padding:'60px', color:'#1e293b' }}><div style={{ fontSize:'36px', marginBottom:'12px' }}>🕐</div><p>No experiments yet — run your first!</p></div>
              : history.map((h,i)=>{
                  const m=STRAT[h.bestStrategy]||STRAT.CPU;
                  return (
                    <div key={i} style={{ background:'rgba(8,13,26,0.8)', border:'1px solid #0f172a', borderRadius:'11px', padding:'14px 18px', marginBottom:'8px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap', transition:'border-color 0.2s' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='#1e293b'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor='#0f172a'}>
                      <span style={{ fontSize:'11px', color:'#1e293b', fontFamily:'monospace', minWidth:'75px' }}>{new Date(h.runAt).toLocaleTimeString()}</span>
                      <span style={{ fontWeight:800, color:m.light, fontSize:'13px' }}>{m.icon} {h.bestStrategy} won</span>
                      <span style={{ fontSize:'12px', color:'#334155' }}>CPU: <b style={{ color:'#f59e0b' }}>{h.peakCpuUsage}%</b></span>
                      <span style={{ fontSize:'12px', color:'#334155' }}>RAM: <b style={{ color:'#a78bfa' }}>{h.peakMemUsage}%</b></span>
                      <button onClick={()=>{setResult(h);setTab('results');}}
                        style={{ marginLeft:'auto', padding:'5px 14px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:'7px', color:'#a5b4fc', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                        View →
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
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#060b14; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:3px; }
      `}</style>
    </div>
  );
}
