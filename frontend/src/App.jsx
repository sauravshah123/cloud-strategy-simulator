import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const MAX_POINTS = 60;

const STRATEGY_META = {
  CPU:     { color: '#3b82f6', glow: 'rgba(59,130,246,0.4)',  icon: '🖥',  label: 'CPU Strategy'     },
  TREND:   { color: '#10b981', glow: 'rgba(16,185,129,0.4)',  icon: '📈',  label: 'Trend Strategy'   },
  LATENCY: { color: '#a855f7', glow: 'rgba(168,85,247,0.4)',  icon: '⏱',  label: 'Latency Strategy' },
};

// ── SVG Line Chart ────────────────────────────────────────────────────────────
function LineChart({ series, height = 120, yMax = 100 }) {
  const W = 800, H = height;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        {series.map(s => (
          <linearGradient key={s.key} id={`lg-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
        {/* Grid lines */}
        {[25, 50, 75].map(pct => (
          <line key={pct} x1="0" y1={H - (pct / yMax) * H} x2={W} y2={H - (pct / yMax) * H}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
        ))}
      </defs>
      {/* Grid */}
      {[25, 50, 75].map(pct => (
        <line key={pct} x1="0" y1={H - (pct / yMax) * H} x2={W} y2={H - (pct / yMax) * H}
          stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      {series.map(s => {
        if (!s.data || s.data.length < 2) return null;
        const pts = s.data.map((v, i) => {
          const x = (i / (MAX_POINTS - 1)) * W;
          const y = H - Math.min(1, v / yMax) * H;
          return [x, y];
        });
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
        const area = `${line} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
        return (
          <g key={s.key}>
            <path d={area} fill={`url(#lg-${s.key})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${s.color}60)` }} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit = '', color, sub }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.9)', border: `1px solid ${color}25`, borderRadius: '12px', padding: '16px 20px', flex: '1 1 130px' }}>
      <p style={{ fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>{label}</p>
      <p style={{ fontSize: '26px', fontWeight: 900, color, lineHeight: 1 }}>{value}<span style={{ fontSize: '13px', fontWeight: 500, color: '#475569', marginLeft: '3px' }}>{unit}</span></p>
      {sub && <p style={{ fontSize: '11px', color: '#334155', marginTop: '4px' }}>{sub}</p>}
    </div>
  );
}

// ── Strategy Comparison Bar ───────────────────────────────────────────────────
function StrategyBar({ name, latency, replicas, events, isBest, maxLatency }) {
  const meta = STRATEGY_META[name] || STRATEGY_META.CPU;
  const pct  = maxLatency > 0 ? (latency / maxLatency) * 100 : 0;
  return (
    <div style={{ background: isBest ? `rgba(${name === 'CPU' ? '59,130,246' : name === 'TREND' ? '16,185,129' : '168,85,247'},0.08)` : 'rgba(15,23,42,0.6)', border: `1px solid ${isBest ? meta.color + '60' : '#1e293b'}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '10px', transition: 'all 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <span style={{ fontSize: '20px' }}>{meta.icon}</span>
        <span style={{ fontWeight: 700, color: meta.color, fontSize: '14px' }}>{meta.label}</span>
        {isBest && <span style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 10px', background: `${meta.color}20`, border: `1px solid ${meta.color}40`, borderRadius: '20px', color: meta.color, fontWeight: 700 }}>🏆 WINNER</span>}
        <div style={{ marginLeft: isBest ? '0' : 'auto', display: 'flex', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Replicas: <b style={{ color: meta.color }}>{replicas}</b></span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Events: <b style={{ color: '#94a3b8' }}>{events}</b></span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)`, borderRadius: '4px', transition: 'width 1s ease', boxShadow: `0 0 8px ${meta.color}60` }} />
        </div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', minWidth: '70px', textAlign: 'right' }}>{latency.toFixed(1)} ms</span>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected]   = useState(false);
  const [cpuData,   setCpuData]     = useState(Array(MAX_POINTS).fill(0));
  const [memData,   setMemData]     = useState(Array(MAX_POINTS).fill(0));
  const [snapshot,  setSnapshot]    = useState(null);
  const [loading,   setLoading]     = useState(false);
  const [result,    setResult]      = useState(null);
  const [history,   setHistory]     = useState([]);
  const [error,     setError]       = useState(null);
  const [tab,       setTab]         = useState('monitor'); // 'monitor' | 'results' | 'history'
  const sseRef = useRef(null);

  // ── SSE connection ──────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API_URL}/api/metrics/stream`);
    es.onopen    = () => setConnected(true);
    es.onerror   = () => { setConnected(false); setTimeout(connectSSE, 5000); };
    es.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        setSnapshot(d);
        setCpuData(prev => [...prev.slice(1), d.cpuUsage]);
        setMemData(prev => [...prev.slice(1), d.memoryUsage]);
      } catch (_) {}
    };
    sseRef.current = es;
  }, []);

  useEffect(() => {
    connectSSE();
    return () => sseRef.current?.close();
  }, [connectSSE]);

  // ── Fetch history on load ───────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/history`).then(r => r.json()).then(setHistory).catch(() => {});
  }, [result]);

  // ── Run Experiment ──────────────────────────────────────────────────────────
  const runExperiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies: ['CPU', 'TREND', 'LATENCY'] }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data);
      setTab('results');
    } catch {
      setError('Experiment failed. Is the backend running?');
    } finally { setLoading(false); }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `experiment-${Date.now()}.json`;
    a.click();
  };

  const maxLatency = result?.strategies
    ? Math.max(...result.strategies.map(s => s.averageResponseTime))
    : 0;

  // ── Styles helpers ──────────────────────────────────────────────────────────
  const tabStyle = active => ({
    padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none',
    cursor: 'pointer', transition: 'all 0.2s',
    background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
    color: active ? '#a5b4fc' : '#475569',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#060b14', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif", padding: '0' }}>

      {/* ── Top Nav ── */}
      <nav style={{ background: 'rgba(8,13,26,0.95)', borderBottom: '1px solid #0f172a', padding: '0 24px', display: 'flex', alignItems: 'center', height: '56px', gap: '24px', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>☁</div>
          <span style={{ fontWeight: 800, fontSize: '15px', background: 'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>CloudScale</span>
        </div>
        <div style={{ height: '20px', width: '1px', background: '#1e293b' }} />
        <div style={{ display: 'flex', gap: '4px' }}>
          {['monitor', 'results', 'history'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
              {t === 'monitor' ? '📡 Monitor' : t === 'results' ? '📊 Results' : '🕐 History'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: connected ? '#34d399' : '#ef4444' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: connected ? '#34d399' : '#ef4444', boxShadow: connected ? '0 0 8px #34d399' : 'none', display: 'inline-block', animation: connected ? 'pulse 2s infinite' : 'none' }} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
          {result && (
            <button onClick={exportJSON} style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: '#a5b4fc', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              ⬇ Export JSON
            </button>
          )}
          <button onClick={runExperiment} disabled={loading || !connected}
            style={{ padding: '8px 20px', fontWeight: 700, fontSize: '13px', color: '#fff', background: loading ? '#1e293b' : 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', borderRadius: '8px', cursor: loading || !connected ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)', opacity: !connected ? 0.5 : 1 }}>
            {loading ? '⚙ Sampling ~15s...' : '▶ Run Experiment'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>

        {/* ── MONITOR TAB ── */}
        {tab === 'monitor' && (
          <>
            {/* Stat Row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <StatCard label="CPU Usage"    value={snapshot?.cpuUsage?.toFixed(1) ?? '--'} unit="%" color="#60a5fa"
                sub={snapshot ? `Status: ${snapshot.status}` : 'Connecting...'} />
              <StatCard label="Memory Usage" value={snapshot?.memoryUsage?.toFixed(1) ?? '--'} unit="%" color="#a78bfa"
                sub="Host RAM" />
              <StatCard label="SSE Stream"   value={connected ? 'LIVE' : 'OFF'} color={connected ? '#34d399' : '#ef4444'}
                sub="Push every 2s" />
              <StatCard label="Last Run"
                value={result ? new Date(result.timestamp).toLocaleTimeString() : '--'}
                color="#f59e0b"
                sub={result ? `Winner: ${result.bestStrategy}` : 'No experiment yet'} />
            </div>

            {/* Chart Panel */}
            <div style={{ background: 'rgba(8,13,26,0.8)', border: '1px solid #0f172a', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>📈 Real-Time System Metrics (last 60 readings)</h2>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {[{label:'CPU', color:'#60a5fa'}, {label:'Memory', color:'#a78bfa'}].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                      <div style={{ width: '24px', height: '2px', background: l.color, borderRadius: '1px' }} />
                      {l.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Y-axis labels */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: '#334155', paddingBottom: '4px', minWidth: '28px', textAlign: 'right' }}>
                  <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
                </div>
                <div style={{ flex: 1 }}>
                  <LineChart series={[
                    { key: 'cpu', data: cpuData, color: '#60a5fa' },
                    { key: 'mem', data: memData, color: '#a78bfa' },
                  ]} height={160} />
                </div>
              </div>
            </div>

            {/* Strategy info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {Object.entries(STRATEGY_META).map(([key, meta]) => (
                <div key={key} style={{ background: 'rgba(8,13,26,0.8)', border: `1px solid ${meta.color}20`, borderRadius: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '24px' }}>{meta.icon}</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: meta.color }}>{meta.label}</h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.7 }}>
                    {key === 'CPU' && 'Monitors real processor load via OSHI. Scales up (+2 replicas) when CPU > 75%, scales down when CPU < 30%.'}
                    {key === 'TREND' && 'Computes CPU growth ratio between consecutive 1-second samples. Proactively scales before overload occurs.'}
                    {key === 'LATENCY' && 'Derived from actual memory pressure on the host. Triggers scaling when response time exceeds thresholds.'}
                  </p>
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: `${meta.color}08`, border: `1px solid ${meta.color}15`, borderRadius: '8px', fontSize: '11px', color: '#334155', fontFamily: 'monospace' }}>
                    {key === 'CPU' && 'trigger: cpu > 75% → +2 replicas'}
                    {key === 'TREND' && 'trigger: growth > 1.2x → +1 replica'}
                    {key === 'LATENCY' && 'trigger: latency > 300ms → +1 replica'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── RESULTS TAB ── */}
        {tab === 'results' && (
          <>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444430', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>⚠ {error}</div>}

            {!result && !loading && (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#334155' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <p style={{ fontSize: '16px', marginBottom: '8px', color: '#475569' }}>No experiment run yet</p>
                <p style={{ fontSize: '13px' }}>Click <b style={{ color: '#6366f1' }}>▶ Run Experiment</b> to sample real server metrics</p>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙</div>
                <p style={{ color: '#475569', fontSize: '14px', marginBottom: '6px' }}>Sampling real CPU & memory...</p>
                <p style={{ color: '#334155', fontSize: '12px' }}>Collecting 15 one-second snapshots from this server</p>
              </div>
            )}

            {result && !loading && (
              <>
                {/* System Metrics Summary */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <StatCard label="Peak CPU (real)"   value={result.peakCpuUsage}  unit="%" color="#f59e0b" sub="Actual server load" />
                  <StatCard label="Peak RAM (real)"   value={result.peakMemUsage}  unit="%" color="#a78bfa" sub="Actual host memory" />
                  <StatCard label="Avg CPU (real)"    value={result.avgCpuUsage}   unit="%" color="#60a5fa" sub={`${result.sampleCount} samples`} />
                  <StatCard label="Best Strategy"     value={result.bestStrategy}  color={STRATEGY_META[result.bestStrategy]?.color || '#34d399'} sub="Lowest avg latency" />
                </div>

                {/* Strategy Comparison */}
                <div style={{ background: 'rgba(8,13,26,0.8)', border: '1px solid #0f172a', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', marginBottom: '16px' }}>
                    🏆 Strategy Comparison — {result.sampleCount} real samples
                  </h2>
                  {result.strategies?.sort((a, b) => a.averageResponseTime - b.averageResponseTime).map(s => (
                    <StrategyBar
                      key={s.strategy}
                      name={s.strategy}
                      latency={s.averageResponseTime}
                      replicas={s.finalReplicas}
                      events={s.scalingEventCount}
                      isBest={s.strategy === result.bestStrategy}
                      maxLatency={maxLatency}
                    />
                  ))}
                </div>

                {/* Scaling Events for best strategy */}
                <div style={{ background: 'rgba(8,13,26,0.8)', border: '1px solid #0f172a', borderRadius: '16px', padding: '20px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', marginBottom: '16px' }}>
                    📋 Scaling Events — {result.bestStrategy} (Winner)
                  </h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #0f172a' }}>
                          {['Time', 'Strategy', 'Transition', 'Reason'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#334155', fontWeight: 600, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(result.scalingEvents?.length === 0) ? (
                          <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#1e293b' }}>No scaling events — system load was stable.</td></tr>
                        ) : result.scalingEvents?.map((ev, i) => {
                          const meta = STRATEGY_META[ev.strategyName] || STRATEGY_META.CPU;
                          const up   = ev.newReplicas > ev.oldReplicas;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #080d1a', transition: 'background 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,23,42,0.8)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '10px 12px', color: '#334155', fontFamily: 'monospace' }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>{ev.strategyName}</span>
                              </td>
                              <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                                <span style={{ color: '#334155' }}>{ev.oldReplicas}</span>
                                <span style={{ margin: '0 6px', color: '#1e293b' }}>→</span>
                                <span style={{ color: up ? '#34d399' : '#f87171', fontWeight: 700 }}>{ev.newReplicas} {up ? '▲' : '▼'}</span>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#475569' }}>{ev.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', marginBottom: '16px' }}>🕐 Experiment History (last 10 runs)</h2>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#334155' }}>No runs yet — start an experiment first.</div>
            ) : history.map((h, i) => (
              <div key={i} style={{ background: 'rgba(8,13,26,0.8)', border: '1px solid #0f172a', borderRadius: '12px', padding: '16px 20px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#334155', fontFamily: 'monospace', minWidth: '80px' }}>{new Date(h.runAt).toLocaleTimeString()}</span>
                <span style={{ fontWeight: 700, color: STRATEGY_META[h.bestStrategy]?.color || '#60a5fa', fontSize: '14px' }}>🏆 {h.bestStrategy}</span>
                <span style={{ fontSize: '12px', color: '#475569' }}>Peak CPU: <b style={{ color: '#f59e0b' }}>{h.peakCpuUsage}%</b></span>
                <span style={{ fontSize: '12px', color: '#475569' }}>Peak RAM: <b style={{ color: '#a78bfa' }}>{h.peakMemUsage}%</b></span>
                <span style={{ fontSize: '12px', color: '#475569' }}>Samples: <b style={{ color: '#94a3b8' }}>{h.sampleCount}</b></span>
                <button onClick={() => { setResult(h); setTab('results'); }}
                  style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: '#a5b4fc', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  View →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
