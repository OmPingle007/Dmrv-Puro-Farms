import { useState, useEffect } from "react";
import { Download, AlertTriangle, FileSignature, Thermometer, ShieldAlert, BarChart3, Database, Truck, Calendar, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

export default function Management() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'overview' | 'lab' | 'flags' | 'batches'>('overview');
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
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ status: 'RESOLVED' })
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
    setTimeout(() => {
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

  const funnelData = [
    { name: 'Production Complete', value: data.funnel.productionComplete, color: '#94a3b8' },
    { name: 'Sample Sealed', value: data.funnel.sampleSealed, color: '#64748b' },
    { name: 'Dispatched', value: data.funnel.dispatched, color: '#475569' },
    { name: 'Carbon Calculated', value: data.funnel.carbonCalculated, color: '#10b981' },
    { name: 'Audit Ready', value: data.funnel.auditReady, color: '#059669' },
  ];

  const pipelineCorcs = data.batches
    .filter((b: any) => !b.corcs_net && b.qbiochar_dry > 0)
    .reduce((acc: number, b: any) => acc + (b.qbiochar_dry * 0.4), 0);

  return (
    <div className="flex-1 overflow-y-auto w-full bg-slate-50 font-sans">
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-indigo-600 w-2 h-6 rounded-full"></span>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight italic">PuroFarms <span className="font-light not-italic text-slate-400 ml-1">CEO Dashboard</span></h1>
            </div>
            <p className="text-slate-500 text-sm font-medium">Real-time Biochar Carbon Removal (cDRV) Verification Monitor</p>
          </div>
          <div className="flex bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm ring-1 ring-black/5">
             {(['overview', 'lab', 'flags', 'batches'] as const).map(t => (
               <button 
                 key={t}
                 onClick={() => setActiveTab(t)} 
                 className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === t ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
               >
                 {t}
               </button>
             ))}
          </div>
        </div>

        {/* Action Bar (Overview Only) */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600"><BarChart3 size={20} /></div>
                  <ArrowUpRight size={16} className="text-emerald-500" />
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CORCs Confirmed</p>
               <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{data.corcsTotal.toFixed(2)} <span className="text-xs font-medium text-slate-400">tCO₂e</span></h3>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center justify-between mb-4">
                  <div className="bg-amber-50 p-2 rounded-xl text-amber-600"><Clock size={20} /></div>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">UNCONFIRMED</span>
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CORC Pipeline</p>
               <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{pipelineCorcs.toFixed(2)} <span className="text-xs font-medium text-slate-400">est.</span></h3>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-50 p-2 rounded-xl text-blue-600"><Truck size={20} /></div>
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Biochar Dispatched</p>
               <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{data.dispatchesTotal.toFixed(2)} <span className="text-xs font-medium text-slate-400">tonnes</span></h3>
            </div>
            <div className={`bg-white p-6 rounded-2xl border ${data.activeFlags > 0 ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'} shadow-sm transition-all`}>
               <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-xl ${data.activeFlags > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                    {data.activeFlags > 0 ? <AlertTriangle size={20} /> : <ShieldAlert size={20} />}
                  </div>
                  {data.activeFlags > 0 && <span className="text-[10px] font-black text-red-600 animate-pulse">BLOCKING</span>}
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Integrity Flags</p>
               <h3 className={`text-3xl font-black tracking-tighter ${data.activeFlags > 0 ? 'text-red-600' : 'text-slate-900'}`}>{data.activeFlags}</h3>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Trend Chart */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span className="text-[10px] font-bold text-slate-400 uppercase">Confirmed</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span><span className="text-[10px] font-bold text-slate-400 uppercase">Pending</span></div>
                  </div>
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8">CORC Issuance Trend</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend}>
                      <defs>
                        <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 700, fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="confirmed" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorConfirmed)" />
                      <Area type="monotone" dataKey="pending" stroke="#fbbf24" strokeWidth={3} fillOpacity={1} fill="url(#colorPending)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Funnel Chart */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8">Batch Life-Cycle Funnel</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={funnelData} margin={{ left: 40, right: 30 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} width={120} />
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 700 }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                        {funnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Revenue Split Bar */}
            <div className="bg-slate-900 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 text-white">
              <div className="flex-1 space-y-2 text-center md:text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Accrued Project Value</p>
                <div className="flex items-baseline gap-4 justify-center md:justify-start">
                  <h4 className="text-4xl font-black tracking-tighter">${(data.revenue.confirmed + data.revenue.pipeline).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div><span className="text-[10px] font-bold text-emerald-400 uppercase">${data.revenue.confirmed.toLocaleString()} Confirmed</span></div>
                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div><span className="text-[10px] font-bold text-slate-400 uppercase">${data.revenue.pipeline.toLocaleString()} Pipeline</span></div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-medium italic">Pipeline estimates subject to CoA H:C-org verification variance.</p>
              </div>
              <button 
                onClick={handleExport}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
              >
                Output Report Generator <Download size={18} />
              </button>
            </div>
          </>
        )}

        {activeTab === 'lab' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Calendar className="text-indigo-600" size={20} /> Testing Periods</h2>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-8 py-4">Testing Period</th>
                  <th className="px-8 py-4">Batch Enrolment</th>
                  <th className="px-8 py-4">Days Open</th>
                  <th className="px-8 py-4">Chain of Custody</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-semibold">
                {data.labPeriods.map((p: any) => (
                  <tr key={p.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6 text-slate-900">{p.name}</td>
                    <td className="px-8 py-6 text-slate-500">{p.batchCount} batches</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        {p.daysOpen > 10 ? <AlertTriangle size={14} className="text-red-500" /> : <Clock size={14} className="text-slate-400" />}
                        <span className={p.daysOpen > 10 ? 'text-red-600 font-bold' : 'text-slate-600'}>{p.daysOpen} days</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest ${p.status === 'COMPLETE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'flags' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {data.flags.map((f: any) => (
              <div key={f.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.rule_id}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${f.is_blocking ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
                      {f.is_blocking ? 'Blocks Dispatch' : 'Warning'}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 leading-tight mb-2 underline decoration-indigo-500/20 underline-offset-4">{f.rule_id}: Integrity alert triggered</h4>
                  <p className="text-xs text-slate-500 font-mono mb-4">Target: {f.record_type} #{f.record_id || f.batch_id_label}</p>
                  <p className="text-sm text-slate-600 mb-4">{f.resolution_notes || 'Integrity violation detected during process validation.'}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[10px] text-slate-400">{new Date(f.triggered_at_utc).toLocaleString()}</span>
                  <button onClick={() => resolveFlag(f.id)} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors">Resolve</button>
                </div>
              </div>
            ))}
            {data.flags.length === 0 && <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold">No active integrity flags found.</div>}
          </div>
        )}

        {activeTab === 'batches' && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div><h2 className="text-lg font-black text-slate-900 uppercase tracking-widest">Active Batches</h2></div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                     <th className="px-8 py-4">Batch ID</th>
                     <th className="px-8 py-4">Lifecycle State</th>
                     <th className="px-8 py-4">CORCs</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {data.batches.map((b: any) => (
                     <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-8 py-6 text-sm font-mono font-bold text-indigo-600">{b.batch_id_label}</td>
                       <td className="px-8 py-6">
                         <span className={`inline-flex px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${
                           b.status === 'DISPATCHED' ? 'bg-emerald-100 text-emerald-700' :
                           b.status === 'COA_RECEIVED' ? 'bg-blue-100 text-blue-700' :
                           'bg-slate-100 text-slate-600'
                         }`}>
                           {b.status.replace(/_/g, ' ')}
                         </span>
                       </td>
                       <td className="px-8 py-6">
                          <div className={`text-md font-black ${b.corcs_net ? 'text-emerald-600' : 'text-slate-300'}`}>
                             {b.corcs_net ? b.corcs_net.toFixed(2) : '-.--'}
                          </div>
                       </td>
                       <td className="px-8 py-6 text-right">
                         <button 
                             onClick={() => loadBatchTrace(b.id)}
                             className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center justify-end w-full gap-2 transition-colors"
                         >
                           <Database size={14} /> Audit Trail
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
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8 z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] max-w-6xl w-full shadow-2xl p-12 max-h-[90vh] flex flex-col border border-white/20">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                   <Database className="text-indigo-600" /> Evidence Audit Trail
                </h2>
                <div className="flex items-center gap-3 mt-3">
                   <p className="text-xs font-black text-slate-400 border-2 border-slate-100 px-4 py-1 rounded-full font-mono uppercase tracking-widest">Batch {traceData.batch.batch_id_label}</p>
                   {traceData.flags && traceData.flags.length > 0 && <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center shadow-sm"><AlertTriangle size={12} className="mr-1.5" /> Integrity Violation</span>}
                </div>
              </div>
              <button onClick={() => setShowDocumentStore(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-900 w-12 h-12 rounded-2xl flex items-center justify-center transition-all font-black">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-12 pr-6 custom-scrollbar">
              <section>
                <div className="flex items-center gap-4 mb-6">
                   <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">01</span>
                   <h3 className="font-black text-slate-900 uppercase tracking-[0.2em] text-[10px]">Feedstock Chain of Custody</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {traceData.deliveries.map((d: any) => (
                     <div key={d.id} className="bg-white border-2 border-slate-100 rounded-[32px] p-6 shadow-sm hover:border-indigo-100 transition-colors group">
                       <div className="flex justify-between items-start mb-6">
                          <div className="text-lg font-black text-slate-900 leading-none">{d.wet_mass_tonnes} <span className="text-xs font-medium text-slate-400">tonnes</span></div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.vehicle_number}</div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden ring-1 ring-inset ring-black/5 relative shadow-inner">
                              {d.photo_url ? <img src={d.photo_url} className="object-cover w-full h-full scale-105 group-hover:scale-100 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><FileSignature size={24} /></div>}
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Collection Ref</p>
                          </div>
                          <div className="space-y-2">
                            <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden ring-1 ring-inset ring-black/5 shadow-inner">
                              {d.moisture_photo_url ? <img src={d.moisture_photo_url} className="object-cover w-full h-full scale-105 group-hover:scale-100 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Thermometer size={24} /></div>}
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Moisture Test</p>
                          </div>
                       </div>
                     </div>
                  ))}
                </div>
              </section>

              <section className="mt-12">
                <div className="flex items-center gap-4 mb-6">
                   <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs">P2</span>
                   <h3 className="font-black text-emerald-900 uppercase tracking-[0.2em] text-[10px]">Farmer Onboarding Documents</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {traceData.deliveries.filter((d: any) => d.land_document_url || d.noc_document_url).map((d: any) => (
                    <div key={`farmer-docs-${d.id}`} className="bg-emerald-50 border-2 border-emerald-100 rounded-[32px] p-6 shadow-sm group">
                       <h4 className="text-xl font-black text-emerald-900 leading-none mb-1">{d.farmer_name}</h4>
                       <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest mb-6">Origin: {d.village || "Registered Farmer"}</p>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="aspect-square bg-emerald-100 rounded-2xl overflow-hidden ring-1 ring-inset ring-black/5 relative shadow-inner">
                              {d.land_document_url ? <img src={d.land_document_url} className="object-cover w-full h-full scale-105 group-hover:scale-100 transition-transform duration-700" alt="Land Doc" /> : <div className="w-full h-full flex items-center justify-center text-emerald-300">N/A</div>}
                            </div>
                            <p className="text-[8px] font-black text-emerald-600/70 uppercase tracking-widest text-center">Land 7/12</p>
                          </div>
                          <div className="space-y-2">
                            <div className="aspect-square bg-emerald-100 rounded-2xl overflow-hidden ring-1 ring-inset ring-black/5 shadow-inner">
                              {d.noc_document_url ? <img src={d.noc_document_url} className="object-cover w-full h-full scale-105 group-hover:scale-100 transition-transform duration-700" alt="NOC Doc" /> : <div className="w-full h-full flex items-center justify-center text-emerald-300">N/A</div>}
                            </div>
                            <p className="text-[8px] font-black text-emerald-600/70 uppercase tracking-widest text-center">Farmer NOC</p>
                          </div>
                       </div>
                    </div>
                  ))}
                  {traceData.deliveries.filter((d: any) => d.land_document_url || d.noc_document_url).length === 0 && (
                     <div className="col-span-full py-8 text-center bg-emerald-50/50 rounded-[32px] border-2 border-dashed border-emerald-100 text-emerald-600/60 font-bold uppercase tracking-widest text-xs italic">No farmer documents found for this batch's feedstock.</div>
                  )}
                </div>
              </section>

              <section className="mt-12">
                <div className="flex items-center gap-4 mb-6">
                   <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">02</span>
                   <h3 className="font-black text-slate-900 uppercase tracking-[0.2em] text-[10px]">Puro Standard Lab CoA</h3>
                </div>
                {traceData.coa ? (
                   <div className="bg-indigo-50 border-2 border-indigo-100 rounded-[40px] p-10 flex flex-col md:flex-row gap-10 items-center justify-center shadow-sm">
                      <div className="w-24 h-32 bg-white border-2 border-indigo-100 text-indigo-500 rounded-3xl flex flex-col items-center justify-center shadow-xl rotate-[-4deg]">
                        <FileSignature size={40} strokeWidth={1} />
                        <span className="text-[8px] font-black mt-2 tracking-[0.3em]">CERTIFIED</span>
                      </div>
                      <div className="text-center md:text-left">
                        <div className="font-black text-slate-900 text-2xl tracking-tighter mb-2">Certificate of Analysis</div>
                        <div className="flex gap-4 justify-center md:justify-start mb-6">
                           <div className="text-center bg-white px-4 py-2 rounded-2xl border border-indigo-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">C-org %</p><p className="text-lg font-black text-slate-900 leading-none">{traceData.coa.corg_pct}</p></div>
                           <div className="text-center bg-white px-4 py-2 rounded-2xl border border-indigo-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">H:Corg</p><p className="text-lg font-black text-slate-900 leading-none">{traceData.coa.hcorg_ratio}</p></div>
                        </div>
                        <button className="bg-indigo-600 hover:bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 mx-auto md:ml-0 transition-all shadow-lg active:scale-95"><Download size={16} /> Secure Download</button>
                      </div>
                   </div>
                ) : (
                  <div className="py-16 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase tracking-widest text-xs italic">Analytical results awaiting validation period...</div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-4 mb-6">
                   <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">03</span>
                   <h3 className="font-black text-slate-900 uppercase tracking-[0.2em] text-[10px]">Downstream Dispatch Proof</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                  {traceData.dispatches?.map((disp: any) => (
                    <div key={disp.id} className="bg-white border-2 border-slate-100 rounded-[32px] p-8 shadow-sm group">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-xl font-black text-slate-900 leading-none mb-1">{disp.buyer_name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{disp.buyer_district}</p>
                        </div>
                        <div className="text-right">
                           <div className="text-lg font-black text-slate-900 leading-none mb-1">{disp.dispatch_weight_t} <span className="text-xs font-medium text-slate-400">t</span></div>
                        </div>
                      </div>
                      <div className="aspect-video bg-slate-100 rounded-[24px] overflow-hidden group-hover:shadow-lg transition-all duration-500 ring-1 ring-inset ring-black/5 relative">
                        {disp.evidence_url ? (
                          <img src={disp.evidence_url} className="object-cover w-full h-full opacity-90 group-hover:opacity-100 scale-105 group-hover:scale-100 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 px-6 py-2 rounded-full border border-amber-200 shadow-sm animate-pulse">Awaiting Verification Document</span></div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Persistence styling for charts Tooltip */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}
