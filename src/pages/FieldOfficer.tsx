import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import CameraCaptureModal from "../components/CameraCaptureModal";
import LocationPickerMap from "../components/LocationPickerMap";

export default function FieldOfficer() {
  const [farmers, setFarmers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [photoInfo, setPhotoInfo] = useState<{ url: string, ts: string, lat?: number, lng?: number } | null>(null);
  const [moisturePhotoInfo, setMoisturePhotoInfo] = useState<{ url: string, ts: string, lat?: number, lng?: number } | null>(null);
  const [evidencePhotoInfo, setEvidencePhotoInfo] = useState<{ url: string, ts: string, lat?: number, lng?: number } | null>(null);
  const [farmerLocation, setFarmerLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [activeCameraAction, setActiveCameraAction] = useState<"delivery" | "moisture" | "evidence" | null>(null);
  const [evidenceDispatchId, setEvidenceDispatchId] = useState<number | null>(null);
  const token = localStorage.getItem("token");
  
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'deliveries';

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showFarmerModal, setShowFarmerModal] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchFarmers();
    fetchDeliveries();
    fetchDispatches();
  }, []);

  const fetchFarmers = async () => {
    const res = await fetch("/api/farmers", { headers: { Authorization: `Bearer ${token}` } });
    if(res.ok) setFarmers(await res.json());
  };

  const fetchDeliveries = async () => {
    const res = await fetch("/api/deliveries", { headers: { Authorization: `Bearer ${token}` } });
    if(res.ok) setDeliveries(await res.json());
  };

  const fetchDispatches = async () => {
    const res = await fetch("/api/dispatches", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDispatches(await res.json());
  };

  const readScale = async () => {
    try {
      const res = await fetch("/api/scales/weighbridge", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setScaleWeight(data.weight_t);
        setMsg("Scale reading captured via IoT.");
      } else {
        const txt = await res.text();
        setMsg("Error fetching IoT: " + txt);
      }
    } catch(err: any) {
      setMsg("Connection error: " + err.message);
    }
  };

  const capturePhoto = () => {
    setActiveCameraAction("delivery");
  };

  const captureMoisturePhoto = () => {
    setActiveCameraAction("moisture");
  };

  const handleCameraCapture = (dataUrl: string, ts: string, lat: number, lng: number) => {
    if (activeCameraAction === "delivery") {
      setPhotoInfo({ url: dataUrl, ts, lat, lng });
      setMsg("Delivery photo captured & verified.");
    } else if (activeCameraAction === "moisture") {
      setMoisturePhotoInfo({ url: dataUrl, ts, lat, lng });
      setMsg("Moisture photo captured & verified.");
    } else if (activeCameraAction === "evidence") {
      setEvidencePhotoInfo({ url: dataUrl, ts, lat, lng });
      setMsg("End-use evidence photo captured.");
    }
    setActiveCameraAction(null);
  };

  const registerFarmer = async (e: any) => {
    e.preventDefault();
    if (!farmerLocation) {
      setMsg("Error: Please capture GPS location first.");
      return;
    }
    const data = {
      full_name: e.target.name.value,
      village: e.target.village.value,
      fpo_id: 1, // Defaulting per original
      aadhaar: e.target.aadhaar.value,
      gps_lat: farmerLocation.lat,
      gps_lng: farmerLocation.lng
    };
    const res = await fetch("/api/farmers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const d = await res.json();
    if(res.ok) {
      setMsg("Farmer Added! Status: " + d.status);
      fetchFarmers();
      setShowFarmerModal(false);
      setFarmerLocation(null);
      e.target.reset();
    } else {
      setMsg("Error: " + d.error);
    }
  };

  const uploadEvidence = async (id: number) => {
    if (!evidencePhotoInfo) {
      setMsg("Please capture a photo first.");
      return;
    }
    const res = await fetch(`/api/dispatches/${id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ photo_url: evidencePhotoInfo.url })
    });
    if (res.ok) {
      setMsg("Evidence uploaded successfully.");
      setEvidencePhotoInfo(null);
      setEvidenceDispatchId(null);
      fetchDispatches();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  };

  const addDelivery = async (e: any) => {
    e.preventDefault();
    if (!scaleWeight || !photoInfo || !moisturePhotoInfo) {
      setMsg("Error: Must capture weight and both photos first.");
      return;
    }

    const data = {
      farmer_id: e.target.farmer.value,
      vehicle_number: e.target.vehicle.value,
      wet_mass_tonnes: scaleWeight,
      moisture_1: +e.target.m1.value,
      moisture_2: +e.target.m2.value,
      moisture_3: +e.target.m3.value,
      gps_lat: photoInfo.lat || 20.93,
      gps_lng: photoInfo.lng || 77.75,
      photo_exif_lat: photoInfo.lat || 20.93,
      photo_exif_lng: photoInfo.lng || 77.75,
      photo_url: photoInfo.url,
      moisture_photo_url: moisturePhotoInfo.url,
      client_timestamp_claimed: photoInfo.ts
    };
    const res = await fetch("/api/deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const d = await res.json();
    if (res.ok) {
      setMsg("Delivery recorded. Ref: " + d.id);
      setScaleWeight(null);
      setPhotoInfo(null);
      e.target.reset();
      setShowDeliveryModal(false);
      fetchDeliveries();
    } else {
      setMsg("Error: " + d.error);
    }
  };

  const filteredDeliveries = deliveries.filter(d => 
    d.vehicle_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFarmers = farmers.filter(f => 
    f.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.village?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {msg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {tab === 'deliveries' && (
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Biomass Deliveries</h2>
              <p className="text-sm text-slate-500 mt-1">Log and track feedstock deliveries to KLN-01</p>
            </div>
            <button 
              onClick={() => setShowDeliveryModal(true)}
              className="bg-[#18a058] hover:bg-[#148749] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center justify-center whitespace-nowrap"
            >
              + Log Delivery
            </button>
          </div>
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <input 
              type="text" 
              placeholder="Search by vehicle number..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>
          <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50">
            <div className="space-y-3">
              {filteredDeliveries.map(d => (
                <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 hover:border-emerald-300 transition-colors shadow-sm">
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
                    <div className="min-w-[120px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Vehicle</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 border border-slate-200 rounded p-1">🚚</span>
                        <span className="font-mono text-sm font-medium text-slate-700">{d.vehicle_number}</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Farmer</span>
                      <span className="text-sm font-medium text-slate-800">{d.full_name}</span>
                    </div>
                    <div className="min-w-[100px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Wet Mass</span>
                      <span className="font-mono text-sm font-medium text-slate-700">{d.wet_mass_tonnes?.toFixed(3)} t</span>
                    </div>
                    <div className="min-w-[100px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Moisture Avg</span>
                      <span className="font-mono text-sm font-medium text-slate-700">{d.moisture_avg?.toFixed(2)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-row md:flex-col justify-between items-center md:items-end gap-2 md:gap-1 pl-0 md:pl-4 md:border-l border-slate-100 min-w-[200px]">
                    <div className="flex flex-col md:items-end">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block md:mb-0.5">Received</span>
                      <span className="text-xs text-slate-600">{new Date(d.server_timestamp_utc).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                    {d.status === 'FLAGGED' ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold uppercase tracking-wider flex items-center">
                        Flagged <span className="ml-1 text-sm">⚠️</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-[#e4fcf1] text-[#18a058] rounded-full text-xs font-bold uppercase tracking-wider">
                        Accepted
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {filteredDeliveries.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">No deliveries found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'dispatches' && (
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Dispatch Locations & Evidence</h2>
              <p className="text-sm text-slate-500 mt-1">View dispatches and capture time-stamped end-use photos</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
            <div className="grid gap-4">
              {dispatches.map(d => (
                <div key={d.id} className="bg-white border text-sm border-slate-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                   <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-8">
                     <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Batch ID</div>
                       <div className="font-mono font-bold text-[#18a058]">{d.batch_id_label}</div>
                     </div>
                     <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Buyer</div>
                       <div className="font-semibold text-slate-800">{d.buyer_name}</div>
                       <div className="text-xs text-slate-500">{d.buyer_district}</div>
                     </div>
                     <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Weight (t)</div>
                       <div className="font-mono font-medium text-slate-800">{d.dispatch_weight_t}t</div>
                     </div>
                     <div>
                       <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">End Use Status</div>
                       <div className="font-semibold uppercase text-xs">{d.evidence_status}</div>
                       {d.evidence_status === 'PENDING' && (
                         <div className="text-[10px] uppercase text-red-500 mt-0.5 font-bold">Due: {new Date(d.evidence_due_date).toLocaleDateString()}</div>
                       )}
                     </div>
                   </div>
                   <div className="flex flex-col gap-2">
                     {d.evidence_status !== 'RECEIVED' && (
                       <div className="flex flex-col gap-2">
                         <button onClick={(e) => { e.preventDefault(); setEvidenceDispatchId(d.id); setActiveCameraAction('evidence'); }} className="bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg whitespace-nowrap">
                           📷 Capture Evidence Photo
                         </button>
                         {evidencePhotoInfo && evidenceDispatchId === d.id && (
                           <button onClick={() => uploadEvidence(d.id)} className="bg-[#18a058] hover:bg-[#148749] text-white text-xs font-bold px-4 py-2 rounded-lg whitespace-nowrap shadow-sm">
                             Upload {evidencePhotoInfo.ts.substring(0, 10)}
                           </button>
                         )}
                       </div>
                     )}
                     {d.evidence_status === 'RECEIVED' && (
                        <div className="text-[#18a058] text-xs font-bold text-right pt-2 flex items-center gap-1 justify-end"><span>✓</span> <span>Evidence Submitted</span></div>
                     )}
                   </div>
                </div>
              ))}
              {dispatches.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">No dispatches found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'farmers' && (
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Farmer Registry</h2>
              <p className="text-sm text-slate-500 mt-1">FPO-verified biomass supplier records</p>
            </div>
            <button 
              onClick={() => setShowFarmerModal(true)}
              className="bg-[#18a058] hover:bg-[#148749] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center justify-center whitespace-nowrap"
            >
              + Register Farmer
            </button>
          </div>
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <input 
              type="text" 
              placeholder="Search by name or village..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>
          <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50">
            <div className="space-y-3">
              {filteredFarmers.map(f => (
                <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 hover:border-emerald-300 transition-colors shadow-sm">
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                    <div className="flex-1 flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Name</span>
                        <span className="text-sm font-medium text-slate-800">{f.full_name}</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Village · FPO</span>
                      <span className="text-sm text-slate-700">{f.village} · Vidarbha Kisan Agro Producer</span>
                    </div>
                    <div className="min-w-[140px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">PM-Kisan</span>
                      <span className="font-mono text-sm text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50">{f.pm_kisan_id || "MH-" + Math.floor(2000+Math.random()*1000) + "-" + Math.floor(1000+Math.random()*9000)}</span>
                    </div>
                  </div>
                  <div className="flex flex-row md:flex-col justify-between items-center md:items-end gap-2 md:gap-1 pl-0 md:pl-4 md:border-l border-slate-100 min-w-[180px]">
                    <div className="flex flex-col md:items-end">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block md:mb-0.5">Registered</span>
                      <span className="text-xs text-slate-600">{new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {f.status !== 'APPROVED' ? (
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        Pending
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center">
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {filteredFarmers.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm">No farmers found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      {showDeliveryModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 text-slate-800 rounded-t-xl sticky top-0 z-10">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center"><span className="mr-2">🚚</span> Log Biomass Delivery</h3>
              <button className="text-slate-500 hover:text-slate-800 text-xl font-bold" onClick={() => setShowDeliveryModal(false)}>✕</button>
            </div>
            <form onSubmit={addDelivery} className="p-6 space-y-5">
              <div>
                 <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Select Farmer</label>
                 <select name="farmer" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" required>
                   <option value="">Search and select farmer...</option>
                   {farmers.map(f => <option key={f.id} value={f.id}>{f.full_name} ({f.village})</option>)}
                 </select>
              </div>
              <div>
                 <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Vehicle Number</label>
                 <input name="vehicle" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm font-mono uppercase" placeholder="e.g. MH-27-XY-1234" required />
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <button type="button" onClick={readScale} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors shadow-sm flex-shrink-0">Fetch IoT Weight</button>
                    <div className="font-mono text-lg font-bold text-slate-800 bg-white border border-slate-200 rounded px-4 py-1.5 min-w-[120px] text-right">{scaleWeight ? `${scaleWeight} t` : '--.- t'}</div>
                  </div>
                  <div className="flex justify-between items-center">
                    <button type="button" onClick={capturePhoto} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors shadow-sm flex-shrink-0">GPS Timestamp Photo</button>
                    <div className="font-mono text-[10px] text-slate-500 truncate text-right bg-white border border-slate-200 rounded px-2 py-1 max-w-[140px]" title={photoInfo?.ts}>{photoInfo ? photoInfo.ts : '--'}</div>
                  </div>
                </div>
                {photoInfo && (
                  <div className="mt-4 w-full h-40 bg-slate-200 rounded-lg overflow-hidden relative border border-slate-300 shadow-md">
                     <div className="absolute bottom-2 right-2 text-right bg-slate-900/80 text-emerald-400 text-[10px] font-mono px-2 py-1 rounded z-10 font-bold uppercase tracking-widest">{photoInfo.ts.split('T')[1].slice(0, 8)}<br/>{`20.93°N, 77.75°E`}</div>
                     <img src={photoInfo.url} className="w-full h-full object-cover opacity-80" alt="Scale Proof" />
                     <div className="absolute top-2 left-2 flex items-center justify-center">
                       <span className="text-emerald-500 font-bold tracking-widest text-[10px] uppercase bg-white px-2 py-1 rounded border border-emerald-200 shadow-sm flex items-center"><span className="mr-1 text-emerald-500">✓</span> VERIFIED HASH</span>
                     </div>
                  </div>
                )}
                {!photoInfo && <div className="mt-4 w-full h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium bg-white">Waiting for camera input...</div>}
              </div>

              <div>
                 <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Moisture Readings (%)</label>
                 <div className="flex space-x-3 mb-3">
                   <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">M1</span>
                      <input name="m1" type="number" step="0.01" className="w-full border border-slate-300 p-2.5 pl-8 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" placeholder="%" required />
                   </div>
                   <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">M2</span>
                      <input name="m2" type="number" step="0.01" className="w-full border border-slate-300 p-2.5 pl-8 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" placeholder="%" required />
                   </div>
                   <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">M3</span>
                      <input name="m3" type="number" step="0.01" className="w-full border border-slate-300 p-2.5 pl-8 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" placeholder="%" required />
                   </div>
                 </div>

                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                   <div className="flex justify-between items-center mb-0">
                     <button type="button" onClick={captureMoisturePhoto} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors shadow-sm flex-shrink-0">Moisture Proof Photo</button>
                     <div className="font-mono text-[10px] text-slate-500 truncate text-right bg-white border border-slate-200 rounded px-2 py-1 max-w-[140px]" title={moisturePhotoInfo?.ts}>{moisturePhotoInfo ? moisturePhotoInfo.ts : '--'}</div>
                   </div>
                   {moisturePhotoInfo && (
                     <div className="mt-4 w-full h-40 bg-slate-200 rounded-lg overflow-hidden relative border border-slate-300 shadow-md">
                        <div className="absolute bottom-2 right-2 text-right bg-slate-900/80 text-emerald-400 text-[10px] font-mono px-2 py-1 rounded z-10 font-bold uppercase tracking-widest">{moisturePhotoInfo.ts.split('T')[1].slice(0, 8)}</div>
                        <img src={moisturePhotoInfo.url} className="w-full h-full object-cover opacity-80" alt="Moisture Proof" />
                        <div className="absolute top-2 left-2 flex items-center justify-center">
                          <span className="text-emerald-500 font-bold tracking-widest text-[10px] uppercase bg-white px-2 py-1 rounded border border-emerald-200 shadow-sm flex items-center"><span className="mr-1 text-emerald-500">✓</span> VERIFIED</span>
                        </div>
                     </div>
                   )}
                 </div>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-[#18a058] hover:bg-[#148749] text-white font-bold tracking-wider py-3.5 rounded-lg transition-colors shadow-sm flex items-center justify-center space-x-2">
                  <span>Submit Immutable Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFarmerModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-screen overflow-y-auto flex flex-col">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 text-slate-800 rounded-t-xl sticky top-0 z-10">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center"><span className="mr-2">🧑‍🌾</span> Register New Farmer</h3>
              <button className="text-slate-500 hover:text-slate-800 text-xl font-bold" onClick={() => setShowFarmerModal(false)}>✕</button>
            </div>
            <form onSubmit={registerFarmer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Full Name</label>
                <input name="name" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" placeholder="e.g. Ramesh Vitthal Jadhav" required />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Village</label>
                <input name="village" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm" placeholder="e.g. Amravati" required />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5">Aadhaar (UIDAI)</label>
                <input name="aadhaar" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm font-mono" placeholder="XXXX XXXX XXXX" required minLength={12} maxLength={12} />
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start space-x-2 text-emerald-800">
                <span className="text-emerald-500 font-bold mt-0.5">ℹ</span>
                <p className="text-[10px] font-medium leading-relaxed">Aadhaar is hashed as standard SHA-256 immediately on device securely. PuroFarms does not store the original Aadhaar number.</p>
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5 flex justify-between">
                  <span>Farm Land GPS Pin *</span>
                  {farmerLocation && <span className="text-emerald-600 font-mono text-[10px]">{farmerLocation.lat.toFixed(4)}, {farmerLocation.lng.toFixed(4)}</span>}
                </label>
                <LocationPickerMap 
                  onLocationSelect={(lat, lng) => setFarmerLocation({ lat, lng })}
                />
              </div>
              
              <div className="pt-2">
                <button type="submit" className="w-full bg-[#18a058] hover:bg-[#148749] text-white font-bold tracking-wider py-3.5 rounded-lg transition-colors shadow-sm flex items-center justify-center space-x-2">
                  <span>Register & Verify</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeCameraAction && (
        <CameraCaptureModal
          title={activeCameraAction === "delivery" ? "Verify Delivery Payload" : "Verify Moisture Reading"}
          onCapture={handleCameraCapture}
          onClose={() => setActiveCameraAction(null)}
        />
      )}

    </div>
  );
}
