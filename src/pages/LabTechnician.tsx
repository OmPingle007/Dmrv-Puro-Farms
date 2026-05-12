import { useState, useEffect } from "react";

export default function LabTechnician() {
  const [batches, setBatches] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    const res = await fetch("/api/batches", { headers: { Authorization: `Bearer ${token}` } });
    if(res.ok) {
      const data = await res.json();
      setBatches(data.filter((b: any) => b.status === 'SAMPLE_SEALED' || b.status === 'DISPATCHED'));
    }
  };

  const submitCoA = async (e: any) => {
    e.preventDefault();
    const data = {
      plant_code: e.target.plant_code.value,
      ctot_pct: +e.target.ctot.value,
      cinorg_pct: +e.target.cinorg.value,
      mh_pct: +e.target.mh.value,
      submission_date: new Date(Date.now() - 3*24*60*60*1000).toISOString() // 3 days ago simulating NABL process
    };
    const res = await fetch("/api/coa-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const d = await res.json();
    if (res.ok) {
      setMsg("CoA Uploaded successfully. Carbon engine triggered.");
      fetchBatches();
    } else {
      setMsg("Error: " + d.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white border border-slate-200 text-slate-900 p-5 rounded-xl shadow-sm">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Lab Portal (NABL)</h1>
          <p className="text-[10px] uppercase text-slate-500 font-bold tracking-widest mt-1">NABL Accredited Partner Lab</p>
        </div>
      </div>
      
      {msg && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm">{msg}</div>}

      <form onSubmit={submitCoA} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <h2 className="font-bold text-slate-800 uppercase tracking-wider text-sm border-b border-slate-100 pb-2">Upload Certificate of Analysis</h2>
        
        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Testing Period (Plant)</label>
          <select name="plant_code" className="w-full border border-slate-200 p-2 rounded bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors text-sm font-mono" required>
             <option value="">Select Testing Period...</option>
             {Array.from(new Set(batches.map(b => b.plant_code))).map((plant: any) => (
                <option key={plant} value={plant}>
                  {plant} - Composite ({batches.filter(b => b.plant_code === plant).length} batches pending)
                </option>
             ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-6 pt-2">
          <div>
             <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ctot (%)</label>
             <input name="ctot" type="number" step="0.1" defaultValue="72.4" className="w-full border border-slate-200 p-2 rounded bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors text-sm" required />
          </div>
          <div>
             <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Cinorg (%)</label>
             <input name="cinorg" type="number" step="0.1" defaultValue="0.4" className="w-full border border-slate-200 p-2 rounded bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors text-sm" required />
          </div>
          <div>
             <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">mH (%)</label>
             <input name="mh" type="number" step="0.1" defaultValue="1.8" className="w-full border border-slate-200 p-2 rounded bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors text-sm" required />
          </div>
        </div>

        <div className="pt-2">
           <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Upload PDF (Simulated)</label>
           <input type="file" className="block w-full text-sm text-slate-500
             file:mr-4 file:py-2 file:px-4
             file:rounded file:border-0
             file:text-xs file:font-semibold
             file:bg-slate-100 file:text-slate-700
             hover:file:bg-slate-200 cursor-pointer" />
        </div>

        <div className="pt-4 border-t border-slate-100">
          <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider p-3 rounded transition-colors shadow-sm">Submit Analysis</button>
        </div>
      </form>
    </div>
  );
}
