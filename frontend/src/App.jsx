import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL
  ? `https://${import.meta.env.VITE_API_URL}`
  : 'http://localhost:8080';

const strategyColors = {
  CPU:     { bg: 'rgba(59,130,246,0.15)',  border: '#3b82f6', text: '#93c5fd' },
  TREND:   { bg: 'rgba(16,185,129,0.15)',  border: '#10b981', text: '#6ee7b7' },
  LATENCY: { bg: 'rgba(168,85,247,0.15)', border: '#a855f7', text: '#d8b4fe' },
};

function GaugeBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = value > 80 ? '#ef4444' : value > 50 ? '#f59e0b' : color;
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: barColor }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '4px', transition: 'width 0.8s ease, background 0.3s' }} />
      </div>
    </div>
  );
}

function App() {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [liveMetrics, setLive]  = useState(null);
  const pollRef = useRef(null);

  // Poll /api/metrics every 2 seconds for live system stats
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_URL}/api/metrics`);
        if (res.ok) setLive(await res.json());
      } catch (_) { /* backend offline */ }
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
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setResult(await res.json());
    } catch (err) {
      setError('Backend is offline. Start it with: .\\apache-maven-3.9.6\\bin\\mvn.cmd clean spring-boot:run');
    } finally {
      setLoading(false);
    }
  };

  const best   = result?.bestStrategy;
  const colors = best ? (strategyColors[best] || strategyColors.CPU) : strategyColors.CPU;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', padding: '32px 24px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-20%', right: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: '960px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '20px', padding: '4px 14px', marginBottom: '12px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: liveMetrics ? '#6ee7b7' : '#64748b', boxShadow: liveMetrics ? '0 0 8px #6ee7b7' : 'none', display: 'inline-block', animation: liveMetrics ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 500 }}>{liveMetrics ? 'Backend Connected — Live Metrics Active' : 'Connecting to backend...'}</span>
            </div>
            <h1 style={{ fontSize: '34px', fontWeight: 800, background: 'linear-gradient(90deg, #60a5fa, #34d399, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>
              Cloud Strategy Simulator
            </h1>
            <p style={{ marginTop: '6px', color: '#64748b', fontSize: '14px' }}>Real-time CPU, memory & latency from this server — not simulated.</p>
          </div>
          <button onClick={runExperiment} disabled={loading} style={{ padding: '12px 28px', fontWeight: 700, fontSize: '14px', color: '#fff', background: loading ? '#334155' : 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 24px rgba(99,102,241,0.4)', transition: 'all 0.2s ease', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {loading ? '⚙ Sampling real metrics (~15s)...' : '▶ Run Experiment'}
          </button>
        </div>

        {/* Live Metrics Panel */}
        {liveMetrics && (
          <div style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '24px', backdropFilter: 'blur(10px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '16px' }}>📡</span>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>Live Server Metrics</h2>
              <span style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 10px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }}>
                {liveMetrics.status} LOAD
              </span>
            </div>
            <GaugeBar label="CPU Usage" value={liveMetrics.cpuUsage} color="#60a5fa" />
            <GaugeBar label="Memory Usage" value={liveMetrics.memoryUsage} color="#a78bfa" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', color: '#fca5a5', fontSize: '13px', fontFamily: 'monospace' }}>
            ⚠ {error}
          </div>
        )}

        {/* Strategy Info Cards */}
        {!result && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {[
              { key: 'CPU',     icon: '🖥', title: 'CPU Strategy',     desc: 'Scales when real CPU usage exceeds 75%. Tracks actual processor load on this server.' },
              { key: 'TREND',   icon: '📈', title: 'Trend Strategy',   desc: 'Detects rising CPU trends between 1-second samples. Scales before overload hits.' },
              { key: 'LATENCY', icon: '⏱', title: 'Latency Strategy', desc: 'Reacts to high response times derived from real memory pressure.' },
            ].map(s => (
              <div key={s.key} style={{ background: 'rgba(30,41,59,0.6)', border: `1px solid ${strategyColors[s.key].border}30`, borderRadius: '12px', padding: '20px', backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>{s.icon}</div>
                <h3 style={{ fontWeight: 700, color: strategyColors[s.key].text, marginBottom: '8px', fontSize: '14px' }}>{s.title}</h3>
                <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Experiment Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease' }}>

            {/* Winner Banner */}
            <div style={{ background: `linear-gradient(135deg, ${colors.bg}, rgba(15,23,42,0.8))`, border: `1px solid ${colors.border}50`, borderRadius: '16px', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '48px' }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '4px' }}>Best Strategy This Run</p>
                  <p style={{ fontSize: '34px', fontWeight: 900, color: colors.text }}>{best || 'N/A'}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Lowest avg latency across 15 real system samples</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Final Replicas',   value: result.finalReplicas,                      color: colors.text },
                    { label: 'Avg Latency',       value: `${result.averageResponseTime?.toFixed(0)} ms`, color: colors.text },
                    { label: 'Peak CPU (real)',   value: `${result.peakCpuUsage?.toFixed(1)}%`,    color: '#f59e0b' },
                    { label: 'Peak Memory (real)',value: `${result.peakMemoryUsage?.toFixed(1)}%`, color: '#a78bfa' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(30,41,59,0.8)', border: `1px solid ${color}40`, borderRadius: '10px', padding: '14px 18px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '6px' }}>{label}</p>
                      <p style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scaling Events Table */}
            <div style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', color: '#e2e8f0' }}>
                📊 Scaling Events Timeline
                <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 400, color: '#64748b' }}>({result.scalingEvents?.length || 0} events from real CPU/memory data)</span>
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {['Time', 'Strategy', 'Transition', 'Reason'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.scalingEvents?.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>No scaling events triggered — system load was stable.</td></tr>
                    ) : (
                      result.scalingEvents?.map((event, i) => {
                        const sc = strategyColors[event.strategyName] || strategyColors.CPU;
                        const up = event.newReplicas > event.oldReplicas;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1e293b', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(51,65,85,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '12px', color: '#475569', fontFamily: 'monospace' }}>{new Date(event.timestamp).toLocaleTimeString()}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}40` }}>{event.strategyName}</span>
                            </td>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                              <span style={{ color: '#64748b' }}>{event.oldReplicas}</span>
                              <span style={{ margin: '0 8px', color: '#334155' }}>→</span>
                              <span style={{ color: up ? '#34d399' : '#f87171', fontWeight: 700 }}>{event.newReplicas}</span>
                              <span style={{ marginLeft: '6px', fontSize: '11px' }}>{up ? '▲' : '▼'}</span>
                            </td>
                            <td style={{ padding: '12px', color: '#94a3b8' }}>{event.reason}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default App;
