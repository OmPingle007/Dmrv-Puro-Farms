import { useState, useEffect } from "react";
import { Download, AlertTriangle, FileSignature, Thermometer, ShieldAlert, BarChart3, Database } from "lucide-react";
import * as crypto from 'crypto';

export default function Management() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'overview' | 'batches'>('overview');
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [traceData, setTraceData] = useState<any>(null);
  const [showDocumentStore, setShowDocumentStore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      if(res.ok) {
        setData(await res.json());
      } else {
        const t = await res.text();
        setError(`Error ${res.status}: ${t}`);
      }
    } catch(err: any) {
      setError(err.message);
    }
  };

  const resolveFlag = async (flagId: number) => {
    const res = await fetch(`/api/flags/${flagId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      fetchData();
    }
  };

  const loadBatchTrace = async (id: number) => {
    const res = await fetch(`/api/batches/${id}/trace`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const trace = await res.json();
      setTraceData(trace);
      setShowDocumentStore(true);
      setSelectedBatchId(id);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    // Simulate generation of Section 11 Output Report for Puro.earth
    setTimeout(() => {
      // Validate completeness
      const incompleteBatches = data.batches.filter((b: any) => !b.corcs_net);
      if (incompleteBatches.length > 0) {
         setExportResult({ error: "Missing Critical Data: Some batches lack COA or Carbon Calculations." });
         setIsExporting(false);
         return;
      }
      if (data.activeFlags > 0) {
         setExportResult({ error: "Blocked: Cannot export with open active flags." });
         setIsExporting(false);
         return;
      }

      setExportResult({ success: true, hash: "0x8fa3...b71c" });
      setIsExporting(false);
    }, 1500);
  };

  if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;
  if (!data) return <div className="p-6">Loading...</div>;

  return (
    <div className="flex-1 overflow-y-auto w-full bg-slate-50">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">CEO Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Management & Executive Oversight</p>
          </div>
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
             <button onClick={() => setActiveTab('overview')} className={`px-4 py-1.5 text-sm font-semibold rounded-md ${activeTab === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>Overview</button>
             <button onClick={() => setActiveTab('batches')} className={`px-4 py-1.5 text-sm font-semibold rounded-md ${activeTab === 'batches' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>Production Batches</button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total CORCs (Net)</p>
                    <BarChart3 size={16} className="text-emerald-500" />
                 </div>
                 <p className="text-3xl font-bold text-slate-900 tracking-tight">{data.corcsTotal.toFixed(2)}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirmed Revenue</p>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">FLOOR $120</span>
                 </div>
                 <p className="text-3xl font-bold text-slate-900 tracking-tight">${(data.corcsTotal * 120).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                 <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter italic">Pending successful audit</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Biochar Dispatched</p>
                 </div>
                 <p className="text-3xl font-bold text-slate-900 tracking-tight">{data.dispatchesTotal.toFixed(2)} <span className="text-sm font-semibold text-slate-500">t</span></p>
              </div>
              <div className={`bg-white p-5 rounded-xl border ${data.activeFlags > 0 ? 'border-red-300 border-l-4 border-l-red-500 shadow-sm shadow-red-100' : 'border-slate-200 shadow-sm border-l-4 border-l-emerald-500'} flex flex-col justify-between`}>
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Flags</p>
                    {data.activeFlags > 0 ? <AlertTriangle size={16} className="text-red-500" /> : <ShieldAlert size={16} className="text-emerald-500" />}
                 </div>
                 <p className={`text-3xl font-bold tracking-tight ${data.activeFlags > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{data.activeFlags}</p>
                 {data.activeFlags > 0 && <div className="text-[10px] text-red-500 mt-1 font-bold uppercase tracking-tighter">Critical Review Required</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                 <div className="flex items-center justify-between mb-6">
                   <h3 className="font-bold text-sm uppercase text-slate-800 tracking-wider">Flagged Exceptions</h3>
                   {data.flaggedBatches.length > 0 && <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase">Action Required</span>}
                 </div>
                 
                 {data.flaggedBatches.length === 0 ? <p className="text-slate-500 text-sm font-medium py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">No active flags. Production is nominal.</p> : (
                   <ul className="space-y-3">
                     {data.flaggedBatches.map((f: any) => (
                       <li key={f.id} className="flex flex-col p-4 rounded-lg bg-red-50/50 border border-red-100">
                         <div className="flex items-center justify-between mb-3">
                           <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                               <span className="text-xs font-bold bg-white text-red-700 px-2 py-0.5 border border-red-200 rounded tracking-wider">{f.rule_id}</span>
                               <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">{f.record_type} ID: {f.record_id || f.batch_id_label}</span>
                             </div>
                           </div>
                           <button onClick={() => resolveFlag(f.id)} className="text-xs bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-4 py-1.5 font-bold rounded-md shadow-sm transition-all selection:bg-slate-100">Review & Resolve</button>
                         </div>
                         {f.resolution_notes && (
                            <div className="text-xs text-slate-700 bg-white/60 p-3 rounded-md border border-red-100/50 italic">
                               <span className="font-semibold text-slate-500 mr-2 not-italic">Operator Note:</span>
                               {f.resolution_notes}
                            </div>
                         )}
                         <div className="text-[10px] text-slate-400 font-mono mt-3 uppercase tracking-widest">{new Date(f.triggered_at_utc).toLocaleString()}</div>
                       </li>
                     ))}
                   </ul>
                 )}
              </div>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-indigo-50/50 to-white">
                   <div className="flex items-center justify-between mb-2">
                     <h3 className="font-bold text-sm uppercase text-indigo-900 tracking-wider">Output Report Engine (Puro.earth)</h3>
                   </div>
                   <p className="text-xs text-indigo-600/80 mb-6 font-medium">Verify production limits and cross-period chain of custody to export Section 11 compliance package.</p>
                   
                   {exportResult && exportResult.error && (
                     <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-xs font-bold">
                       {exportResult.error}
                     </div>
                   )}
                   {exportResult && exportResult.success && (
                     <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-md flex flex-col gap-2">
                       <div className="flex items-center text-xs font-bold uppercase"><ShieldAlert size={14} className="mr-2" /> Compliant Package Generated</div>
                       <div className="text-[10px] font-mono break-all text-emerald-600/80">SHA256: {exportResult.hash}</div>
                       <div className="flex gap-2 mt-2">
                          <button className="text-xs font-bold text-emerald-700 underline">Download PDF</button>
                          <button className="text-xs font-bold text-emerald-700 underline">Download XLSX Engine</button>
                          <button className="text-xs font-bold text-emerald-700 underline">Bundled Evidence (.zip)</button>
                       </div>
                     </div>
                   )}

                   <button 
                     onClick={handleExport}
                     disabled={Object.keys(data.batches).length === 0 || isExporting}
                     className="w-full flex items-center justify-center p-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                   >
                     {isExporting ? 'Aggregating Compliance Data...' : 'Generate Sec. 11 Export Package'} <Download size={16} className="ml-2" />
                   </button>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                   <h3 className="font-bold text-sm uppercase text-slate-800 tracking-wider mb-4">Calibration Alerts</h3>
                   {data.expiringCerts.length === 0 ? <p className="text-slate-500 text-sm font-medium py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">No expiring calibrations.</p> : (
                     <ul className="space-y-2">
                       {data.expiringCerts.map((c: any) => (
                         <li key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-50/50 border border-orange-100">
                           <div className="flex flex-col">
                             <span className="text-xs font-bold text-orange-900">{c.instrument_name}</span>
                             <span className="text-[10px] text-orange-600/70 font-mono tracking-widest mt-1">Expires: {c.expiry_date}</span>
                           </div>
                           <span className="bg-white text-orange-600 text-[10px] px-2 py-0.5 border border-orange-200 font-bold uppercase rounded shadow-sm">Expiring</span>
                         </li>
                       ))}
                     </ul>
                   )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'batches' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden/0">
             <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                   <h2 className="text-lg font-bold text-slate-800">Production Batches</h2>
                   <p className="text-sm text-slate-500 mt-1">Click a batch to review complete chain of custody and immutable evidence.</p>
                </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                     <th className="px-6 py-4">Batch ID</th>
                     <th className="px-6 py-4">Status</th>
                     <th className="px-6 py-4">Output (t)</th>
                     <th className="px-6 py-4">CORCs</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                   {data.batches.map((b: any) => (
                     <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-6 py-4 text-sm font-mono font-semibold text-indigo-600">{b.batch_id_label}</td>
                       <td className="px-6 py-4">
                         <span className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase rounded-md ${
                           b.status === 'DISPATCHED' ? 'bg-emerald-100 text-emerald-700' :
                           b.status === 'COA_RECEIVED' ? 'bg-blue-100 text-blue-700' :
                           'bg-slate-100 text-slate-600'
                         }`}>
                           {b.status.replace(/_/g, ' ')}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-sm font-medium text-slate-700">{b.qbiochar_dry ? b.qbiochar_dry.toFixed(2) : '-'}</td>
                       <td className="px-6 py-4 flex items-center gap-2">
                          <div className={`text-sm font-bold ${b.corcs_net ? 'text-emerald-600' : 'text-slate-400'}`}>
                             {b.corcs_net ? b.corcs_net.toFixed(2) : 'Pending'}
                          </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <button 
                             onClick={() => loadBatchTrace(b.id)}
                             className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center justify-end w-full gap-1"
                         >
                           <Database size={14} /> View Evidence
                         </button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}

      </div>

      {showDocumentStore && selectedBatchId && traceData && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 md:p-8 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl p-8 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Executive Document Store</h2>
                <div className="flex items-center gap-3 mt-2">
                   <p className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full text-indigo-700 font-mono ring-1 ring-indigo-200">Batch {traceData.batch.batch_id_label}</p>
                   {traceData.flags && traceData.flags.length > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold uppercase ring-1 ring-red-200 flex items-center"><AlertTriangle size={12} className="mr-1" /> Flagged</span>}
                </div>
              </div>
              <button onClick={() => setShowDocumentStore(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-10 pr-2">
              <section>
                <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
                   <div className="w-6 h-6 bg-indigo-100 rounded text-indigo-600 flex items-center justify-center font-bold text-xs">1</div>
                   <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs">Feedstock Submissions</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {traceData.deliveries.map((d: any) => (
                     <div key={d.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm relative group overflow-hidden">
                       <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                       <div className="text-sm font-bold text-slate-700 mb-4">{d.vehicle_number} <span className="text-slate-400 font-normal">({d.wet_mass_tonnes} t)</span></div>
                       <div className="flex gap-4">
                          <div className="flex-1">
                            <div className="w-full h-24 bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden border border-slate-300 relative group/img">
                              {d.photo_url ? (
                                <>
                                  <img src={d.photo_url} className="object-cover w-full h-full" alt="Collection" />
                                  <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                    <span className="text-white text-[9px] font-mono">{d.photo_exif_lat?.toFixed(5)}, {d.photo_exif_lng?.toFixed(5)}</span>
                                  </div>
                                </>
                              ) : <span className="text-slate-400 text-xs text-center font-medium">No Photo</span>}
                            </div>
                            <div className="text-[10px] uppercase text-slate-500 mt-2 font-bold flex items-center gap-1"><Thermometer size={10} /> Delivery Pic</div>
                          </div>
                          <div className="flex-1">
                            <div className="w-full h-24 bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden border border-slate-300">
                              {d.moisture_photo_url ? <img src={d.moisture_photo_url} className="object-cover w-full h-full" alt="Moisture" /> : <span className="text-slate-400 text-xs text-center font-medium">No Photo</span>}
                            </div>
                            <div className="text-[10px] uppercase text-slate-500 mt-2 font-bold flex items-center gap-1"><Thermometer size={10} /> Moisture Pic</div>
                          </div>
                       </div>
                     </div>
                  ))}
                  {traceData.deliveries.length === 0 && <div className="text-sm text-slate-400 col-span-full">No feedstock evidence in this batch.</div>}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
                   <div className="w-6 h-6 bg-indigo-100 rounded text-indigo-600 flex items-center justify-center font-bold text-xs">2</div>
                   <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs">Laboratory Certification</h3>
                </div>
                {traceData.coa ? (
                   <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex gap-6 items-center shadow-sm w-full md:w-2/3 lg:w-1/2">
                      <div className="w-20 h-24 bg-red-50 border border-red-100 text-red-500 rounded-lg flex flex-col items-center justify-center shadow-inner">
                        <FileSignature size={28} />
                        <span className="text-[10px] font-black mt-2 tracking-widest">PDF</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="font-bold text-slate-800 text-sm">{traceData.coa.report_date.split('T')[0]}_CoA_{traceData.batch.batch_id_label}.pdf</div>
                        <div className="text-xs font-mono text-slate-500">C-org: {traceData.coa.corg_pct}% • H:Corg: {traceData.coa.hcorg_ratio}</div>
                        <button className="text-xs font-bold text-indigo-600 mt-2 hover:text-indigo-800 flex items-center gap-1 transition-colors w-fit bg-indigo-50 px-3 py-1.5 rounded-md"><Download size={14} /> Download File</button>
                      </div>
                   </div>
                ) : (
                  <div className="text-sm text-slate-500 italic bg-amber-50 p-4 rounded-lg border border-amber-200 text-amber-700">Laboratory processing pending or CoA not yet attached.</div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
                   <div className="w-6 h-6 bg-indigo-100 rounded text-indigo-600 flex items-center justify-center font-bold text-xs">3</div>
                   <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs">End-Use Application</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {traceData.dispatches && traceData.dispatches.length > 0 ? (
                    traceData.dispatches.map((disp: any) => (
                      <div key={disp.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
                        <div className="text-sm font-bold text-slate-700 mb-1">{disp.buyer_name}</div>
                        <div className="text-xs font-mono text-slate-500 mb-4">{disp.dispatch_weight_t} tonnes • {disp.buyer_district}</div>
                        <div className="flex-1">
                          <div className="w-full h-32 bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden border border-slate-300">
                            {disp.evidence_url ? <img src={disp.evidence_url} className="object-cover w-full h-full" alt="Evidence" /> : <span className="text-slate-400 text-xs font-medium bg-amber-50 text-amber-600 px-3 py-1 rounded-full border border-amber-200">Evidence Pending</span>}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500 mt-2 font-bold tracking-widest text-center">Incorporation Photo / BOL</div>
                        </div>
                      </div>
                    ))
                  ) : <div className="text-sm text-slate-500 col-span-full">No dispatch evidence tracked yet.</div>}
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
