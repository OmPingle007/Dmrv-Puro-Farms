import { useState, useEffect } from "react";

export default function Management() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>("");
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

  if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;
  if (!data) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total CORCs (Net)</p>
           <p className="text-2xl font-bold text-slate-900 tracking-tight">{data.corcsTotal.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Projected Revenue</p>
           <p className="text-2xl font-bold text-slate-900 tracking-tight">${(data.corcsTotal * 120).toFixed(0)}</p>
           <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter italic">Based on $120/CORC floor</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Flags</p>
           <p className="text-2xl font-bold text-red-600 tracking-tight">{data.activeFlags}</p>
           {data.activeFlags > 0 && <div className="text-[10px] text-red-400 mt-1 font-semibold uppercase tracking-tighter animate-pulse">Critical Review Required</div>}
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Expiring Calibrations</p>
           <p className="text-2xl font-bold text-amber-600 tracking-tight">{data.expiringCerts.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
           <div className="flex items-center justify-between mb-4">
             <h3 className="font-bold text-sm uppercase text-slate-600">Active Flags</h3>
             {data.flaggedBatches.length > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">ACTION REQUIRED</span>}
           </div>
           
           {data.flaggedBatches.length === 0 ? <p className="text-slate-500 text-sm">No active flags.</p> : (
             <ul className="space-y-3">
               {data.flaggedBatches.map((f: any) => (
                 <li key={f.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                   <div className="flex flex-col">
                     <span className="text-xs font-bold text-red-600">{f.rule_id}</span>
                     <span className="text-[10px] text-slate-400 uppercase tracking-widest">{f.record_type} ID: {f.record_id || f.batch_id_label}</span>
                   </div>
                   <button onClick={() => resolveFlag(f.id)} className="text-[10px] bg-slate-800 text-white hover:bg-slate-700 px-3 py-1.5 font-bold uppercase rounded shadow-sm transition-colors">Resolve</button>
                 </li>
               ))}
             </ul>
           )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
           <h3 className="font-bold text-sm uppercase text-slate-600 mb-4">Calibration Alerts</h3>
           {data.expiringCerts.length === 0 ? <p className="text-slate-500 text-sm">No expiring calibrations.</p> : (
             <ul className="space-y-3">
               {data.expiringCerts.map((c: any) => (
                 <li key={c.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                   <div className="flex flex-col">
                     <span className="text-xs font-bold">{c.instrument_name}</span>
                     <span className="text-[10px] text-slate-400">Expires: {c.expiry_date}</span>
                   </div>
                   <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 font-bold uppercase rounded">Expiring</span>
                 </li>
               ))}
             </ul>
           )}
        </div>
      </div>
    </div>
  );
}
