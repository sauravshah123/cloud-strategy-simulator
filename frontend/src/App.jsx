import { useState } from 'react';

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runExperiment = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('http://localhost:8080/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['CPU', 'TREND', 'LATENCY']),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 text-slate-100 bg-slate-900 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Cloud Strategy Simulator
            </h1>
            <p className="mt-2 text-slate-400">Evaluate auto-scaling strategies under simulated workloads.</p>
          </div>
          <button 
            onClick={runExperiment}
            disabled={loading}
            className="px-6 py-3 font-semibold text-white transition-all bg-blue-600 rounded-lg shadow-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-blue-500/25"
          >
            {loading ? 'Simulating...' : 'Run Experiment'}
          </button>
        </div>

        {/* Results View */}
        {result && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-xl">
              <h2 className="mb-4 text-xl font-semibold">Experiment Results</h2>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-400">Best Strategy</p>
                  <p className="text-2xl font-bold text-emerald-400">{result.bestStrategy || 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-400">Final Replicas</p>
                  <p className="text-2xl font-bold text-blue-400">{result.finalReplicas}</p>
                </div>
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-400">Avg Response Time</p>
                  <p className="text-2xl font-bold text-purple-400">{result.averageResponseTime?.toFixed(2)} ms</p>
                </div>
              </div>
            </div>

            {/* Scaling Events Table */}
            <div className="p-6 bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-xl">
              <h3 className="mb-4 text-lg font-semibold">Scaling Events Timeline</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-3 pr-4 font-medium">Time</th>
                      <th className="py-3 pr-4 font-medium">Strategy</th>
                      <th className="py-3 pr-4 font-medium">Transition</th>
                      <th className="py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.scalingEvents?.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-4 text-center text-slate-500">No scaling events triggered.</td>
                      </tr>
                    ) : (
                      result.scalingEvents?.map((event, i) => (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 pr-4 text-sm text-slate-400">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${event.strategyName === result.bestStrategy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'}`}>
                              {event.strategyName}
                            </span>
                          </td>
                          <td className="py-3 pr-4 font-mono text-sm">
                            <span className="text-slate-400">{event.oldReplicas}</span>
                            <span className="mx-2 text-slate-600">→</span>
                            <span className={event.newReplicas > event.oldReplicas ? 'text-emerald-400' : 'text-red-400'}>
                              {event.newReplicas}
                            </span>
                          </td>
                          <td className="py-3 text-sm text-slate-300">{event.reason}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
