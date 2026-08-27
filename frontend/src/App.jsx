import { useState, useEffect, useRef, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const MAX_LIVE = 60;

const STRAT = {
  CPU:     { color:'#3b82f6', light:'#93c5fd', icon:'🖥',  label:'CPU Strategy'     },
  TREND:   { color:'#10b981', light:'#6ee7b7', icon:'📈', label:'Trend Strategy'   },
  LATENCY: { color:'#a855f7', light:'#d8b4fe', icon:'⏱', label:'Latency Strategy' },
};

const SEVERITY_COLORS = {
  CRITICAL: { bg:'rgba(239,68,68,0.1)',  border:'rgba(239,68,68,0.35)',  text:'#fca5a5' },
  WARNING:  { bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.3)',  text:'#fcd34d' },
  INFO:     { bg:'rgba(59,130,246,0.1)', border:'rgba(59,130,246,0.3)',  text:'#93c5fd' },
};

const fmt = v => typeof v === 'number' ? (Math.round(v * 10) / 10) : (v ?? '—');
const fmtUsd = v => `$${(v ?? 0).toFixed(4)}`;
const fmtPct = v => `${fmt(v)}%`;

// ── Tiny SVG line chart ──────────────────────────────────
function Spark({ data, color, height = 48 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const W = 240, H = height;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - (v / max) * (H - 4) - 2,
  ]);
  const line = pts.map(([x,y], i) => `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${color.replace('#','')})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2"
        style={{ filter:`drop-shadow(0 0 4px ${color}80)` }} />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="4"
        fill={color} style={{ filter:`drop-shadow(0 0 5px ${color})` }} />
    </svg>
  );
}

// ── Full-width SVG chart (multi-series) ──────────────────
function Chart({ series, height=120, yMax=100, showDots=false }) {
  const W=800, H=height;
  const y = v => H - Math.min(1, Math.max(0, v/yMax))*(H-4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs>
        {series.map(s=>(
          <linearGradient key={s.key} id={`cg${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={s.color} stopOpacity="0.02"/>
          </linearGradient>
        ))}
      </defs>
      {[25,50,75].map(p=>(
        <line key={p} x1="0" y1={y(p)} x2={W} y2={y(p)} stroke="#0f172a" strokeWidth="1" strokeDasharray="5,4"/>
      ))}
      {series.map(s=>{
        if(!s.data||s.data.length<2) return null;
        const pts=s.data.map((v,i)=>[(i/(s.data.length-1))*W, y(v)]);
        const l=pts.map(([x,yy],i)=>`${i===0?'M':'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
        const a=`${l} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
        return (
          <g key={s.key}>
            <path d={a} fill={`url(#cg${s.key})`}/>
            <path d={l} fill="none" stroke={s.color} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round"
              style={{ filter:`drop-shadow(0 0 5px ${s.color}60)` }}/>
            {showDots && pts.map(([x,yy],i)=>(
              <circle key={i} cx={x} cy={yy} r="4" fill={s.color}
                style={{ filter:`drop-shadow(0 0 4px ${s.color})` }}/>
            ))}
            {!showDots && pts.length>0 && (
              <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="5" fill={s.color}
                style={{ filter:`drop-shadow(0 0 6px ${s.color})` }}/>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── KPI Card ─────────────────────────────────────────────
function KPI({ icon, label, value, unit='', sub, color='#60a5fa', spark, trend }) {
  const tUp = trend > 0, tDown = trend < 0;
  return (
    <div style={{ background:'rgba(8,13,26,0.85)', border:`1px solid ${color}18`, borderRadius:'14px',
      padding:'18px 20px', flex:'1 1 160px', display:'flex', flexDirection:'column', gap:'8px',
      transition:'border-color 0.2s', cursor:'default' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=`${color}40`}
      onMouseLeave={e=>e.currentTarget.style.borderColor=`${color}18`}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:'11px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{icon} {label}</span>
        {trend != null && (
          <span style={{ fontSize:'10px', fontWeight:700, color: tUp?'#34d399': tDown?'#f87171':'#475569' }}>
            {tUp?'↑':tDown?'↓':'→'}{Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ fontSize:'28px', fontWeight:900, color, lineHeight:1, letterSpacing:'-1px' }}>
        {value}<span style={{ fontSize:'12px', color:'#334155', fontWeight:400, marginLeft:'2px' }}>{unit}</span>
      </div>
      {sub && <span style={{ fontSize:'11px', color:'#334155' }}>{sub}</span>}
      {spark && <Spark data={spark} color={color} height={38}/>}
    </div>
  );
}

// ── Toast Notification System ─────────────────────────────
function Toasts({ toasts, dismiss }) {
  return (
    <div style={{ position:'fixed', bottom:'20px', right:'20px', zIndex:9999, display:'flex', flexDirection:'column-reverse', gap:'8px', maxWidth:'360px' }}>
      {toasts.map(t => {
        const c = SEVERITY_COLORS[t.severity] || SEVERITY_COLORS.INFO;
        return (
          <div key={t.id} style={{ background:'rgba(6,11,20,0.97)', border:`1px solid ${c.border}`,
            borderLeft:`3px solid ${c.text}`, borderRadius:'10px', padding:'12px 14px',
            display:'flex', gap:'10px', alignItems:'flex-start', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
            animation:'slideIn 0.35s ease' }}>
            <span style={{ fontSize:'16px' }}>{t.severity==='CRITICAL'?'🚨':t.severity==='WARNING'?'⚠️':'ℹ️'}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:'12px', fontWeight:700, color:c.text, marginBottom:'2px' }}>{t.severity}</p>
              <p style={{ fontSize:'11px', color:'#94a3b8', lineHeight:1.5 }}>{t.message}</p>
            </div>
            <button onClick={() => dismiss(t.id)} style={{ background:'none', border:'none', color:'#334155', cursor:'pointer', fontSize:'14px', paddingTop:'1px' }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Gauge ring ────────────────────────────────────────────
function Gauge({ pct, color, size=80, label }) {
  const r=30, c=2*Math.PI*r;
  const safe = Math.min(100, Math.max(0, pct||0));
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
      <svg width={size} height={size} viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="#0f172a" strokeWidth="7"/>
        <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={c} strokeDashoffset={c*(1-safe/100)}
          strokeLinecap="round" style={{ transformOrigin:'center', transform:'rotate(-90deg)', transition:'stroke-dashoffset 1s ease' }}/>
        <text x="35" y="39" textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="900" fontFamily="Inter">
          {Math.round(safe)}%
        </text>
      </svg>
      {label && <span style={{ fontSize:'10px', color:'#475569', textAlign:'center', lineHeight:1.3 }}>{label}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const PAGES = [
  { id:'dashboard',  icon:'⬛', label:'Dashboard'   },
  { id:'monitor',    icon:'📡', label:'Monitor'      },
  { id:'experiment', icon:'🧪', label:'Experiment'   },
  { id:'results',    icon:'📊', label:'Results'      },
  { id:'healing',    icon:'🛡', label:'Auto-Heal'   },
  { id:'alerts',     icon:'🚨', label:'Alerts'       },
  { id:'sla',        icon:'📋', label:'SLA'          },
  { id:'config',     icon:'⚙️', label:'Config'       },
  { id:'audit',      icon:'📝', label:'Audit Log'    },
  { id:'history',    icon:'🕐', label:'History'      },
];

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
  const [healEvents, setHealEvt] = useState([]);
  const [healStatus, setHealSt]  = useState(null);
  const [alerts,     setAlerts]  = useState([]);
  const [toasts,     setToasts]  = useState([]);
  const [slaData,    setSlaData] = useState([]);
  const [configs,    setConfigs] = useState({});
  const [auditLog,   setAudit]   = useState([]);
  const [loadActive, setLoadAct] = useState(false);
  const [sidebarOpen,setSidebar] = useState(true);

  const sseRef   = useRef(null);
  const healRef  = useRef(null);
  const alertRef = useRef(null);
  const progRef  = useRef(null);

  // ── Toast helper ───────────────────────────────────────
  const toast = useCallback((message, severity = 'INFO') => {
    const id = Date.now() + Math.random();
    setToasts(p => [{ id, message, severity }, ...p].slice(0, 5));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 6000);
  }, []);

  const dismissToast = id => setToasts(p => p.filter(t => t.id !== id));

  // ── Metrics SSE ────────────────────────────────────────
  const pushMetric = d => {
    setSnap(d);
    setCpuH(p => [...p.slice(1), d.cpuUsage ?? 0]);
    setMemH(p => [...p.slice(1), d.memoryUsage ?? 0]);
  };

  const startPoll = useCallback(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/metrics`);
        if (r.ok) { setConn(true); pushMetric(await r.json()); }
        else setConn(false);
      } catch { setConn(false); }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API}/api/metrics/stream`);
    let opened = false;
    es.onopen    = () => { setConn(true); opened = true; };
    es.onmessage = e => { try { pushMetric(JSON.parse(e.data)); } catch {} };
    es.onerror   = () => { es.close(); setConn(false); if (!opened) startPoll(); else setTimeout(connectSSE, 5000); };
    sseRef.current = es;
  }, [startPoll]);

  useEffect(() => { connectSSE(); return () => sseRef.current?.close(); }, [connectSSE]);

  // ── Healing SSE ────────────────────────────────────────
  const connectHealSSE = useCallback(() => {
    if (healRef.current) healRef.current.close();
    const es = new EventSource(`${API}/api/healing/stream`);
    es.addEventListener('healing', e => {
      try {
        const evt = JSON.parse(e.data);
        setHealEvt(p => [evt, ...p].slice(0, 100));
        toast(`[${evt.mode}] ${evt.strategy}: ${evt.message}`, 'INFO');
      } catch {}
    });
    es.addEventListener('status', e => { try { setHealSt(JSON.parse(e.data)); } catch {} });
    es.onerror = () => { es.close(); setTimeout(connectHealSSE, 5000); };
    healRef.current = es;
  }, [toast]);

  useEffect(() => { connectHealSSE(); return () => healRef.current?.close(); }, [connectHealSSE]);

  // ── Alerts SSE ─────────────────────────────────────────
  const connectAlertSSE = useCallback(() => {
    if (alertRef.current) alertRef.current.close();
    const es = new EventSource(`${API}/api/alerts/stream`);
    es.addEventListener('alert', e => {
      try {
        const a = JSON.parse(e.data);
        setAlerts(p => [a, ...p].slice(0, 50));
        toast(a.message, a.severity);
      } catch {}
    });
    es.addEventListener('history', () => {
      // Refresh full alert list from REST on connect
      fetch(`${API}/api/alerts`).then(r => r.ok ? r.json() : []).then(setAlerts).catch(() => {});
    });
    es.onerror = () => { es.close(); setTimeout(connectAlertSSE, 5000); };
    alertRef.current = es;
  }, [toast]);

  useEffect(() => { connectAlertSSE(); return () => alertRef.current?.close(); }, [connectAlertSSE]);

  // ── Periodic data fetches ──────────────────────────────
  useEffect(() => {
    const fetch5 = setInterval(async () => {
      try {
        const [sl, cfg, al] = await Promise.all([
          fetch(`${API}/api/sla`).then(r => r.json()),
          fetch(`${API}/api/config`).then(r => r.json()),
          fetch(`${API}/api/audit`).then(r => r.json()),
        ]);
        setSlaData(sl); setConfigs(cfg); setAudit(al.slice(0, 50));
      } catch {}
    }, 8000);
    // Initial load
    Promise.all([
      fetch(`${API}/api/sla`).then(r=>r.json()).then(setSlaData).catch(()=>{}),
      fetch(`${API}/api/config`).then(r=>r.json()).then(setConfigs).catch(()=>{}),
      fetch(`${API}/api/audit`).then(r=>r.json()).then(d=>setAudit(d.slice(0,50))).catch(()=>{}),
      fetch(`${API}/api/history`).then(r=>r.json()).then(setHistory).catch(()=>{}),
      fetch(`${API}/api/healing/status`).then(r=>r.json()).then(setHealSt).catch(()=>{}),
      fetch(`${API}/api/load/status`).then(r=>r.json()).then(d=>setLoadAct(d.active)).catch(()=>{}),
    ]);
    return () => clearInterval(fetch5);
  }, []);

  useEffect(() => {
    if (result) {
      fetch(`${API}/api/history`).then(r=>r.json()).then(setHistory).catch(()=>{});
    }
  }, [result]);

  // ── Run Experiment ─────────────────────────────────────
  const run = async () => {
    setLoad(true); setError(null); setProg(0);
    const dur = dockerImg ? 30 : 10;
    let step = 0;
    progRef.current = setInterval(() => {
      step++;
      setProg(Math.min(95, Math.round((step / dur) * 100)));
    }, 1000);
    toast('Experiment started — sampling server metrics…', 'INFO');
    try {
      const payload = { strategies: ['CPU','TREND','LATENCY'] };
      if (dockerImg) payload.dockerImage = dockerImg;
      const r = await fetch(`${API}/api/experiment`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      clearInterval(progRef.current); setProg(100);

      // Always parse body — even error responses contain JSON detail
      let data;
      try { data = await r.json(); } catch { data = null; }

      if (!r.ok) {
        // Extract the most descriptive error message available
        const serverMsg = data?.message || data?.error || `Server responded with ${r.status}`;
        throw new Error(serverMsg);
      }

      // If backend returned an error key in the body (e.g. IMAGE_PULL_FAILED)
      if (data?.error && !data?.strategies) {
        throw new Error(data.message || data.error);
      }

      setResult(data);
      setPage('results');
      toast(`✅ Experiment done! Winner: ${data.bestStrategy}`, 'INFO');
    } catch (e) {
      clearInterval(progRef.current);
      const msg = (e.message || '').includes('fetch')
        ? 'Cannot reach backend. Wait 30-60s for server to wake up (Render free tier).'
        : e.message || 'Experiment failed';
      setError(msg);
      toast(msg, 'CRITICAL');
    } finally {
      setLoad(false); setProg(0);
    }
  };

  const toggleLoad = async () => {
    const url = loadActive ? `${API}/api/load/stop` : `${API}/api/load/start?durationSeconds=15`;
    const r = await fetch(url, { method:'POST' });
    if (r.ok) { const d = await r.json(); setLoadAct(d.status === 'STARTED'); }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result,null,2)], {type:'application/json'});
    Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`cloudscale-${Date.now()}.json` }).click();
  };

  const exportCSV = () => {
    if (!result?.strategies) return;
    const rows = [['Strategy','Avg Latency (ms)','Final Replicas','Events','Cost/hr (USD)','Efficiency%']];
    const costs = result.costAnalysis || [];
    result.strategies.forEach(s => {
      const cost = costs.find(c => c.strategy === s.strategy) || {};
      rows.push([s.strategy, s.averageResponseTime, s.finalReplicas, s.scalingEventCount,
                 cost.costPerHourUsd ?? '', cost.efficiencyScore ?? '']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`cloudscale-${Date.now()}.csv` }).click();
    toast('CSV exported!', 'INFO');
  };

  // ── Sidebar ────────────────────────────────────────────
  const alertCount = alerts.filter(a => !a.acknowledged).length;
  const healCount  = healEvents.length;

  const SidebarBtn = ({ id, icon, label, badge }) => (
    <button onClick={() => setPage(id)} style={{
      width:'100%', display:'flex', alignItems:'center', gap:'10px',
      padding:'9px 14px', borderRadius:'9px', border:'none', cursor:'pointer',
      background: page===id ? 'rgba(99,102,241,0.18)' : 'transparent',
      color: page===id ? '#a5b4fc' : '#475569',
      fontSize:'13px', fontWeight: page===id ? 700 : 500,
      transition:'all 0.15s', textAlign:'left', position:'relative',
    }}
    onMouseEnter={e=>{ if(page!==id) e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#94a3b8'; }}
    onMouseLeave={e=>{ e.currentTarget.style.background=page===id?'rgba(99,102,241,0.18)':'transparent'; e.currentTarget.style.color=page===id?'#a5b4fc':'#475569'; }}>
      <span style={{ fontSize:'15px' }}>{icon}</span>
      {sidebarOpen && <span style={{ flex:1 }}>{label}</span>}
      {sidebarOpen && badge > 0 && (
        <span style={{ fontSize:'10px', fontWeight:800, padding:'1px 6px', borderRadius:'10px', background:'rgba(239,68,68,0.2)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.3)' }}>{badge}</span>
      )}
    </button>
  );

  const SLA_GRADE_COLOR = g => g?.startsWith('AAA') ? '#34d399' : g?.startsWith('AA') ? '#60a5fa' : g?.startsWith('A') ? '#fbbf24' : '#f87171';

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#060b14', color:'#e2e8f0', fontFamily:"'Inter',-apple-system,sans-serif" }}>
      {/* Glow blobs */}
      <div style={{ position:'fixed', top:'-200px', left:'-200px', width:'600px', height:'600px', background:'radial-gradient(circle,rgba(59,130,246,0.05)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>
      <div style={{ position:'fixed', bottom:'-200px', right:'-200px', width:'600px', height:'600px', background:'radial-gradient(circle,rgba(168,85,247,0.05)0%,transparent 70%)', pointerEvents:'none', zIndex:0 }}/>

      {/* ── SIDEBAR ──────────────────────────────────────── */}
      <aside style={{ width: sidebarOpen ? '210px' : '56px', flexShrink:0, background:'rgba(8,13,26,0.95)', borderRight:'1px solid #0f172a', display:'flex', flexDirection:'column', padding:'14px 8px', gap:'2px', transition:'width 0.25s', position:'sticky', top:0, height:'100vh', overflowY:'auto', overflowX:'hidden', zIndex:10 }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'6px 8px', marginBottom:'10px' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0, boxShadow:'0 0 16px rgba(99,102,241,0.5)' }}>☁</div>
          {sidebarOpen && (
            <div>
              <div style={{ fontWeight:900, fontSize:'14px', background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', whiteSpace:'nowrap' }}>CloudScale</div>
              <div style={{ fontSize:'9px', color:'#1e293b', whiteSpace:'nowrap' }}>Enterprise Edition</div>
            </div>
          )}
        </div>

        {PAGES.map(p => (
          <SidebarBtn key={p.id} id={p.id} icon={p.icon} label={p.label}
            badge={p.id==='alerts'?alertCount : p.id==='healing'?healCount : 0}/>
        ))}

        {/* Bottom: live indicator */}
        <div style={{ marginTop:'auto', padding:'8px', display:'flex', alignItems:'center', gap:'7px' }}>
          <span style={{ width:'7px', height:'7px', borderRadius:'50%', flexShrink:0, background:connected?'#34d399':'#ef4444', boxShadow:connected?'0 0 8px #34d399':'none', animation:connected?'pulse 2s infinite':'none' }}/>
          {sidebarOpen && <span style={{ fontSize:'11px', color:connected?'#34d399':'#ef4444', fontWeight:700 }}>{connected?'LIVE':'OFFLINE'}</span>}
        </div>

        <button onClick={()=>setSidebar(p=>!p)} style={{ padding:'6px', background:'transparent', border:'1px solid #1e293b', borderRadius:'7px', color:'#334155', cursor:'pointer', fontSize:'13px', marginTop:'4px' }}>
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, position:'relative', zIndex:1 }}>

        {/* Top bar */}
        <header style={{ background:'rgba(6,11,20,0.96)', backdropFilter:'blur(16px)', borderBottom:'1px solid #0f172a', padding:'0 22px', display:'flex', alignItems:'center', gap:'10px', height:'54px', position:'sticky', top:0, zIndex:9, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:'14px', fontWeight:700, color:'#94a3b8', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {PAGES.find(p=>p.id===page)?.icon} {PAGES.find(p=>p.id===page)?.label}
          </h1>
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexShrink:0 }}>
            {snap && <span style={{ fontSize:'12px', color:'#475569', fontFamily:'monospace' }}>CPU {fmt(snap.cpuUsage)}% | MEM {fmt(snap.memoryUsage)}%</span>}
            <button onClick={toggleLoad} style={{ padding:'5px 12px', fontWeight:700, fontSize:'11px', color:loadActive?'#fca5a5':'#94a3b8', background:loadActive?'rgba(239,68,68,0.1)':'rgba(51,65,85,0.3)', border:`1px solid ${loadActive?'rgba(239,68,68,0.3)':'rgba(51,65,85,0.5)'}`, borderRadius:'7px', cursor:'pointer' }}>
              {loadActive ? '🔴 Stop Load' : '⚡ Load Gen'}
            </button>
            {result && <>
              <button onClick={exportJSON} style={{ padding:'5px 12px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'7px', color:'#34d399', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>⬇ JSON</button>
              <button onClick={exportCSV}  style={{ padding:'5px 12px', background:'rgba(59,130,246,0.1)',  border:'1px solid rgba(59,130,246,0.25)',  borderRadius:'7px', color:'#60a5fa', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>⬇ CSV</button>
            </>}
            <button onClick={run} disabled={loading} style={{ padding:'7px 18px', fontWeight:800, fontSize:'12px', color:'#fff', background:loading?'#1e293b':'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'8px', cursor:loading?'not-allowed':'pointer', boxShadow:loading?'none':'0 4px 14px rgba(99,102,241,0.4)', opacity:loading?0.7:1, whiteSpace:'nowrap' }}>
              {loading ? `⚙ ${progress}%` : '▶ Run Experiment'}
            </button>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div style={{ background:'rgba(239,68,68,0.07)', borderBottom:'1px solid rgba(239,68,68,0.2)', padding:'10px 22px', display:'flex', gap:'10px', alignItems:'center' }}>
            <span>⚠️</span><span style={{ flex:1, fontSize:'12px', color:'#fca5a5' }}>{error}</span>
            <button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer' }}>✕</button>
          </div>
        )}

        <main style={{ flex:1, padding:'22px', overflowY:'auto' }}>

          {/* ─────────── DASHBOARD ─────────── */}
          {page === 'dashboard' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                <KPI icon="🖥" label="CPU Usage"   value={fmt(snap?.cpuUsage)}   unit="%" color="#60a5fa" spark={cpuHist} sub={snap?.status}/>
                <KPI icon="🧠" label="RAM Usage"   value={fmt(snap?.memoryUsage)} unit="%" color="#a78bfa" spark={memHist}/>
                <KPI icon="🧪" label="Experiments" value={history.length}             color="#34d399" sub="this session"/>
                <KPI icon="🔧" label="Heals"        value={healStatus?.totalHeals??0} color="#fbbf24" sub={healStatus?.mode}/>
                <KPI icon="🚨" label="Active Alerts" value={alertCount}              color="#f87171" sub="unacknowledged"/>
                <KPI icon="📡" label="Stream"       value={connected?'LIVE':'OFF'}   color={connected?'#34d399':'#ef4444'}/>
              </div>

              {/* Live charts */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:'14px' }}>
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>📈 Live CPU & Memory</p>
                  <Chart series={[{key:'cpu',data:cpuHist,color:'#60a5fa'},{key:'mem',data:memHist,color:'#a78bfa'}]} height={110}/>
                </div>
                {result?.cpuTimeline && (
                  <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                    <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>🧪 Last Experiment — CPU during test</p>
                    <Chart series={[{key:'tcpu',data:result.cpuTimeline,color:'#f59e0b'},{key:'tmem',data:result.memTimeline||[],color:'#a78bfa'}]} height={110} showDots/>
                  </div>
                )}
              </div>

              {/* SLA gauges */}
              {slaData.length > 0 && (
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'14px' }}>📋 SLA Status</p>
                  <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'space-around' }}>
                    {slaData.map(s => {
                      const m = STRAT[s.strategy] || STRAT.CPU;
                      return (
                        <div key={s.strategy} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                          <Gauge pct={s.uptimePct} color={m.color} label={m.label}/>
                          <span style={{ fontSize:'11px', color:SLA_GRADE_COLOR(s.slaGrade), fontWeight:700 }}>{s.slaGrade}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent experiments */}
              {history.length > 0 && (
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>🕐 Recent Experiments</p>
                  {history.slice(0,5).map((h,i) => {
                    const m = STRAT[h.bestStrategy] || STRAT.CPU;
                    return (
                      <div key={i} onClick={() => { setResult(h); setPage('results'); }}
                        style={{ display:'flex', alignItems:'center', gap:'12px', padding:'9px 12px', borderRadius:'8px', cursor:'pointer', transition:'background 0.15s', marginBottom:'4px' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <span style={{ fontSize:'11px', color:'#1e293b', fontFamily:'monospace', minWidth:'70px' }}>{new Date(h.runAt).toLocaleTimeString()}</span>
                        <span style={{ fontWeight:700, color:m.light, fontSize:'12px' }}>{m.icon} {h.bestStrategy} won</span>
                        <span style={{ fontSize:'11px', color:'#334155' }}>CPU {h.peakCpuUsage}% peak</span>
                        <span style={{ marginLeft:'auto', fontSize:'11px', color:'#a5b4fc' }}>View →</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─────────── MONITOR ─────────── */}
          {page === 'monitor' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                <KPI icon="🖥" label="CPU"    value={fmt(snap?.cpuUsage)}   unit="%" color="#60a5fa" spark={cpuHist}/>
                <KPI icon="🧠" label="Memory" value={fmt(snap?.memoryUsage)} unit="%" color="#a78bfa" spark={memHist}/>
                <KPI icon="⚡" label="Load Gen" value={loadActive?'ACTIVE':'OFF'} color={loadActive?'#ef4444':'#475569'} sub="CPU stress test"/>
                <KPI icon="🔌" label="Stream" value={connected?'SSE':'POLL'} color={connected?'#34d399':'#fbbf24'}/>
              </div>
              <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                  <p style={{ fontSize:'13px', fontWeight:700, color:'#475569' }}>📈 Live System Metrics — last {MAX_LIVE} samples</p>
                  <div style={{ display:'flex', gap:'14px' }}>
                    {[{l:'CPU',c:'#60a5fa'},{l:'Memory',c:'#a78bfa'}].map(x=>(
                      <div key={x.l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#475569' }}>
                        <div style={{ width:'18px', height:'2px', background:x.c, borderRadius:'1px' }}/>{x.l}
                      </div>
                    ))}
                  </div>
                </div>
                <Chart series={[{key:'cpu',data:cpuHist,color:'#60a5fa'},{key:'mem',data:memHist,color:'#a78bfa'}]} height={160}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:'12px' }}>
                {Object.entries(STRAT).map(([key,m])=>(
                  <div key={key} style={{ background:'rgba(8,13,26,0.8)', border:`1px solid ${m.color}18`, borderRadius:'12px', padding:'16px', transition:'border-color 0.2s' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=`${m.color}40`}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=`${m.color}18`}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                      <span style={{ fontSize:'22px' }}>{m.icon}</span>
                      <span style={{ fontWeight:700, color:m.light, fontSize:'13px' }}>{m.label}</span>
                    </div>
                    <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.7 }}>
                      {key==='CPU'    && 'Scales on real CPU load. Adds replicas when CPU > 75%, removes when < 30%.'}
                      {key==='TREND'  && 'Proactively scales on CPU growth rate. Prevents overload before it happens.'}
                      {key==='LATENCY'&& 'Aggressively scales on response time. Adds 3 replicas instantly on latency spike.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────── EXPERIMENT ─────────── */}
          {page === 'experiment' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px', maxWidth:'640px', margin:'0 auto' }}>
              <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #1e293b', borderRadius:'14px', padding:'24px' }}>
                <h2 style={{ fontSize:'16px', fontWeight:800, color:'#e2e8f0', marginBottom:'6px' }}>🧪 Run an Experiment</h2>
                <p style={{ fontSize:'12px', color:'#475569', marginBottom:'20px', lineHeight:1.7 }}>
                  CloudScale samples {dockerImg ? '30' : '10'} seconds of real server metrics and simulates all 3 auto-scaling strategies against the actual load.
                  Results include cost analysis, SLA grade, and replica timeline charts.
                </p>

                <label style={{ display:'block', fontSize:'12px', color:'#94a3b8', fontWeight:600, marginBottom:'6px' }}>🐳 Docker Image <span style={{ color:'#1e293b', fontWeight:400 }}>(optional — leave blank for fast simulation)</span></label>
                <input type="text" placeholder="e.g. nginx:alpine, redis:latest" value={dockerImg} onChange={e=>setDocker(e.target.value)}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:'9px', border:'1px solid #334155', background:'#080d1a', color:'#e2e8f0', fontSize:'13px', outline:'none', marginBottom:'16px', boxSizing:'border-box' }}/>

                {loading && (
                  <div style={{ textAlign:'center', padding:'20px' }}>
                    <div style={{ fontSize:'36px', marginBottom:'8px' }}>⚙️</div>
                    <p style={{ color:'#94a3b8', fontSize:'14px', fontWeight:600 }}>Sampling real server metrics…</p>
                    <div style={{ margin:'12px auto', maxWidth:'240px', height:'6px', background:'#0f172a', borderRadius:'3px', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#3b82f6,#6366f1)', borderRadius:'3px', transition:'width 1s ease' }}/>
                    </div>
                    <p style={{ color:'#334155', fontSize:'12px' }}>{progress}% — {dockerImg ? '30' : '10'}s sampling window</p>
                  </div>
                )}

                {!loading && (
                  <button onClick={run} style={{ width:'100%', padding:'13px', fontWeight:800, fontSize:'14px', color:'#fff', background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:'10px', cursor:'pointer', boxShadow:'0 6px 22px rgba(99,102,241,0.45)' }}>
                    ▶ Start Experiment {dockerImg ? '(~30s)' : '(~10s)'}
                  </button>
                )}
              </div>

              <div style={{ background:'rgba(8,13,26,0.7)', border:'1px solid #0f172a', borderRadius:'12px', padding:'16px' }}>
                <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>💡 Pro Tips</p>
                {[
                  ['⚡', 'Click Load Gen in the header to spike CPU before running — results will be more dramatic.'],
                  ['🛡', 'Arm the Auto-Heal engine before starting to capture healing events in results.'],
                  ['🐳', 'Enter a Docker image to run real containers instead of simulating replica counts.'],
                  ['📋', 'Results include cost/hr estimates using AWS t3.small pricing.'],
                ].map(([icon, tip], i) => (
                  <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'8px', fontSize:'12px', color:'#475569', lineHeight:1.6 }}>
                    <span style={{ fontSize:'14px', flexShrink:0 }}>{icon}</span><span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────── RESULTS ─────────── */}
          {page === 'results' && !result && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#1e293b' }}>
              <div style={{ fontSize:'50px', marginBottom:'14px' }}>🧪</div>
              <h2 style={{ color:'#334155', marginBottom:'8px' }}>No experiment yet</h2>
              <button onClick={()=>setPage('experiment')} style={{ padding:'9px 22px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'9px', color:'#a5b4fc', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>→ Go to Experiment</button>
            </div>
          )}

          {page === 'results' && result && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {/* Summary KPIs */}
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                <KPI icon="🏆" label="Winner"   value={result.bestStrategy} color={STRAT[result.bestStrategy]?.color||'#34d399'}/>
                <KPI icon="🖥" label="Peak CPU"  value={fmt(result.peakCpuUsage)} unit="%" color="#f59e0b"/>
                <KPI icon="🧠" label="Peak RAM"  value={fmt(result.peakMemUsage)} unit="%" color="#a78bfa"/>
                <KPI icon="📊" label="Samples"   value={result.sampleCount} color="#60a5fa" sub="1s intervals"/>
                <KPI icon="💰" label="Best $/hr" value={`$${(result.bestStrategyCostPerHour||0).toFixed(4)}`} color="#34d399" unit="" sub="est. AWS cost"/>
              </div>

              {/* CPU/Replica charts */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:'14px' }}>
                {result.cpuTimeline && (
                  <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                    <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>📈 CPU & Memory During Test</p>
                    <Chart series={[{key:'cpu',data:result.cpuTimeline,color:'#f59e0b'},{key:'mem',data:result.memTimeline||[],color:'#a78bfa'}]} height={110} showDots/>
                  </div>
                )}
                {result.strategies?.[0]?.replicaTimeline && (
                  <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                    <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'10px' }}>🔢 Replica Count — All Strategies</p>
                    <Chart series={result.strategies.map(s=>({ key:s.strategy, data:s.replicaTimeline, color:STRAT[s.strategy]?.color||'#60a5fa' }))}
                      height={110} yMax={Math.max(8,...result.strategies.flatMap(s=>s.replicaTimeline||[]))} showDots/>
                  </div>
                )}
              </div>

              {/* Cost analysis table */}
              {result.costAnalysis && (
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'12px' }}>💰 Cost Analysis (AWS t3.small pricing)</p>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #0f172a' }}>
                          {['Strategy','Avg Replicas','Peak','$/hr','Savings vs Worst','Efficiency','Verdict'].map(h=>(
                            <th key={h} style={{ padding:'7px 12px', textAlign:'left', color:'#1e293b', fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.costAnalysis.map((c,i) => {
                          const m = STRAT[c.strategy] || STRAT.CPU;
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid #0f172a' }}>
                              <td style={{ padding:'9px 12px' }}><span style={{ color:m.light, fontWeight:700 }}>{m.icon} {c.strategy}</span></td>
                              <td style={{ padding:'9px 12px', color:'#94a3b8' }}>{c.avgReplicas}</td>
                              <td style={{ padding:'9px 12px', color:'#94a3b8' }}>{c.peakReplicas}</td>
                              <td style={{ padding:'9px 12px', color:'#fbbf24', fontWeight:700 }}>{fmtUsd(c.costPerHourUsd)}</td>
                              <td style={{ padding:'9px 12px', color:'#34d399' }}>{fmtUsd(c.savingsVsWorstUsd)}</td>
                              <td style={{ padding:'9px 12px' }}>
                                <div style={{ height:'6px', width:'80px', background:'#080d1a', borderRadius:'3px', overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${c.efficiencyScore}%`, background:`linear-gradient(90deg,${m.color},${m.light})`, borderRadius:'3px' }}/>
                                </div>
                              </td>
                              <td style={{ padding:'9px 12px', color:'#94a3b8' }}>{c.recommendation}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Monthly cost projection */}
              {result.costProjection && (
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'12px' }}>📅 Monthly Cost Projection — Best Strategy</p>
                  <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                    {Object.entries(result.costProjection).map(([period, cost]) => (
                      <div key={period} style={{ background:'rgba(52,211,153,0.05)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:'10px', padding:'12px 18px', flex:'1 1 100px', textAlign:'center' }}>
                        <p style={{ fontSize:'10px', color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>{period}</p>
                        <p style={{ fontSize:'18px', fontWeight:900, color:'#34d399' }}>${cost.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SLA snapshot */}
              {result.slaSnapshot && (
                <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                  <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'14px' }}>📋 SLA After This Experiment</p>
                  <div style={{ display:'flex', gap:'20px', flexWrap:'wrap', justifyContent:'space-around' }}>
                    {result.slaSnapshot.map(s => {
                      const m = STRAT[s.strategy] || STRAT.CPU;
                      return (
                        <div key={s.strategy} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
                          <Gauge pct={s.uptimePct} color={m.color} label={m.label}/>
                          <span style={{ fontSize:'11px', color:SLA_GRADE_COLOR(s.slaGrade), fontWeight:700 }}>{s.slaGrade}</span>
                          {s.totalCrashes > 0 && <span style={{ fontSize:'10px', color:'#475569' }}>MTTR {s.mttrMs}ms</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scaling events */}
              <div style={{ background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                <p style={{ fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'12px' }}>📋 Scaling Events — {result.bestStrategy} (Winner)</p>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #080d1a' }}>
                        {['Time','Strategy','Old→New','Reason'].map(h=>(
                          <th key={h} style={{ padding:'7px 12px', textAlign:'left', color:'#1e293b', fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!result.scalingEvents?.length
                        ? <tr><td colSpan={4} style={{ padding:'24px', textAlign:'center', color:'#1e293b' }}>✅ No scaling events — load was stable.</td></tr>
                        : result.scalingEvents.map((ev,i)=>{
                            const m=STRAT[ev.strategyName]||STRAT.CPU, up=ev.newReplicas>ev.oldReplicas;
                            return (
                              <tr key={i} style={{ borderBottom:'1px solid #080d1a' }}>
                                <td style={{ padding:'9px 12px', color:'#334155', fontFamily:'monospace' }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                                <td style={{ padding:'9px 12px' }}><span style={{ padding:'2px 9px', borderRadius:'20px', fontSize:'10px', fontWeight:700, background:`${m.color}12`, color:m.light, border:`1px solid ${m.color}25` }}>{ev.strategyName}</span></td>
                                <td style={{ padding:'9px 12px', fontFamily:'monospace', color: up?'#34d399':'#f87171', fontWeight:700 }}>{ev.oldReplicas}→{ev.newReplicas} {up?'▲':'▼'}</td>
                                <td style={{ padding:'9px 12px', color:'#475569' }}>{ev.reason}</td>
                              </tr>
                            );
                          })
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─────────── HEALING ─────────── */}
          {page === 'healing' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                <KPI icon="🛡" label="Engine"    value={healStatus?.active?'ARMED':'STANDBY'} color={healStatus?.active?'#34d399':'#475569'}/>
                <KPI icon="🐳" label="Mode"      value={healStatus?.mode??'SIMULATED'}         color={healStatus?.mode==='DOCKER'?'#60a5fa':'#f59e0b'}/>
                <KPI icon="🔧" label="Total Heals" value={healStatus?.totalHeals??0}           color="#a78bfa"/>
                <KPI icon="👁" label="Subscribers" value={healStatus?.subscribers??0}          color="#34d399"/>
              </div>
              <div style={{ background:'rgba(8,13,26,0.7)', border:'1px solid #1e293b', borderRadius:'13px', padding:'16px', display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:'12px', color:'#94a3b8', fontWeight:700 }}>🛡 Control Panel</span>
                <button onClick={async()=>{ await fetch(`${API}/api/healing/arm?image=${encodeURIComponent(dockerImg||'')}`,{method:'POST'}); const r=await fetch(`${API}/api/healing/status`); if(r.ok)setHealSt(await r.json()); toast('Healing engine armed!','INFO'); }}
                  style={{ padding:'7px 14px', background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', borderRadius:'8px', color:'#34d399', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                  ⚡ Arm {dockerImg?`(${dockerImg})`:'(Simulation)'}
                </button>
                <button onClick={async()=>{ await fetch(`${API}/api/healing/disarm`,{method:'POST'}); const r=await fetch(`${API}/api/healing/status`); if(r.ok)setHealSt(await r.json()); toast('Engine disarmed.','INFO'); }}
                  style={{ padding:'7px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', color:'#fca5a5', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                  🔴 Disarm
                </button>
                <button onClick={async()=>{ const r=await fetch(`${API}/api/healing/chaos?strategy=CPU`,{method:'POST'}); const d=await r.json().catch(()=>({})); toast(d.message||'Chaos injected!','WARNING'); }}
                  style={{ padding:'7px 14px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'8px', color:'#fbbf24', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                  💥 Inject Crash (CPU)
                </button>
                <button onClick={()=>setHealEvt([])} style={{ marginLeft:'auto', padding:'6px 12px', background:'transparent', border:'1px solid #1e293b', borderRadius:'7px', color:'#334155', fontSize:'11px', cursor:'pointer' }}>Clear</button>
              </div>
              <div style={{ background:'rgba(52,211,153,0.04)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:'12px', padding:'14px 18px' }}>
                <p style={{ fontSize:'12px', color:'#34d399', fontWeight:700, marginBottom:'5px' }}>🛡 How It Works</p>
                <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.8 }}>Health check every <b style={{ color:'#94a3b8' }}>3 seconds</b>. Docker mode inspects real containers. Simulation mode uses a 4% crash rate model. All events pushed via SSE.</p>
              </div>
              {healEvents.length === 0
                ? <div style={{ textAlign:'center', padding:'40px', color:'#1e293b' }}><div style={{ fontSize:'36px' }}>🛡</div><p style={{ marginTop:'10px' }}>No healing events yet. Arm the engine and wait.</p></div>
                : healEvents.map((evt,i) => {
                    const m=STRAT[evt.strategy]||STRAT.CPU;
                    return (
                      <div key={i} style={{ background:i===0?`${m.color}08`:'rgba(8,13,26,0.7)', border:`1px solid ${i===0?m.color+'35':'#0f172a'}`, borderRadius:'11px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', animation:i===0?'fadeIn 0.4s ease':'none' }}>
                        <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:`${m.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>🔧</div>
                        <div style={{ flex:1, minWidth:'180px' }}>
                          <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'3px', flexWrap:'wrap' }}>
                            <span style={{ fontSize:'12px', fontWeight:700, color:m.light }}>{evt.strategy}</span>
                            <span style={{ fontSize:'10px', padding:'1px 7px', borderRadius:'10px', background:evt.mode==='DOCKER'?'rgba(96,165,250,0.15)':'rgba(245,158,11,0.15)', color:evt.mode==='DOCKER'?'#60a5fa':'#fbbf24', fontWeight:700 }}>{evt.mode}</span>
                            {i===0&&<span style={{ fontSize:'10px', padding:'1px 7px', borderRadius:'10px', background:'rgba(52,211,153,0.15)', color:'#34d399', fontWeight:700, animation:'pulse 1.5s infinite' }}>NEW</span>}
                          </div>
                          <p style={{ fontSize:'11px', color:'#475569' }}>{evt.message}</p>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ fontSize:'10px', color:'#1e293b', fontFamily:'monospace' }}>{new Date(evt.timestamp).toLocaleTimeString()}</p>
                          <p style={{ fontSize:'11px', color:'#34d399', fontWeight:700 }}>⚡ {evt.healDurationMs}ms</p>
                          <p style={{ fontSize:'10px', color:'#475569' }}>{evt.replicaCount} replicas</p>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* ─────────── ALERTS ─────────── */}
          {page === 'alerts' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                <KPI icon="🚨" label="Total Alerts"  value={alerts.length}               color="#f87171"/>
                <KPI icon="⚠️" label="Unacknowledged" value={alertCount}                  color="#fbbf24"/>
                <KPI icon="📋" label="Rules Active"   value={alerts.filter(a=>!a.acknowledged).length} color="#60a5fa"/>
              </div>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                <button onClick={async()=>{ await fetch(`${API}/api/alerts`,{method:'DELETE'}); setAlerts([]); toast('Alerts cleared.','INFO'); }}
                  style={{ padding:'7px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', color:'#fca5a5', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
                  🗑 Clear All
                </button>
                <a href={`${API}/api/alerts/rules`} target="_blank" rel="noreferrer" style={{ padding:'7px 14px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'8px', color:'#a5b4fc', fontSize:'12px', fontWeight:600, textDecoration:'none' }}>📖 View Rules JSON</a>
              </div>
              {alerts.length === 0
                ? <div style={{ textAlign:'center', padding:'40px', color:'#1e293b' }}><div style={{ fontSize:'36px' }}>✅</div><p style={{ marginTop:'10px' }}>No alerts — all metrics within thresholds.</p></div>
                : alerts.map((a,i) => {
                    const c = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.INFO;
                    return (
                      <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderLeft:`3px solid ${c.text}`, borderRadius:'11px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', opacity:a.acknowledged?0.5:1 }}>
                        <span style={{ fontSize:'18px' }}>{a.severity==='CRITICAL'?'🚨':a.severity==='WARNING'?'⚠️':'ℹ️'}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:'12px', fontWeight:700, color:c.text, marginBottom:'2px' }}>{a.severity} — {a.metric?.toUpperCase()}</p>
                          <p style={{ fontSize:'11px', color:'#475569' }}>{a.message}</p>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ fontSize:'10px', color:'#1e293b', fontFamily:'monospace', marginBottom:'4px' }}>{new Date(a.timestamp).toLocaleTimeString()}</p>
                          {!a.acknowledged && (
                            <button onClick={async()=>{ await fetch(`${API}/api/alerts/${a.id}/acknowledge`,{method:'POST'}); setAlerts(p=>p.map(x=>x.id===a.id?{...x,acknowledged:true}:x)); }}
                              style={{ padding:'3px 10px', background:'transparent', border:`1px solid ${c.border}`, borderRadius:'6px', color:c.text, fontSize:'10px', fontWeight:600, cursor:'pointer' }}>Ack</button>
                          )}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* ─────────── SLA ─────────── */}
          {page === 'sla' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', justifyContent:'space-around' }}>
                {slaData.map(s => {
                  const m = STRAT[s.strategy] || STRAT.CPU;
                  return (
                    <div key={s.strategy} style={{ background:'rgba(8,13,26,0.85)', border:`1px solid ${m.color}20`, borderRadius:'14px', padding:'22px', flex:'1 1 200px', textAlign:'center' }}>
                      <Gauge pct={s.uptimePct} color={m.color} size={100}/>
                      <p style={{ fontWeight:800, color:m.light, fontSize:'14px', marginTop:'10px' }}>{m.icon} {s.strategy}</p>
                      <p style={{ fontSize:'13px', fontWeight:700, color:SLA_GRADE_COLOR(s.slaGrade), marginTop:'4px' }}>{s.slaGrade}</p>
                      <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'6px', textAlign:'left' }}>
                        {[['Uptime',`${s.uptimePct}%`],['Crashes',s.totalCrashes],['MTTR',`${s.mttrMs}ms`],['Ticks',s.totalTicks]].map(([l,v])=>(
                          <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:'11px' }}>
                            <span style={{ color:'#475569' }}>{l}</span>
                            <span style={{ color:'#94a3b8', fontWeight:600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={async()=>{ await fetch(`${API}/api/sla/reset`,{method:'POST'}); const r=await fetch(`${API}/api/sla`); if(r.ok)setSlaData(await r.json()); toast('SLA counters reset.','INFO'); }}
                style={{ padding:'8px 18px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', color:'#fca5a5', fontSize:'12px', fontWeight:700, cursor:'pointer', alignSelf:'flex-start' }}>
                🔄 Reset SLA Counters
              </button>
            </div>
          )}

          {/* ─────────── CONFIG ─────────── */}
          {page === 'config' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <p style={{ fontSize:'12px', color:'#475569', lineHeight:1.7 }}>
                Tune the scaling thresholds for each strategy. Changes take effect on the next experiment.
                Click <b style={{ color:'#a5b4fc' }}>Reset to Default</b> to restore original values.
              </p>
              {Object.entries(configs).map(([key, cfg]) => {
                const m = STRAT[key] || STRAT.CPU;
                return (
                  <div key={key} style={{ background:'rgba(8,13,26,0.85)', border:`1px solid ${m.color}20`, borderRadius:'13px', padding:'18px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'20px' }}>{m.icon}</span>
                      <span style={{ fontWeight:800, color:m.light, fontSize:'14px' }}>{m.label}</span>
                      <span style={{ fontSize:'12px', color:'#475569', flex:1 }}>{cfg.description}</span>
                      <button onClick={async()=>{ await fetch(`${API}/api/config/${key}/reset`,{method:'POST'}); const r=await fetch(`${API}/api/config`); if(r.ok)setConfigs(await r.json()); toast(`${key} config reset to default.`,'INFO'); }}
                        style={{ padding:'5px 12px', background:'transparent', border:`1px solid ${m.color}30`, borderRadius:'7px', color:m.light, fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                        ↺ Reset
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'10px' }}>
                      {[
                        ['Scale-Up Threshold', cfg.scaleUpThreshold,   'scaleUpThreshold'],
                        ['Scale-Down Threshold', cfg.scaleDownThreshold,'scaleDownThreshold'],
                        ['Scale-Up Step',      cfg.scaleUpStep,         'scaleUpStep'],
                        ['Scale-Down Step',    cfg.scaleDownStep,       'scaleDownStep'],
                        ['Min Replicas',       cfg.minReplicas,         'minReplicas'],
                        ['Max Replicas',       cfg.maxReplicas,         'maxReplicas'],
                      ].map(([label, val, field]) => (
                        <div key={field} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                          <label style={{ fontSize:'10px', color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</label>
                          <input type="number" defaultValue={val}
                            style={{ padding:'7px 10px', borderRadius:'7px', border:`1px solid ${m.color}25`, background:'#080d1a', color:'#e2e8f0', fontSize:'13px', fontWeight:600, outline:'none', width:'100%', boxSizing:'border-box' }}
                            onBlur={async e => {
                              const updated = { ...cfg, [field]: parseFloat(e.target.value) };
                              await fetch(`${API}/api/config/${key}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated) });
                              const r = await fetch(`${API}/api/config`);
                              if (r.ok) setConfigs(await r.json());
                              toast(`${key}: ${label} updated.`, 'INFO');
                            }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─────────── AUDIT ─────────── */}
          {page === 'audit' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                <KPI icon="📝" label="Log Entries" value={auditLog.length} color="#60a5fa"/>
                <KPI icon="👤" label="User Actions" value={auditLog.filter(e=>e.actor==='USER').length} color="#34d399"/>
                <KPI icon="⚙️" label="System Actions" value={auditLog.filter(e=>e.actor==='SYSTEM').length} color="#a78bfa"/>
              </div>
              <div style={{ overflowX:'auto', background:'rgba(8,13,26,0.85)', border:'1px solid #0f172a', borderRadius:'13px', padding:'16px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #0f172a' }}>
                      {['#','Time','Actor','Action','Resource','Detail'].map(h=>(
                        <th key={h} style={{ padding:'7px 10px', textAlign:'left', color:'#1e293b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', fontSize:'10px', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((e,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid #080d1a' }}
                        onMouseEnter={ev=>ev.currentTarget.style.background='rgba(15,23,42,0.7)'}
                        onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'7px 10px', color:'#1e293b', fontFamily:'monospace' }}>{e.id}</td>
                        <td style={{ padding:'7px 10px', color:'#334155', fontFamily:'monospace', whiteSpace:'nowrap' }}>{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td style={{ padding:'7px 10px' }}><span style={{ padding:'1px 7px', borderRadius:'9px', fontSize:'10px', fontWeight:700, background:e.actor==='USER'?'rgba(52,211,153,0.1)':'rgba(96,165,250,0.1)', color:e.actor==='USER'?'#34d399':'#60a5fa', border:`1px solid ${e.actor==='USER'?'rgba(52,211,153,0.2)':'rgba(96,165,250,0.2)'}` }}>{e.actor}</span></td>
                        <td style={{ padding:'7px 10px', color:'#94a3b8', whiteSpace:'nowrap' }}>{e.action}</td>
                        <td style={{ padding:'7px 10px', color:'#475569' }}>{e.resource}</td>
                        <td style={{ padding:'7px 10px', color:'#334155', maxWidth:'280px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─────────── HISTORY ─────────── */}
          {page === 'history' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <p style={{ fontSize:'12px', color:'#1e293b', marginBottom:'4px' }}>Last 10 experiments — click any row to view full results.</p>
              {history.length === 0
                ? <div style={{ textAlign:'center', padding:'40px', color:'#1e293b' }}><div style={{ fontSize:'36px' }}>🕐</div><p style={{ marginTop:'10px' }}>No experiments yet.</p></div>
                : history.map((h,i) => {
                    const m = STRAT[h.bestStrategy] || STRAT.CPU;
                    const bestCost = h.costAnalysis?.[0];
                    return (
                      <div key={i} onClick={()=>{ setResult(h); setPage('results'); }}
                        style={{ background:'rgba(8,13,26,0.8)', border:'1px solid #0f172a', borderRadius:'11px', padding:'13px 17px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap', cursor:'pointer', transition:'border-color 0.15s' }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor='#1e293b'}
                        onMouseLeave={e=>e.currentTarget.style.borderColor='#0f172a'}>
                        <span style={{ fontSize:'11px', color:'#1e293b', fontFamily:'monospace', minWidth:'75px' }}>{new Date(h.runAt).toLocaleTimeString()}</span>
                        <span style={{ fontWeight:800, color:m.light, fontSize:'13px' }}>{m.icon} {h.bestStrategy} won</span>
                        <span style={{ fontSize:'11px', color:'#334155' }}>CPU {h.peakCpuUsage}%</span>
                        <span style={{ fontSize:'11px', color:'#334155' }}>RAM {h.peakMemUsage}%</span>
                        {bestCost && <span style={{ fontSize:'11px', color:'#34d399' }}>💰 ${bestCost.costPerHourUsd}/hr</span>}
                        <span style={{ marginLeft:'auto', fontSize:'11px', color:'#475569' }}>View →</span>
                      </div>
                    );
                  })
              }
            </div>
          )}

        </main>
      </div>

      {/* ── TOASTS ──────────────────────────────────────── */}
      <Toasts toasts={toasts} dismiss={dismissToast}/>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn{ from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#060b14; }
        ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:3px; }
      `}</style>
    </div>
  );
}
