import React, { useState, useEffect } from 'react';
import RedTeamSandbox from './RedTeamSandbox';

export default function App() {
  const [activeTab, setActiveTab] = useState('sandbox');
  const [ledger, setLedger] = useState([]);
  const [expandedAuditId, setExpandedAuditId] = useState(null);

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const res = await fetch("http://localhost:8080/api/ledger");
        const data = await res.json();
        if (data && data.length > 0) {
          setLedger(data);
        }
      } catch (e) {
        // Fails silently if proxy node is offline
      }
    };
    
    fetchLedger();
    const interval = setInterval(fetchLedger, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex font-sans antialiased selection:bg-indigo-500/30">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0a0f1a] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse"></div>
            <span className="font-mono text-sm font-black tracking-widest text-slate-200 uppercase">
              Polytope Node
            </span>
          </div>
          
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'sandbox'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              Pre-Flight Sandbox
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'ledger'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              Settlement Ledger ({ledger.length})
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#030712]/50">
          <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">
            Target Environment
          </div>
          <div className="text-xs font-bold text-slate-300">
            CoW Protocol GPv2
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeTab === 'sandbox' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                Pre-Flight Solver Sandbox
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Simulate combinatorial batch execution scripts against hardcoded CoW Protocol invariants. Intercept transactions locally to detect and prevent on-chain reverts.
              </p>
            </div>
            <RedTeamSandbox />
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                Evaluation History Ledger
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Real-time cryptographic trail tracking solver traffic validated by the local Z3 execution model.
              </p>
            </div>

            <div className="bg-[#0a0f1a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#030712] border-b border-slate-800 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                    <th className="py-4 px-6">Timestamp</th>
                    <th className="py-4 px-6">Evaluation ID</th>
                    <th className="py-4 px-6">Target Action</th>
                    <th className="py-4 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-sm font-mono">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-12 text-center text-slate-500 opacity-50">
                        No transactions parsed by verification context.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((log) => (
                      <React.Fragment key={log.hash}>
                        <tr
                          onClick={() => setExpandedAuditId(expandedAuditId === log.hash ? null : log.hash)}
                          className="hover:bg-slate-800/20 cursor-pointer transition-colors duration-150"
                        >
                          <td className="py-4 px-6 text-slate-400 text-xs">{log.timestamp}</td>
                          <td className="py-4 px-6 text-slate-500 text-xs">{log.hash}</td>
                          <td className="py-4 px-6 text-slate-300 text-xs font-semibold">{log.action}</td>
                          <td className="py-4 px-6 text-xs">
                            <span className={`px-2.5 py-1 rounded-md font-black tracking-wider text-[10px] uppercase border ${
                              log.status === 'VERIFIED'
                                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/30'
                                : log.status.includes('SHADOW')
                                ? 'bg-amber-950/30 text-amber-400 border-amber-900/30'
                                : 'bg-rose-950/30 text-rose-400 border-rose-900/30'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                        {expandedAuditId === log.hash && (
                          <tr className="bg-[#030712]/40">
                            <td colSpan="4" className="p-6 border-t border-slate-800/40">
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                                    Mathematical Resolution Trace
                                  </span>
                                  <div className="p-4 bg-[#0a0f1a] text-slate-300 rounded-xl font-mono text-xs border border-slate-800 leading-relaxed">
                                    {log.reason}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}