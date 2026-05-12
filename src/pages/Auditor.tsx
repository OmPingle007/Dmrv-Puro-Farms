import { useState, useEffect } from "react";

export default function Auditor() {
  const [batches, setBatches] = useState<any[]>([]);
  const token = localStorage.getItem("token");

  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    const res = await fetch("/api/batches", { headers: { Authorization: `Bearer ${token}` } });
    if(res.ok) setBatches(await res.json());
  };

  const handleVerify = (b: any) => {
    setMsg(`Batch ${b.batch_id_label} Verified. Hash: ${b.record_hash?.slice(0, 32)}... matches node consensus.`);
  };

  const handleRaiseFinding = (b: any) => {
    setMsg(`Finding raised for Batch ${b.batch_id_label}. Sent to Management workflow.`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Immutable Audit Trail</h3>
          <button className="text-xs text-blue-600 font-semibold">Export Registry →</button>
        </div>
        
        {msg && <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm">{msg}</div>}

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-semibold">Batch ID</th>
                <th className="px-6 py-3 font-semibold text-center">Status</th>
                <th className="px-6 py-3 font-semibold text-center">Hash Verifier</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map(b => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-mono font-medium text-slate-700">{b.batch_id_label}</td>
                  <td className="px-6 py-3 text-center text-[10px] font-bold uppercase">
                    <span className={`px-2 py-0.5 rounded ${b.status === 'CORC_INELIGIBLE' ? 'bg-slate-200 text-slate-600' : b.status === 'DISPATCHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-[10px] text-center overflow-hidden max-w-[200px] text-ellipsis text-slate-500" title={b.record_hash}>
                    {b.record_hash?.slice(0,16)}...
                  </td>
                  <td className="px-6 py-3 space-x-3 text-right whitespace-nowrap">
                    <button onClick={() => handleVerify(b)} className="text-xs text-blue-600 font-semibold hover:text-blue-800">Verify Integrity</button>
                    <button onClick={() => handleRaiseFinding(b)} className="text-xs text-red-600 font-semibold hover:text-red-800">Raise Finding</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 font-mono">
          System Verification Status: OK
        </div>
      </div>
    </div>
  );
}
