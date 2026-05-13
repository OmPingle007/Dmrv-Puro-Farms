import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Shield, FileWarning, AlertTriangle, Flag, Truck, FileSignature, Thermometer, FlaskConical, Cloud, Download } from "lucide-react";

export default function Auditor() {
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [traceData, setTraceData] = useState<any>(null);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [allFlags, setAllFlags] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showNCRModal, setShowNCRModal] = useState(false);
  const [showDocumentStore, setShowDocumentStore] = useState(false);
  const [ncrForm, setNcrForm] = useState({ field: '', description: '' });

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab') || 'workspace';

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchBatches();
    fetchNcrs();
    fetchDispatches();
  }, []);

  const fetchBatches = async () => {
    const res = await fetch("/api/batches", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setBatches(data.filter((b: any) => b.status === 'CARBON_CALCULATED' || b.status === 'CORC_INELIGIBLE'));
    }
  };

  const fetchNcrs = async () => {
    const res = await fetch("/api/flags", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setAllFlags(data);
      setNcrs(data.filter((f: any) => f.rule_id === 'AUDIT-NCR'));
    }
  };

  const fetchDispatches = async () => {
    const res = await fetch("/api/dispatches", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setDispatches(await res.json());
    }
  };

  const selectBatch = async (b: any) => {
    setSelectedBatchId(b.id);
    setVerificationResult(null);
    setMsg("");
    const res = await fetch(`/api/batches/${b.id}/trace`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setTraceData(await res.json());
    }
  };

  const handleVerify = async () => {
    if (!selectedBatchId) return;
    setIsVerifying(true);
    setVerificationResult(null);
    setMsg("");
    try {
      const res = await fetch(`/api/batches/${selectedBatchId}/verify_hash`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setVerificationResult(data);
      } else {
        setVerificationResult({ status: 'ERROR' });
      }
    } catch (e) {
      setVerificationResult({ status: 'ERROR' });
    }
    setIsVerifying(false);
  };

  const submitNCR = async (e: any) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    const res = await fetch(`/api/batches/${selectedBatchId}/ncr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(ncrForm)
    });
    if (res.ok) {
      setMsg("Non-Conformance Report raised successfully.");
      setShowNCRModal(false);
      setNcrForm({ field: '', description: '' });
      fetchNcrs();
    } else {
      setMsg("Failed to raise NCR.");
    }
  };

  const handleResolveFlag = async (flagId: number, status: string) => {
    const res = await fetch(`/api/flags/${flagId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    if (res.ok) fetchNcrs();
  };

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {tab === 'workspace' ? 'Audit Workspace' : tab === 'ncr' ? 'Non-Conformance Reports' : tab === 'flags' ? 'System Flags' : 'Auditor Console'}
              </h1>
              <p className="text-slate-500 text-sm mt-1">Read-only batch lineage • VVB Auditor</p>
            </div>
            {tab === 'workspace' && selectedBatchId && (
               <button onClick={() => setShowNCRModal(true)} className="flex items-center px-4 py-2 bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-semibold transition-colors">
                  <FileWarning size={16} className="mr-2" /> Raise NCR
               </button>
            )}
          </div>

          {msg && <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold uppercase rounded-lg shadow-sm">{msg}</div>}

          {tab === 'workspace' && !selectedBatchId && (
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="w-full lg:w-1/3 space-y-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Batch to Inspect</div>
                {batches.map(b => (
                  <div key={b.id} onClick={() => selectBatch(b)} className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div className="font-mono font-bold text-emerald-700 text-sm">{b.batch_id_label}</div>
                      <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${b.status === 'CORC_INELIGIBLE' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-[#e4fcf1] text-[#18a058] border border-emerald-100'}`}>
                        {b.status.replace('_', ' ')}
                      </div>
                    </div>
                    {b.status === 'CARBON_CALCULATED' && b.yield_ratio != null && (
                       <div className="text-xs text-slate-500 mt-2 font-mono">{(b.yield_ratio * 100).toFixed(1)}% yield</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="w-full lg:w-2/3 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-12 min-h-[300px]">
                <div className="text-center">
                  <Shield size={32} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500">Select a batch to view its complete audit lineage</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'workspace' && selectedBatchId && traceData && (
             <div className="space-y-6">
               <div className="flex items-center text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-full px-4 py-2 inline-flex mb-2 shadow-sm cursor-pointer hover:bg-slate-50" onClick={() => setSelectedBatchId(null)}>
                 ← Back to Directory
               </div>

               <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                 <div className="px-5 py-4 border-b border-slate-100 flex items-center bg-slate-50">
                    <Shield size={18} className="text-slate-700 mr-2" />
                    <h2 className="font-bold text-slate-800 tracking-tight">Full Audit Trail</h2>
                 </div>
                 
                 <div className="p-5">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Batch ID</div>
                       <div className="font-mono font-black text-slate-700">{traceData.batch.batch_id_label}</div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Status</div>
                       <div className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded ${traceData.batch.status === 'CORC_INELIGIBLE' ? 'bg-red-50 text-red-600' : 'bg-[#e4fcf1] text-[#18a058]'}`}>
                          {traceData.batch.status.replace('_', ' ')}
                       </div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Plant</div>
                       <div className="font-medium text-slate-700">{traceData.batch.plant_code}</div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Dry Mass</div>
                       <div className="font-mono font-medium text-slate-700">{traceData.batch.qbiochar_dry != null ? traceData.batch.qbiochar_dry.toFixed(3) : '-'} t</div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Yield %</div>
                       <div className="font-mono font-medium text-slate-700">{traceData.batch.yield_ratio != null ? (traceData.batch.yield_ratio * 100).toFixed(1) : '-'}%</div>
                     </div>
                     <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">CORCs Net</div>
                       <div className="font-mono font-medium text-slate-700">{traceData.carbon?.corcs_net != null ? traceData.carbon.corcs_net.toFixed(4) : '-'} tCO₂e</div>
                     </div>
                   </div>

                   <div className={`p-4 rounded-lg mb-8 border ${verificationResult?.status === 'TAMPERED' ? 'bg-red-50 border-red-200' : verificationResult?.status === 'VERIFIED' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
                     <div className="flex justify-between items-start mb-2">
                       <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500"># SHA-256 Hash Chain</h3>
                       <button 
                         onClick={handleVerify}
                         disabled={isVerifying}
                         className="text-[10px] font-bold uppercase bg-white border border-slate-300 text-slate-700 px-3 py-1 rounded hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                       >
                         {isVerifying ? "Verifying..." : "Verify Hash"}
                       </button>
                     </div>
                     <div className="font-mono text-xs text-slate-600 break-all">{traceData.batch.record_hash}</div>
                     {traceData.batch.previous_batch_hash ? (
                        <div className="text-xs font-mono text-slate-400 mt-1">← {traceData.batch.previous_batch_hash.substring(0,8)}...</div>
                     ) : (
                        <div className="text-xs font-mono text-slate-400 mt-1">← GENESIS</div>
                     )}
                     
                     {verificationResult && (
                       <div className={`mt-3 p-3 rounded-md border text-sm font-semibold flex items-center ${verificationResult.status === 'TAMPERED' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-[#e4fcf1] border-[#18a058]/30 text-[#0e4b31]'}`}>
                         {verificationResult.status === 'TAMPERED' ? (
                           <>
                             <AlertTriangle size={16} className="mr-2 text-red-600" /> 
                             CRITICAL: HASH MISMATCH. Record Tampered.
                           </>
                         ) : (
                           <>
                             <Shield size={16} className="mr-2 text-[#18a058]" /> 
                             Integrity Verified. Hashes match continuously.
                           </>
                         )}
                       </div>
                     )}
                   </div>

                   {/* Deliveries */}
                   <div className="mb-8">
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Feedstock Deliveries ({traceData.deliveries.length})</h3>
                     <div className="space-y-1">
                       {traceData.deliveries.map((d: any) => (
                         <div key={d.id} className="bg-slate-50 border border-slate-100 rounded px-4 py-2.5 flex items-center justify-between text-sm">
                           <div className="flex gap-4 items-center font-mono">
                             <span className="text-slate-600">{d.vehicle_number || "Unknown"}</span>
                             <span className="font-semibold text-slate-800">{d.wet_mass_tonnes != null ? d.wet_mass_tonnes.toFixed(3) : '-'} t</span>
                             <span className="text-slate-500">M: {d.moisture_avg != null ? d.moisture_avg.toFixed(2) : '-'}%</span>
                           </div>
                           <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${d.status === 'FLAGGED' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                             {d.status}
                           </div>
                         </div>
                       ))}
                       {traceData.deliveries.length === 0 && <div className="text-sm text-slate-400 italic">No feedstock records linked.</div>}
                     </div>
                   </div>

                   {/* PLC Logs */}
                   <div className="mb-8">
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">PLC Logs ({traceData.plcLogs.length})</h3>
                     <div className="space-y-1">
                       {traceData.plcLogs.map((p: any) => (
                         <div key={p.id} className="bg-slate-50/50 border border-slate-100 rounded px-4 py-2 flex items-center gap-6 text-sm font-mono">
                           <span className="text-slate-500">{p.instrument_id}</span>
                           <span className="text-orange-600 font-semibold">{p.temp_c != null ? p.temp_c.toFixed(1) : '-'} °C</span>
                           <span className="text-slate-600">{p.residence_time_min != null ? p.residence_time_min.toFixed(1) : '-'} min</span>
                         </div>
                       ))}
                       {traceData.plcLogs.length === 0 && <div className="text-sm text-slate-400 italic">No telemetry data.</div>}
                     </div>
                   </div>

                   {/* Lab & Carbon */}
                   <div className="mb-8">
                     <div className="flex justify-between items-end mb-3">
                       <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Certificate of Analysis</h3>
                       {traceData.coa && (
                           <button onClick={() => setShowDocumentStore(true)} className="flex items-center text-xs text-blue-600 font-semibold hover:text-blue-800">
                             <Download size={14} className="mr-1" /> Document Store
                           </button>
                       )}
                     </div>
                     {traceData.coa ? (
                       <div className="grid grid-cols-3 gap-2 text-sm font-mono">
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">Ctot</div>
                           {traceData.coa.ctot_pct}%
                         </div>
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">Cinorg</div>
                           {traceData.coa.cinorg_pct}%
                         </div>
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">Corg</div>
                           {traceData.coa.corg_pct}%
                         </div>
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">mH</div>
                           {traceData.coa.mh_pct}%
                         </div>
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">H/Corg</div>
                           {traceData.coa.hcorg_ratio}
                         </div>
                         <div className="bg-slate-50 p-3 rounded border border-slate-100">
                           <div className="text-[10px] uppercase font-sans text-slate-400 mb-1">Report Date</div>
                           {traceData.coa.report_date.split('T')[0]}
                         </div>
                       </div>
                     ) : (
                       <div className="text-sm text-slate-400 italic">No lab analysis found.</div>
                     )}
                   </div>

                   <div className="mb-8">
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Carbon Calculation</h3>
                     {traceData.carbon ? (
                       <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                         <div className="bg-slate-50 px-4 py-2 rounded flex justify-between">
                           <span className="text-slate-500 font-sans">D05 Cstored</span>
                           <span className="font-semibold">{traceData.carbon.cstored?.toFixed(4)} tCO₂e</span>
                         </div>
                         <div className="bg-slate-50 px-4 py-2 rounded flex justify-between">
                           <span className="text-slate-500 font-sans">D06 Closs</span>
                           <span className="font-semibold">{traceData.carbon.closs?.toFixed(4)} tCO₂e</span>
                         </div>
                         <div className="bg-slate-50 px-4 py-2 rounded flex justify-between">
                           <span className="text-slate-500 font-sans">D09 Eproduction</span>
                           <span className="font-semibold">{traceData.carbon.eproduction?.toFixed(4)} tCO₂e</span>
                         </div>
                         <div className="bg-slate-50 px-4 py-2 rounded flex justify-between font-bold bg-[#e4fcf1] border border-[#18a058]/20">
                           <span className="text-[#0e4b31] font-sans">D11 CORCs Net</span>
                           <span className="text-[#18a058]">{traceData.carbon.corcs_net?.toFixed(4)} tCO₂e</span>
                         </div>
                       </div>
                     ) : (
                       <div className="text-sm text-slate-400 italic">Carbon calculations not finalised.</div>
                     )}
                   </div>

                   <div>
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Flags ({traceData.flags.length})</h3>
                     <div className="space-y-1">
                       {traceData.flags.map((f: any) => (
                         <div key={f.id} className="bg-amber-50/50 border border-amber-100 rounded px-4 py-3 flex items-center text-sm">
                           <span className="font-mono font-bold text-amber-700 mr-4 text-xs">{f.rule_id}</span>
                           <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{f.status}</span>
                         </div>
                       ))}
                       {traceData.flags.length === 0 && <div className="text-sm text-emerald-600 font-medium">✓ No system flags triggered.</div>}
                     </div>
                   </div>

                 </div>
               </div>
             </div>
          )}

          {/* NCR Log View */}
          {(tab === 'ncr' || (tab === 'workspace' && !selectedBatchId && ncrs.length > 0)) && (
             <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-8">
               <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center">
                 <FileWarning size={16} className="text-slate-600 mr-2" />
                 <h2 className="font-bold text-slate-800 text-sm">Non-Conformance Reports</h2>
               </div>
               <div className="p-5 space-y-3">
                 {ncrs.map(ncr => (
                   <div key={ncr.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex gap-4 items-start">
                     <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                       <FileSignature size={18} />
                     </div>
                     <div className="flex-1">
                       <div className="flex justify-between items-start mb-1">
                         <div className="text-xs font-mono font-bold text-slate-600">Batch {ncr.batch_id_label}</div>
                         <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${ncr.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : ncr.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{ncr.status}</div>
                       </div>
                       <p className="text-sm text-slate-700">{ncr.resolution_notes}</p>
                       <div className="text-[10px] text-slate-400 mt-2 font-mono">{new Date(ncr.triggered_at_utc).toLocaleString()}</div>
                     </div>
                     {ncr.status === 'OPEN' && (
                       <div className="flex flex-col gap-2">
                         <button onClick={() => handleResolveFlag(ncr.id, 'RESOLVED')} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded font-semibold hover:bg-emerald-200">Resolve</button>
                         <button onClick={() => handleResolveFlag(ncr.id, 'REJECTED')} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded font-semibold hover:bg-red-200">Reject</button>
                       </div>
                     )}
                   </div>
                 ))}
                 {ncrs.length === 0 && <div className="text-sm text-slate-500">No Non-Conformance Reports generated.</div>}
               </div>
             </div>
          )}

          {/* Flags View */}
          {tab === 'flags' && (
             <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-8">
               <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center">
                 <Flag size={16} className="text-slate-600 mr-2" />
                 <h2 className="font-bold text-slate-800 text-sm">System Flags</h2>
               </div>
               <div className="p-5 space-y-3">
                 {allFlags.filter(f => f.rule_id !== 'AUDIT-NCR').map(flag => (
                   <div key={flag.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex gap-4 items-start">
                     <div className="bg-orange-100 p-2 rounded-full text-orange-600">
                       <Flag size={18} />
                     </div>
                     <div className="flex-1">
                       <div className="flex justify-between items-start mb-1">
                         <div className="text-xs font-mono font-bold text-slate-600">{flag.rule_id} • {flag.record_type} #{flag.record_id || flag.batch_id_label}</div>
                         <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${flag.status === 'OPEN' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>{flag.status}</div>
                       </div>
                       <p className="text-sm text-slate-700">{flag.resolution_notes || 'Integrity violation flagged by engine.'}</p>
                       <div className="text-[10px] text-slate-400 mt-2 font-mono">{new Date(flag.triggered_at_utc).toLocaleString()}</div>
                     </div>
                     {flag.status === 'OPEN' && (
                       <button 
                         onClick={() => handleResolveFlag(flag.id, 'RESOLVED')}
                         className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded font-semibold hover:bg-emerald-200"
                       >
                         Resolve
                       </button>
                     )}
                   </div>
                 ))}
                 {allFlags.filter(f => f.rule_id !== 'AUDIT-NCR').length === 0 && <div className="text-sm text-slate-500">No automated flags present.</div>}
               </div>
             </div>
          )}

          {/* Dispatches View */}
          {tab === 'dispatches' && (
             <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-8">
               <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center">
                 <Truck size={16} className="text-slate-600 mr-2" />
                 <h2 className="font-bold text-slate-800 text-sm">Dispatches</h2>
               </div>
               <div className="p-5 overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                       <th className="pb-2 font-bold whitespace-nowrap">Date</th>
                       <th className="pb-2 font-bold whitespace-nowrap">Batch</th>
                       <th className="pb-2 font-bold whitespace-nowrap">Buyer</th>
                       <th className="pb-2 font-bold whitespace-nowrap">Weight</th>
                       <th className="pb-2 font-bold whitespace-nowrap">Evidence</th>
                     </tr>
                   </thead>
                   <tbody className="text-sm text-slate-700 font-mono">
                     {dispatches.map(d => (
                       <tr key={d.id} className="border-b border-slate-100">
                         <td className="py-3 whitespace-nowrap">{d.dispatch_date_utc.split('T')[0]}</td>
                         <td className="py-3 font-semibold">{d.batch_id_label}</td>
                         <td className="py-3">{d.buyer_name}</td>
                         <td className="py-3">{d.dispatch_weight_t} t</td>
                         <td className="py-3">
                           <span className={`px-2 py-1 text-[10px] rounded uppercase font-bold ${d.evidence_status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{d.evidence_status}</span>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 {dispatches.length === 0 && <div className="text-sm text-slate-500 mt-4">No dispatches recorded.</div>}
               </div>
             </div>
          )}

        </div>
      </div>

      {showNCRModal && selectedBatchId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Raise Non-Conformance</h2>
            <p className="text-sm text-slate-500 mb-6">Create a finding mapped to this audit batch lineage.</p>
            <form onSubmit={submitNCR} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Target Field / Section</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., Certificate of Analysis H/Corg"
                  className="w-full text-sm border-slate-300 rounded-lg shadow-sm"
                  value={ncrForm.field}
                  onChange={e => setNcrForm({...ncrForm, field: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Description</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="Describe the non-conformance finding..."
                  className="w-full text-sm border-slate-300 rounded-lg shadow-sm resize-none"
                  value={ncrForm.description}
                  onChange={e => setNcrForm({...ncrForm, description: e.target.value})}
                ></textarea>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowNCRModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors">Submit Finding</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDocumentStore && selectedBatchId && traceData && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Document Store</h2>
                <p className="text-sm text-slate-500">All immutable evidence & photos for Batch {traceData.batch.batch_id_label}</p>
              </div>
              <button onClick={() => setShowDocumentStore(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-8 pr-2">
              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs border-b pb-2 mb-4">Feedstock Evidence</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {traceData.deliveries.map((d: any) => (
                     <div key={d.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                       <div className="text-xs font-bold text-slate-500 mb-2">{d.vehicle_number} • {d.wet_mass_tonnes} t</div>
                       <div className="flex gap-4">
                          <div>
                            <div className="text-[10px] uppercase text-slate-400 mb-1 text-center">Collection</div>
                            <div className="w-24 h-24 bg-slate-200 rounded-md flex items-center justify-center overflow-hidden">
                              {d.photo_url ? <img src={d.photo_url} className="object-cover w-full h-full" alt="Collection" /> : <span className="text-slate-400 text-xs text-center">No Photo</span>}
                            </div>
                            {d.photo_exif_lat && <div className="text-[9px] text-center text-slate-400 mt-1 font-mono">{d.photo_exif_lat.toFixed(4)}, {d.photo_exif_lng.toFixed(4)}</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-slate-400 mb-1 text-center">Moisture</div>
                            <div className="w-24 h-24 bg-slate-200 rounded-md flex items-center justify-center overflow-hidden">
                              {d.moisture_photo_url ? <img src={d.moisture_photo_url} className="object-cover w-full h-full" alt="Moisture" /> : <span className="text-slate-400 text-xs text-center">No Photo</span>}
                            </div>
                          </div>
                       </div>
                     </div>
                  ))}
                  {traceData.deliveries.length === 0 && <div className="text-sm text-slate-400">No feedstock evidence in this batch.</div>}
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs border-b pb-2 mb-4">Lab / Certificate of Analysis</h3>
                {traceData.coa ? (
                   <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex gap-4 items-center">
                      <div className="w-16 h-20 bg-red-100 text-red-600 rounded flex flex-col items-center justify-center">
                        <FileSignature size={24} />
                        <span className="text-[10px] font-bold mt-1">PDF</span>
                      </div>
                      <div>
                        <div className="font-bold text-slate-700">{traceData.coa.report_date.split('T')[0]}_CoA_{traceData.batch.batch_id_label}.pdf</div>
                        <div className="text-xs text-slate-500 mt-1 hover:text-blue-600 cursor-pointer">{traceData.coa.pdf_url || "View Document"}</div>
                      </div>
                   </div>
                ) : (
                  <div className="text-sm text-slate-400">No CoA attached.</div>
                )}
              </div>

              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-xs border-b pb-2 mb-4">End Use / Dispatch Evidence</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {traceData.dispatches && traceData.dispatches.length > 0 ? (
                    traceData.dispatches.map((disp: any) => (
                      <div key={disp.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div className="text-xs font-bold text-slate-500 mb-2">{disp.buyer_name} • {disp.dispatch_weight_t} t</div>
                        <div className="flex gap-4">
                          <div>
                            <div className="text-[10px] uppercase text-slate-400 mb-1 text-center">Incorporation Evidence</div>
                            <div className="w-32 h-24 bg-slate-200 rounded-md flex items-center justify-center overflow-hidden">
                              {disp.evidence_url ? <img src={disp.evidence_url} className="object-cover w-full h-full" alt="Evidence" /> : <span className="text-slate-400 text-xs">Pending</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : <div className="text-sm text-slate-400">No dispatch evidence tracked yet.</div>}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}