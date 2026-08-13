import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const MAX_HISTORY = 30; // 30 data points = 60 seconds of history

const strategyColors = {
  CPU:     { bg: 'rgba(59,130,246,0.15)',  border: '#3b82f6', text: '#93c5fd' },
  TREND:   { bg: 'rgba(16,185,129,0.15)',  border: '#10b981', text: '#6ee7b7' },
  LATENCY: { bg: 'rgba(168,85,247,0.15)', border: '#a855f7', text: '#d8b4fe' },
};

// SVG sparkline chart component
function SparkLine({ data, color, height = 60, width = '100%' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;
  const svgWidth = 600;
  const svgHeight = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * svgWidth;
    const y = svgHeight - ((v - min) / range) * svgHeight;
    return `${x},${y}`;
  }).join(' ');
  const areaPath = `M0,${svgHeight} L${pts.split(' ').map((p, i) => (i === 0 ? `0,${p.split(',')[1]}` : p)).join(' L')} L${svgWidth},${svgHeight} Z`;
  const linePath = `M${pts.split(' ').join(' L')}`;

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width, height, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricCard({ label, value, history, color, icon }) {
  const level = value > 80 ? 'HIGH' : value > 50 ? 'MED' : 'LOW';
  const levelColor = value > 80 ? '#ef4444' : value > 50 ? '#f59e0b' : '#34d399';
  return (
    <div style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${color}30`, borderRadius: '14px', padding: '20px', flex: 1, minWidth: '200px', backdropFilter: 'blur(12px)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <SparkLine data={history} color={color} height={50} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{icon} {label}</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', background: `${levelColor}20`, color: levelColor, border: `1px solid ${levelColor}40`, fontWeight: 700 }}>{level}</span>
        </div>
        <div style={{ fontSize: '36px', fontWeight: 900, color, lineHeight: 1 }}>{value?.toFixed(1)}<span style={{ fontSize: '16px', fontWeight: 500, color: '#64748b' }}>%</span></div>
        <div style={{ marginTop: '6px', height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: `linear-gradient(90deg, ${color}, ${levelColor})`, borderRadius: '2px', transition: 'width 0.8s ease' }} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [liveMetrics, setLive]      = useState(null);
  const [cpuHistory, setCpuHist]    = useState([]);
  const [memHistory, setMemHist]    = useState([]);
  const [ticker, setTicker]         = useState([]);
  const [backendUp, setBackendUp]   = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_URL}/api/metrics`);
        if (res.ok) {
          const data = await res.json();
          setLive(data);
          setBackendUp(true);
          setCpuHist(prev => [...prev.slice(-(MAX_HISTORY - 1)), data.cpuUsage]);
          setMemHist(prev => [...prev.slice(-(MAX_HISTORY - 1)), data.memoryUsage]);
          setTicker(prev => [{
            time: new Date().toLocaleTimeString(),
            cpu: data.cpuUsage.toFixed(1),
            mem: data.memoryUsage.toFixed(1),
            status: data.status,
          }, ...prev.slice(0, 4)]);
        }
      } catch (_) { setBackendUp(false); }
    };
    fetchMetrics();
    pollRef.current = setInterval(fetchMetrics, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  const runExperiment = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['CPU', 'TREND', 'LATENCY']),
      });
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch {
      setError('Backend is offline. Start it with the Maven command.');
    } finally { setLoading(false); }
  };

  const best   = result?.bestStrategy;
  const colors = best ? (strategyColors[best] || strategyColors.CPU) : strategyColors.CPU;

  return (
    <div style={{ minHeight: '100vh', background: '#080d1a', padding: '28px 20px', fontFamily: "'Inter', -apple-system, sans-serif", color: '#e2e8f0' }}>
      <div style={{ position: 'fixed', top: '-200px', left: '-200px', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-200px', right: '-200px', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: backendUp ? '#34d399' : '#ef4444', boxShadow: backendUp ? '0 0 10px #34d399' : '0 0 10px #ef4444', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '12px', color: backendUp ? '#6ee7b7' : '#fca5a5', fontWeight: 600 }}>
                {backendUp ? 'LIVE — Sampling real server metrics every 2s' : 'OFFLINE — Connecting...'}
              </span>
            </div>
            <h1 style={{ fontSize: '30px', fontWeight: 900, background: 'linear-gradient(90deg, #60a5fa 0%, #34d399 50%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              Cloud Strategy Simulator
            </h1>
            <p style={{ color: '#475569', fontSize: '13px', marginTop: '6px' }}>Real-time CPU & memory from this Render server — zero simulation</p>
          </div>
          <button onClick={runExperiment} disabled={loading || !backendUp}
            style={{ padding: '12px 24px', fontWeight: 700, fontSize: '14px', color: '#fff', background: loading ? '#1e293b' : !backendUp ? '#1e293b' : 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', borderRadius: '10px', cursor: loading || !backendUp ? 'not-allowed' : 'pointer', boxShadow: loading || !backendUp ? 'none' : '0 4px 20px rgba(99,102,241,0.4)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
            {loading ? '⚙ Sampling 15s of real data...' : '▶ Run Experiment'}
          </button>
        </div>

        {/* Live Metric Cards with Sparklines */}
        {backendUp && liveMetrics && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <MetricCard label="CPU Usage"    value={liveMetrics.cpuUsage}    history={cpuHistory} color="#60a5fa" icon="🖥" />
            <MetricCard label="Memory Usage" value={liveMetrics.memoryUsage} history={memHistory} color="#a78bfa" icon="🧠" />
            {/* Load status ticker */}
            <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '14px', padding: '20px', flex: 1, minWidth: '200px', backdropFilter: 'blur(12px)' }}>
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>📋 Recent Samples</p>
              {ticker.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < ticker.length - 1 ? '1px solid #1e293b' : 'none', opacity: 1 - i * 0.2 }}>
                  <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace' }}>{t.time}</span>
                  <span style={{ fontSize: '11px', color: '#60a5fa' }}>CPU {t.cpu}%</span>
                  <span style={{ fontSize: '11px', color: '#a78bfa' }}>MEM {t.mem}%</span>
                  <span style={{ fontSize: '10px', color: t.status === 'HIGH' ? '#ef4444' : t.status === 'MEDIUM' ? '#f59e0b' : '#34d399', fontWeight: 700 }}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444430', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', color: '#fca5a5', fontSize: '13px' }}>⚠ {error}</div>}

        {/* Strategy Cards */}
        {!result && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {[
              { key: 'CPU',     icon: '🖥', title: 'CPU Strategy',     desc: 'Scales when real CPU > 75%. Triggers on actual processor load.' },
              { key: 'TREND',   icon: '📈', title: 'Trend Strategy',   desc: 'Detects rising CPU trend from 1s-apart samples. Proactive scaling.' },
              { key: 'LATENCY', icon: '⏱', title: 'Latency Strategy', desc: 'Reacts to high response times driven by real memory pressure.' },
            ].map(s => (
              <div key={s.key} style={{ background: 'rgba(15,23,42,0.7)', border: `1px solid ${strategyColors[s.key].border}25`, borderRadius: '12px', padding: '18px' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
                <h3 style={{ fontWeight: 700, color: strategyColors[s.key].text, marginBottom: '6px', fontSize: '13px' }}>{s.title}</h3>
                <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.4s ease' }}>
            {/* Winner */}
            <div style={{ background: `linear-gradient(135deg, ${colors.bg}, rgba(8,13,26,0.9))`, border: `1px solid ${colors.border}50`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '44px' }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '4px' }}>Best Strategy</p>
                  <p style={{ fontSize: '32px', fontWeight: 900, color: colors.text, margin: 0 }}>{best}</p>
                  <p style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>Determined from 15 real server samples</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Final Replicas',   value: result.finalReplicas,                        c: colors.text  },
                    { label: 'Avg Latency',       value: `${result.averageResponseTime?.toFixed(0)}ms`, c: colors.text  },
                    { label: 'Peak CPU (real)',   value: `${result.peakCpuUsage?.toFixed(1)}%`,       c: '#f59e0b' },
                    { label: 'Peak RAM (real)',   value: `${result.peakMemoryUsage?.toFixed(1)}%`,    c: '#a78bfa' },
                  ].map(({ label, value, c }) => (
                    <div key={label} style={{ background: 'rgba(8,13,26,0.6)', border: `1px solid ${c}30`, borderRadius: '10px', padding: '12px 16px' }}>
                      <p style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{label}</p>
                      <p style={{ fontSize: '20px', fontWeight: 800, color: c, margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Events Table */}
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid #1e293b', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>
                📊 Scaling Events
                <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 400, color: '#475569' }}>({result.scalingEvents?.length || 0} from real data)</span>
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {['Time', 'Strategy', 'Replicas', 'Reason'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.scalingEvents?.length === 0
                      ? <tr><td colSpan={4} style={{ padding: '28px', textAlign: 'center', color: '#334155' }}>No scaling needed — load was stable.</td></tr>
                      : result.scalingEvents?.map((ev, i) => {
                          const sc = strategyColors[ev.strategyName] || strategyColors.CPU;
                          const up = ev.newReplicas > ev.oldReplicas;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #0f172a' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(30,41,59,0.5)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '10px', color: '#475569', fontFamily: 'monospace', fontSize: '12px' }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                              <td style={{ padding: '10px' }}><span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}30` }}>{ev.strategyName}</span></td>
                              <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                                <span style={{ color: '#475569' }}>{ev.oldReplicas}</span>
                                <span style={{ margin: '0 6px', color: '#334155' }}>→</span>
                                <span style={{ color: up ? '#34d399' : '#f87171', fontWeight: 700 }}>{ev.newReplicas} {up ? '▲' : '▼'}</span>
                              </td>
                              <td style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>{ev.reason}</td>
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
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

export default App;
