import { useState } from 'react';

const strategyColors = {
  CPU: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', text: '#93c5fd', badge: '#1d4ed8' },
  TREND: { bg: 'rgba(16,185,129,0.15)', border: '#10b981', text: '#6ee7b7', badge: '#065f46' },
  LATENCY: { bg: 'rgba(168,85,247,0.15)', border: '#a855f7', text: '#d8b4fe', badge: '#6b21a8' },
};

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(30,41,59,0.8)',
      border: `1px solid ${color}40`,
      borderRadius: '12px',
      padding: '20px 24px',
      backdropFilter: 'blur(10px)',
    }}>
      <p style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '8px' }}>{label}</p>
      <p style={{ fontSize: '28px', fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runExperiment = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('http://localhost:8080/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['CPU', 'TREND', 'LATENCY']),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError('Backend is offline. Start it with: .\\apache-maven-3.9.6\\bin\\mvn.cmd clean spring-boot:run');
    } finally {
      setLoading(false);
    }
  };

  const best = result?.bestStrategy;
  const colors = best ? (strategyColors[best] || strategyColors.CPU) : strategyColors.CPU;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', padding: '32px 24px', fontFamily: "'Inter', sans-serif" }}>
      
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-20%', right: '-10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '40px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '20px', padding: '4px 14px', marginBottom: '16px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6ee7b7', boxShadow: '0 0 8px #6ee7b7', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 500 }}>Cloud-Agnostic Simulator</span>
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, background: 'linear-gradient(90deg, #60a5fa, #34d399, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>
              Cloud Strategy Simulator
            </h1>
            <p style={{ marginTop: '8px', color: '#64748b', fontSize: '15px' }}>
              Compare CPU, Trend & Latency auto-scaling strategies on the same live workload.
            </p>
          </div>
          <button
            onClick={runExperiment}
            disabled={loading}
            style={{
              padding: '12px 28px',
              fontWeight: 700,
              fontSize: '14px',
              color: '#fff',
              background: loading ? '#334155' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
              border: 'none',
              borderRadius: '10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 24px rgba(99,102,241,0.4)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {loading ? '⚙ Simulating...' : '▶ Run Experiment'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', color: '#fca5a5', fontSize: '13px', fontFamily: 'monospace' }}>
            ⚠ {error}
          </div>
        )}

        {/* Strategy Explanation Cards */}
        {!result && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {[
              { key: 'CPU', icon: '🖥', title: 'CPU Strategy', desc: 'Scales up when CPU usage exceeds 75%. Best for compute-heavy workloads.' },
              { key: 'TREND', icon: '📈', title: 'Trend Strategy', desc: 'Predicts future load from traffic trend. Scales before the spike hits.' },
              { key: 'LATENCY', icon: '⏱', title: 'Latency Strategy', desc: 'Reacts to high response times. Keeps user experience fast.' },
            ].map(s => (
              <div key={s.key} style={{ background: 'rgba(30,41,59,0.6)', border: `1px solid ${strategyColors[s.key].border}30`, borderRadius: '12px', padding: '20px', backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>{s.icon}</div>
                <h3 style={{ fontWeight: 700, color: strategyColors[s.key].text, marginBottom: '8px', fontSize: '14px' }}>{s.title}</h3>
                <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease' }}>

            {/* Winner Banner */}
            <div style={{
              background: `linear-gradient(135deg, ${colors.bg}, rgba(15,23,42,0.8))`,
              border: `1px solid ${colors.border}50`,
              borderRadius: '16px',
              padding: '24px 28px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: '48px' }}>🏆</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '4px' }}>Best Strategy This Run</p>
                <p style={{ fontSize: '36px', fontWeight: 900, color: colors.text }}>{best || 'N/A'}</p>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Won with lowest average response time across 15 simulation steps</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <StatCard label="Final Replicas" value={result.finalReplicas} color={colors.text} />
                <StatCard label="Avg Latency" value={`${result.averageResponseTime?.toFixed(0)} ms`} color={colors.text} />
              </div>
            </div>

            {/* Scaling Events Table */}
            <div style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: '#e2e8f0' }}>
                📊 Scaling Events Timeline
                <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: 500, color: '#64748b' }}>
                  ({result.scalingEvents?.length || 0} events)
                </span>
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
                      <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>No scaling events triggered.</td></tr>
                    ) : (
                      result.scalingEvents?.map((event, i) => {
                        const sc = strategyColors[event.strategyName] || strategyColors.CPU;
                        const isScaleUp = event.newReplicas > event.oldReplicas;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #1e293b', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(51,65,85,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '12px', color: '#475569', fontFamily: 'monospace' }}>
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}40` }}>
                                {event.strategyName}
                              </span>
                            </td>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                              <span style={{ color: '#64748b' }}>{event.oldReplicas}</span>
                              <span style={{ margin: '0 8px', color: '#334155' }}>→</span>
                              <span style={{ color: isScaleUp ? '#34d399' : '#f87171', fontWeight: 700 }}>{event.newReplicas}</span>
                              <span style={{ marginLeft: '6px', fontSize: '11px' }}>{isScaleUp ? '▲' : '▼'}</span>
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default App;
