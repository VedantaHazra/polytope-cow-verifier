import React, { useState, useRef, useEffect } from 'react';

export default function RedTeamSandbox() {
  const [isShadowMode, setIsShadowMode] = useState(false);
  const [logs, setLogs] = useState([]);
  const terminalEndRef = useRef(null);
  
  const templates = {
    valid_batch: JSON.stringify({
      solver_address: "0xDefiSolverA...",
      executed_buy_amount: 1500000,
      limit_buy_amount: 1495000,
      clearing_price_valid: true,
      fee_attached: 500,
      network_base_fee: 450
    }, null, 2),
    slippage_violation: JSON.stringify({
      solver_address: "0xDefiSolverB...",
      executed_buy_amount: 1490000, // Fails: Less than limit
      limit_buy_amount: 1495000,
      clearing_price_valid: true,
      fee_attached: 500,
      network_base_fee: 450
    }, null, 2),
    clearing_price_fault: JSON.stringify({
      solver_address: "0xDefiSolverC...",
      executed_buy_amount: 1500000,
      limit_buy_amount: 1495000,
      clearing_price_valid: false, // Fails: Uniform price violated
      fee_attached: 500,
      network_base_fee: 450
    }, null, 2)
  };

  const [payload, setPayload] = useState(templates.slippage_violation);
  const [activeTemplate, setActiveTemplate] = useState('slippage_violation');

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleTemplateChange = (e) => {
    const key = e.target.value;
    setActiveTemplate(key);
    setPayload(templates[key]);
  };

  const handleToggleMode = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/toggle-mode', { method: 'POST' });
      const data = await res.json();
      setIsShadowMode(data.shadow_mode);
      addLog(`[SYSTEM] Node mode switched to: ${data.shadow_mode ? 'SHADOW (Monitor Only)' : 'ENFORCEMENT (Blocking)'}`);
    } catch (err) {
      addLog(`[ERROR] Failed to toggle mode. Is the Go node running?`);
    }
  };

  const handleLaunchAttack = async () => {
    addLog(`[EVALUATING] Intercepting batch payload from ${JSON.parse(payload).solver_address || 'Unknown'}...`);
    const startTime = performance.now();
    
    try {
      const res = await fetch('http://localhost:8080/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      
      const latency = (performance.now() - startTime).toFixed(2);
      const responseData = await res.json();
      
      if (res.status === 200) {
        if (responseData.status === 'shadow_blocked') {
          addLog(`[SHADOW_BLOCKED] UNSAT: Batch breached constraint. Flagged to ledger. (${latency}ms)\n   |- Reason: ${responseData.reason}`);
        } else {
          addLog(`[SUCCESS] SAT: Batch satisfies all CoW invariants. Cleared for on-chain submission. (${latency}ms)`);
        }
      } else if (res.status === 403) {
        addLog(`[REVERT_PREVENTED] UNSAT: Batch blocked off-chain! (${latency}ms)\n   |- Reason: ${responseData.reason}`);
      }
    } catch (err) {
      addLog(`[FATAL] Network Error: Could not reach Polytope Node.`);
    }
  };

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 });
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev]);
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center bg-[#0a0f1a] border border-slate-800 p-4 rounded-xl shadow-lg mb-6">
        <div className="text-sm font-black tracking-widest text-slate-300 px-2">NODE CONTROL</div>
        <div className="flex items-center space-x-4 bg-[#030712] px-4 py-2 rounded-xl border border-slate-800">
          <span className={`text-xs font-black tracking-widest ${!isShadowMode ? 'text-red-500' : 'text-slate-600'}`}>ENFORCE</span>
          <button onClick={handleToggleMode} className={`w-16 h-8 flex items-center rounded-full p-1 transition-all duration-300 ${isShadowMode ? 'bg-amber-500' : 'bg-red-600'}`}>
            <div className={`bg-white w-6 h-6 rounded-full transform transition-transform duration-300 ${isShadowMode ? 'translate-x-8' : 'translate-x-0'}`}></div>
          </button>
          <span className={`text-xs font-black tracking-widest ${isShadowMode ? 'text-amber-500' : 'text-slate-600'}`}>SHADOW</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[600px]">
        <div className="lg:col-span-5 bg-[#0a0f1a] border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="flex justify-between items-center px-6 py-4 bg-[#030712] border-b border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">CoW Settlement Payload</span>
            <select value={activeTemplate} onChange={handleTemplateChange} className="bg-[#0a0f1a] text-xs text-slate-200 border border-slate-700 rounded px-3 py-1.5 outline-none">
              <option value="valid_batch">Valid Batch (Clears)</option>
              <option value="slippage_violation">Slippage Violation (Reverts)</option>
              <option value="clearing_price_fault">Clearing Price Fault (Reverts)</option>
            </select>
          </div>
          <textarea value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck="false" className="flex-1 bg-transparent text-emerald-400 font-mono text-[13px] p-6 outline-none resize-none" />
          <div className="p-4 bg-[#030712] border-t border-slate-800">
            <button onClick={handleLaunchAttack} className="w-full font-black py-4 rounded-lg transition-all bg-indigo-600 hover:bg-indigo-500 text-white">
              EVALUATE BATCH PAYLOAD
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-black border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
          <div className="p-4 bg-[#0a0f1a] border-b border-slate-800 flex items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Z3 Constraint Matrix Logs</span>
          </div>
          <div className="p-6 overflow-y-auto font-mono text-sm space-y-2 flex-1">
            {logs.length === 0 ? (
              <div className="text-slate-600 flex items-center h-full justify-center opacity-50">Awaiting solver traffic...</div>
            ) : (
              [...logs].reverse().map((log, index) => {
                let color = "text-slate-300";
                if (log.includes('UNSAT') && log.includes('REVERT_PREVENTED')) color = "text-rose-400 font-bold bg-rose-950/20 p-4 border border-rose-900/30 rounded-xl mt-2 mb-2 w-full";
                if (log.includes('SHADOW_BLOCKED')) color = "text-amber-400 font-bold bg-amber-950/20 p-4 border border-amber-900/30 rounded-xl mt-2 mb-2 w-full";
                if (log.includes('SAT')) color = "text-emerald-400 font-bold";
                if (log.includes('SYSTEM')) color = "text-indigo-400";
                return (
                  <div key={index} className={`${color} break-words leading-relaxed`}>
                    {log.split('\n').map((line, i) => (
                      <div key={i} className={line.includes('|-') ? "ml-6 mt-1.5 text-rose-300 font-normal text-xs" : ""}>{line}</div>
                    ))}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}