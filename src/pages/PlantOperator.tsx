import { useState, useEffect } from "react";
import { Leaf, ChevronRight, Activity, FlaskConical, Truck, Plus, Wrench, Flag, Settings2, Scale, RefreshCw, AlertTriangle, CheckCircle, X } from "lucide-react";
import CameraCaptureModal from "../components/CameraCaptureModal";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLocation } from "react-router-dom";

type TabType = 'All' | 'OPEN' | 'PRODUCTION_COMPLETE' | 'SAMPLE_SEALED' | 'CARBON_CALCULATED' | 'DISPATCHED' | 'AUDIT_READY' | 'CORC_INELIGIBLE';

export default function PlantOperator() {
  const [batches, setBatches] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>('All');
  
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'batches';

  // Modals & Slideovers
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  
  // New States
  const [flagTab, setFlagTab] = useState('OPEN');
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  
  // Data for Flags
  const [validationFlags, setValidationFlags] = useState([
    { id: 1, code: 'VE-01', type: 'Delivery', relId: '#21', batch: '#5', status: 'Open', desc: 'Duplicate vehicle within 4 hours', date: '09 May 2026, 06:48 pm' },
    { id: 2, code: 'DQ-09', type: 'Dispatch', relId: '#2', batch: '#5', status: 'Open', desc: 'Dispatch price anomaly (< 50% of ₹20,000/t reference)', date: '09 May 2026, 06:48 pm' },
    { id: 3, code: 'VE-12', type: 'Dispatch', relId: '#2', batch: '#5', status: 'Open', desc: 'End-use evidence overdue (60 days)', date: '09 May 2026, 06:48 pm' },
  ]);

  // Data for Calibration
  const [calibrations, setCalibrations] = useState([
    { id: 1, name: 'Mettler Toledo Weighbridge', instId: 'WB-001', cert: 'NABL-WB-2025-0341', expiryStr: '31 Oct 2026', days: 171, status: 'Valid' },
    { id: 2, name: 'Sartorius Bagging Scale', instId: 'BS-001', cert: 'NABL-BS-2025-0342', expiryStr: '15 May 2026', days: 2, status: 'Expiring Soon' },
    { id: 3, name: 'Testo Moisture Analyser', instId: 'MA-001', cert: 'NABL-MA-2025-0343', expiryStr: '14 Apr 2026', days: -29, status: 'Expired' },
    { id: 4, name: 'Thermocouple Array (Kiln)', instId: 'TC-001', cert: 'NABL-TC-2025-0344', expiryStr: '30 Nov 2026', days: 201, status: 'Valid' },
  ]);

  // Data for Dispatches
  const [showNewDispatchModal, setShowNewDispatchModal] = useState(false);
  const [dispatchesData, setDispatchesData] = useState<any[]>([]);
  const [newDispatchForm, setNewDispatchForm] = useState({
    batch: '',
    buyerName: '',
    buyerDistrict: '',
    declaredUse: '',
    weight: ''
  });
  const [dispatchError, setDispatchError] = useState('');
  
  // Data State
  const [baggingWeight, setBaggingWeight] = useState<number | null>(null);
  const [dieselLitres, setDieselLitres] = useState<number | null>(null);
  const [plcData, setPlcData] = useState({ temp: 450, resTime: 45 });
  const [tempHistory, setTempHistory] = useState<{time: string, temp: number}[]>([]);
  const [activeCameraAction, setActiveCameraAction] = useState<"moisture" | "ph" | "bagging" | "evidence" | "seal" | null>(null);
  const [evidenceDispatchId, setEvidenceDispatchId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<any>({});
  
  // Form State
  const [newBatchForm, setNewBatchForm] = useState({ plant_code: "KLN-01", feedstock_lot_ids: [] as number[] });
  const [sealForm, setSealForm] = useState({ grabbed: false, sealed: false, batchIdVisible: false, retentionRef: '', error: '' });

  const token = localStorage.getItem("token");

  const fetchDeliveries = async () => {
    try {
      const res = await fetch("/api/deliveries", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDeliveries(await res.json());
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchDispatches = async () => {
    try {
      const res = await fetch("/api/dispatches", { headers: { Authorization: `Bearer ${token}` } });
      if(res.ok) {
        setDispatchesData(await res.json());
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (currentTab === 'batches') {
      fetchBatches();
    } else if (currentTab === 'dispatches') {
      fetchBatches(); // Keep batches updated for the dropdown
      fetchDispatches();
    }
    fetchDeliveries();
  }, [currentTab]);

  useEffect(() => {
    // Simulate real-time PLC telemetry
    const interval = setInterval(() => {
      setPlcData(prev => {
        const newTemp = Math.floor(prev.temp + (Math.random() * 6 - 3));
        const limitedTemp = Math.max(350, Math.min(600, newTemp)); // restrict to 350-600C
        
        setTempHistory(history => {
          const newHistory = [...history, { time: new Date().toLocaleTimeString('en-US', {hour12: false}).slice(0, 5), temp: limitedTemp }];
          return newHistory.slice(-20); // keep last 20 data points
        });
        
        return {
          temp: limitedTemp,
          resTime: Math.floor(40 + Math.random() * 10)
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await fetch("/api/batches", { headers: { Authorization: `Bearer ${token}` } });
      if(res.ok) {
        const data = await res.json();
        setBatches(data);
        setSelectedBatch((prev: any) => {
          if (prev) {
            return data.find((b: any) => b.id === prev.id) || prev;
          }
          return prev;
        });
      } else {
        const err = await res.json();
        setMsg(`Error fetching batches: ${err.error || res.statusText}`);
      }
    } catch (e: any) {
      setMsg(`Network error fetching batches: ${e.message}`);
    }
  };

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBatchForm.feedstock_lot_ids.length === 0) {
      setMsg("Please select at least one feedstock delivery.");
      return;
    }
    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feedstock_lot_ids: newBatchForm.feedstock_lot_ids, plant_code: newBatchForm.plant_code })
    });
    if(res.ok) {
      fetchBatches();
      fetchDeliveries();
      setShowNewBatchModal(false);
      setNewBatchForm({ plant_code: "KLN-01", feedstock_lot_ids: [] as number[] });
      setMsg("New batch created successfully.");
    }
  };

  const fetchBaggingScale = async () => {
    const res = await fetch("/api/scales/bagging", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setBaggingWeight(data.weight_t);
      setMsg(`Weighed ${data.weight_t}t via IoT Bagging Scale.`);
    }
  };

  const fetchFuelSensor = async () => {
    const res = await fetch("/api/sensors/fuel", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setDieselLitres(data.fuel_litres);
      setMsg(`Fuel consumption registered: ${data.fuel_litres}L via IoT sensor.`);
    }
  };

  const handleCameraCapture = async (dataUrl: string, ts: string, lat: number, lng: number) => {
    if (activeCameraAction === 'evidence' && evidenceDispatchId) {
      try {
        const res = await fetch(`/api/dispatches/${evidenceDispatchId}/evidence`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ photo_url: dataUrl })
        });
        if(res.ok) {
          setMsg(`Evidence photo uploaded successfully.`);
          fetchDispatches();
        } else {
          setMsg(`Failed to upload evidence.`);
        }
      } catch (e) {
        setMsg(`Error uploading evidence.`);
      }
      setEvidenceDispatchId(null);
    } else if (activeCameraAction) {
      setPhotos(prev => ({ ...prev, [activeCameraAction]: dataUrl, [`${activeCameraAction}_lat`]: lat, [`${activeCameraAction}_lng`]: lng }));
      setMsg(`${activeCameraAction} photo captured.`);
    }
    setActiveCameraAction(null);
  };

  const finalizeProduction = async (e: any) => {
    e.preventDefault();
    if (!baggingWeight) {
      setMsg("Error: Must read bagging scale first.");
      return;
    }
    if (!dieselLitres) {
      setMsg("Error: Must read fuel consumption sensor first.");
      return;
    }
    const id = selectedBatch.id;
    const body = {
      wet_output_mass: baggingWeight,
      moisture_1: +e.target.m1.value,
      moisture_2: +e.target.m2.value,
      moisture_3: +e.target.m3.value,
      ph: +e.target.ph.value,
      bulk_density_kg_m3: +e.target.density.value,
      diesel_litres: dieselLitres,
      // photos: photos // normally we'd pass these
    };
    const res = await fetch(`/api/batches/${id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if(res.ok) {
      let yieldMsg = "Production Finalized. Yield Ratio: " + (d.yield_ratio*100).toFixed(1) + "%";
      if (d.yield_ratio < 0.25 || d.yield_ratio > 0.40) yieldMsg += " (WARNING: Check Yield Anomaly)";
      setMsg(yieldMsg);
      fetchBatches();
      setSelectedBatch(null);
      setBaggingWeight(null);
      setPhotos({});
    }
  };

  const sealSample = async (id: number) => {
    if (!sealForm.grabbed || !sealForm.sealed || !sealForm.batchIdVisible || !sealForm.retentionRef || !photos.seal) {
      setSealForm({ ...sealForm, error: "Please complete all 5 steps: 5-point grab, seal container, capture photo, check Batch ID, and enter retention reference." });
      return;
    }
    // Simple distance check if lat/lng are implemented, for now assume check passed if photo exists
    await fetch(`/api/batches/${id}/seal-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        retention_ref: sealForm.retentionRef,
        photo_url: photos.seal,
        lat: (photos as any).seal_lat,
        lng: (photos as any).seal_lng
      })
    });
    await fetchBatches();
    setMsg("Sample sealed and ready for dispatch or lab testing.");
    setSealForm({ grabbed: false, sealed: false, batchIdVisible: false, retentionRef: '', error: '' });
    setPhotos(prev => ({ ...prev, seal: undefined }));
  };

  const dispatchBatch = async (e: any, batch: any) => {
    e.preventDefault();
    const res = await fetch(`/api/dispatches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ 
        batch_id_label: batch.batch_id_label, 
        buyer_name: e.target.buyer.value, 
        buyer_district: e.target.buyer_district?.value || '',
        declared_use: e.target.declared_use.value, 
        weight: e.target.weight.value 
      })
    });
    const data = await res.json();
    if(res.ok) {
      fetchBatches();
      setSelectedBatch(null);
      setMsg("Dispatch payload recorded accurately.");
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  const filteredBatches = batches.filter(b => activeTab === 'All' || b.status === activeTab);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'OPEN': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'PRODUCTION_COMPLETE': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CARBON_CALCULATED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'SAMPLE_SEALED': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'DISPATCHED': return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'CORC_INELIGIBLE': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const formatDate = (ds: string) => {
    const d = new Date(ds);
    return `${d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})}, ${d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}`;
  };

  const tabs: TabType[] = ['All', 'OPEN', 'PRODUCTION_COMPLETE', 'SAMPLE_SEALED', 'CARBON_CALCULATED', 'DISPATCHED', 'AUDIT_READY', 'CORC_INELIGIBLE'];

  const renderMessage = () => {
    if (!msg) return null;
    return (
      <div onClick={() => setMsg("")} className="cursor-pointer bg-[#e8f5e9] border border-[#a5d6a7] p-4 text-sm font-semibold text-[#2e7d32] rounded-lg shadow-sm flex justify-between items-center mb-4">
        <span>{msg}</span>
        <span className="opacity-50 hover:opacity-100">✕</span>
      </div>
    );
  };

  if (currentTab === 'instruments') {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {renderMessage()}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-b-4 border-b-emerald-600">
          <h2 className="text-xl font-bold flex items-center text-slate-800">
            Instrument Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1">FV-6: Instruments are read-only API push — manual override blocked</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[200px] text-center">
            <div className="flex w-full justify-between items-start mb-6">
              <div className="flex items-center text-lg font-bold text-slate-800">
                <Scale size={20} className="mr-3 text-slate-600" /> Weighbridge WB-001
              </div>
              <button className="p-2 ml-4 rounded-md border border-slate-300 hover:bg-slate-50 transition-colors">
                <RefreshCw size={18} className="text-slate-600" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-8 self-start text-left w-full">Simulated instrument API — read-only, no manual override (FV-6)</p>
            <p className="text-sm text-slate-500 font-medium">Click refresh to read instrument</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[200px] text-center">
            <div className="flex w-full justify-between items-start mb-6">
              <div className="flex items-center text-lg font-bold text-slate-800">
                <Scale size={20} className="mr-3 text-slate-600" /> Bagging Scale BS-001
              </div>
              <button className="p-2 ml-4 rounded-md border border-slate-300 hover:bg-slate-50 transition-colors">
                <RefreshCw size={18} className="text-slate-600" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-8 self-start text-left w-full">Simulated instrument API — read-only, no manual override (FV-6)</p>
            <p className="text-sm text-slate-500 font-medium">Click refresh to read instrument</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentTab === 'flags') {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {renderMessage()}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-b-4 border-b-emerald-600">
          <h2 className="text-xl font-bold flex items-center text-slate-800">
            Validation Flags
          </h2>
          <p className="text-sm text-slate-500 mt-1">Automated Validation Engine alerts — VE-01 through VE-13</p>
        </div>

        <div className="flex space-x-2 py-2">
          {['OPEN', 'RESOLVED', 'All'].map(tab => (
            <button
              key={tab}
              onClick={() => setFlagTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase transition-colors border ${
                flagTab === tab 
                ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {validationFlags.filter(f => flagTab === 'All' || (flagTab === 'OPEN' && f.status === 'Open') || (flagTab === 'RESOLVED' && f.status === 'Resolved')).map(flag => (
            <div key={flag.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div className="flex items-start">
                <Flag className="text-[#f59e0b] mr-4 mt-1 flex-shrink-0" size={24} />
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-2 py-0.5 rounded border border-orange-200">{flag.code}</span>
                    <span className="text-slate-600 text-sm font-medium">{flag.type} {flag.relId}</span>
                    <span className="text-slate-500 text-sm">Batch {flag.batch}</span>
                    <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-0.5 rounded-full">{flag.status}</span>
                  </div>
                  <p className="text-slate-700 font-medium text-base mb-1">{flag.desc}</p>
                  <p className="text-xs text-slate-500">{flag.date}</p>
                </div>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <CheckCircle size={16} />
                <span>Resolve</span>
              </button>
            </div>
          ))}
          {validationFlags.filter(f => flagTab === 'All' || (flagTab === 'OPEN' && f.status === 'Open') || (flagTab === 'RESOLVED' && f.status === 'Resolved')).length === 0 && (
            <div className="bg-white p-8 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
              No flags found for this filter.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentTab === 'calibration') {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {renderMessage()}
        <div className="flex justify-between items-start bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-b-4 border-b-emerald-600">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Instrument Calibration
            </h2>
            <p className="text-sm text-slate-500 mt-1">NABL-accredited calibration certificates — VE-03 compliance</p>
          </div>
          <button 
            onClick={() => setShowAddCertModal(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
          >
            <Plus size={16} className="mr-2" /> Add Certificate
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start">
          <AlertTriangle size={20} className="text-red-500 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">
            1 calibration cert(s) EXPIRED. 1 cert(s) expiring soon. Expired instruments block weighbridge readings.
          </p>
        </div>

        <div className="space-y-4">
          {calibrations.map(cert => (
            <div key={cert.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4 flex-1">
                <div className="p-3 bg-slate-50 flex-shrink-0 rounded-full text-slate-500 border border-slate-200">
                  <Wrench size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Instrument</p>
                  <p className="text-slate-800 font-medium text-base">{cert.name}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">ID</p>
                  <p className="text-slate-800 font-medium">{cert.instId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Certificate</p>
                  <p className="text-slate-800 font-medium truncate">{cert.cert}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Expiry</p>
                  <p className={`font-medium ${cert.status === 'Expired' ? 'text-red-600' : cert.status === 'Expiring Soon' ? 'text-orange-600' : 'text-slate-800'}`}>
                    {cert.expiryStr}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Days Remaining</p>
                  <p className={`font-medium ${cert.status === 'Expired' ? 'text-red-600' : cert.status === 'Expiring Soon' ? 'text-orange-600' : 'text-slate-800'}`}>
                    {cert.days}d
                  </p>
                </div>
              </div>
              
              <div className="flex-shrink-0 min-w-[100px] text-right">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                  ${cert.status === 'Valid' ? 'bg-green-50 text-green-700 border-green-200' : 
                    cert.status === 'Expiring Soon' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                    'bg-red-50 text-red-700 border-red-200'}`}
                >
                  {cert.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Certificate Modal */}
        {showAddCertModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-xl w-full">
              <div className="flex justify-between items-center p-6 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Add Calibration Certificate</h3>
                <button onClick={() => setShowAddCertModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Instrument Name</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g. Mettler Toledo Weighbridge" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Instrument ID</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g. WB-001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Certificate Number</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g. NABL-WB-2025-0341" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
                    <input type="date" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                    <input type="date" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">NABL Accreditation No.</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g. CC-2941" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Certificate URL</label>
                    <input type="url" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="https://..." />
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-slate-100 flex justify-end space-x-3">
                <button 
                  onClick={() => setShowAddCertModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setShowAddCertModal(false)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium transition-colors"
                >
                  Add Certificate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleCreateDispatch = async () => {
    try {
      const res = await fetch(`/api/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          batch_id_label: newDispatchForm.batch,
          buyer_name: newDispatchForm.buyerName,
          buyer_district: newDispatchForm.buyerDistrict,
          declared_use: newDispatchForm.declaredUse,
          weight: newDispatchForm.weight 
        })
      });
      const data = await res.json();
      if(res.ok) {
        setShowNewDispatchModal(false);
        setNewDispatchForm({ batch: '', buyerName: '', buyerDistrict: '', declaredUse: '', weight: '' });
        setDispatchError('');
        fetchDispatches(); // update list
      } else {
        setDispatchError(data.error || 'Failed to create dispatch');
      }
    } catch (e: any) {
      setDispatchError(e.message);
    }
  };

  if (currentTab === 'dispatches') {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
        {renderMessage()}
        <div className="flex justify-between items-start bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-b-4 border-b-emerald-600">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Dispatches
            </h2>
            <p className="text-sm text-slate-500 mt-1">Track biochar sales and end-use evidence</p>
          </div>
          <button 
            onClick={() => setShowNewDispatchModal(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
          >
            <Plus size={16} className="mr-2" /> New Dispatch
          </button>
        </div>

        <div className="space-y-4">
          {dispatchesData.map(dispatch => (
            <div key={dispatch.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4 flex-1">
                <div className="p-3 bg-slate-50 flex-shrink-0 text-slate-500 border border-slate-200 rounded-md">
                  <Truck size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Buyer</p>
                  <p className="text-slate-800 font-medium text-base">{dispatch.buyer_name || dispatch.buyerName}</p>
                  <p className="text-xs text-slate-500">{dispatch.buyer_district || dispatch.district}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">{dispatch.batch_id_label || dispatch.batchData}</p>
                  <p className="text-slate-800 font-medium">{(dispatch.dispatch_weight_t || dispatch.weight || 0).toFixed(3)} t</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Declared Use</p>
                  <p className="text-slate-800 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{dispatch.declared_use || dispatch.declaredUse}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Evidence Due</p>
                  <p className={`font-medium text-sm ${(dispatch.evidence_status || dispatch.status) === 'OVERDUE' ? 'text-red-600' : 'text-slate-800'}`}>
                    {dispatch.evidence_due_date ? formatDate(dispatch.evidence_due_date) : dispatch.evidenceDue}
                  </p>
                </div>
              </div>
              
              <div className="flex-shrink-0 min-w-[100px] text-right flex flex-col items-end gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                  ${(dispatch.evidence_status || dispatch.status) === 'RECEIVED' ? 'bg-green-50 text-green-700 border-green-200' : 
                    (dispatch.evidence_status || dispatch.status) === 'OVERDUE' ? 'bg-red-50 text-red-700 border-red-200' : 
                    'bg-slate-50 text-slate-700 border-slate-200'}`}
                >
                  {dispatch.evidence_status || dispatch.status}
                </span>
                {(dispatch.evidence_status || dispatch.status) === 'PENDING' && (
                  <button 
                    onClick={() => {
                      setEvidenceDispatchId(dispatch.id);
                      setActiveCameraAction('evidence');
                    }}
                    className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-200 transition-colors shadow-sm font-medium"
                  >
                    Upload Photo
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add Dispatch Modal */}
        {showNewDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-xl w-full">
              <div className="flex justify-between items-center p-6 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">Create Dispatch Record</h3>
                <button onClick={() => { setShowNewDispatchModal(false); setDispatchError(''); }} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Batch (CARBON_CALCULATED)</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-700"
                    value={newDispatchForm.batch}
                    onChange={(e) => setNewDispatchForm({...newDispatchForm, batch: e.target.value})}
                  >
                    <option value="">Select batch...</option>
                    {batches.filter(b => b.status === "SAMPLE_SEALED").map(b => (
                      <option key={b.id} value={b.batch_id_label}>
                        {b.batch_id_label} - {b.qbiochar_dry ? b.qbiochar_dry.toFixed(2) : '0'}t
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Name</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                      placeholder="Agrofarm Inputs Pvt. Ltd."
                      value={newDispatchForm.buyerName}
                      onChange={(e) => setNewDispatchForm({...newDispatchForm, buyerName: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Buyer District</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                      placeholder="Akola" 
                      value={newDispatchForm.buyerDistrict}
                      onChange={(e) => setNewDispatchForm({...newDispatchForm, buyerDistrict: e.target.value})} 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Declared Use</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-700"
                    value={newDispatchForm.declaredUse}
                    onChange={(e) => setNewDispatchForm({...newDispatchForm, declaredUse: e.target.value})}
                  >
                    <option value="">Select use...</option>
                    <option value="Water Treatment">Water Treatment</option>
                    <option value="Soil Amendment — Cotton">Soil Amendment — Cotton</option>
                    <option value="Soil Amendment — Soybean">Soil Amendment — Soybean</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Weight (tonnes)</label>
                  <input 
                    type="number" step="0.001"
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                    placeholder="3.500" 
                    value={newDispatchForm.weight}
                    onChange={(e) => setNewDispatchForm({...newDispatchForm, weight: e.target.value})}
                  />
                </div>

                <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-lg flex text-sm text-emerald-800">
                  <div className="pt-0.5 mr-2 flex-shrink-0">
                    <CheckCircle size={16} />
                  </div>
                  <p>End-use evidence countdown (60 days) starts on dispatch. Overdue triggers VE-12 flag.</p>
                </div>
              </div>
              
              <div className="p-6 border-t border-slate-100 flex justify-end space-x-3">
                <button 
                  onClick={() => { setShowNewDispatchModal(false); setDispatchError(''); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateDispatch}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium transition-colors"
                >
                  Create Dispatch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Toast for VE-11 */}
        {dispatchError && (
          <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white p-4 rounded-lg shadow-xl max-w-sm flex">
            <AlertTriangle className="mr-3 flex-shrink-0" size={24} />
            <div>
              <p className="font-bold text-sm mb-1">Error</p>
              <p className="text-sm border-l-2 border-red-400 pl-2">{dispatchError}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex justify-between items-center bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Production Batches</h1>
          <p className="text-sm text-slate-500 mt-1">Manage the biochar production lifecycle</p>
        </div>
        <button 
          onClick={() => setShowNewBatchModal(true)} 
          className="flex items-center space-x-2 bg-[#18a058] hover:bg-[#148749] text-white px-5 py-2.5 rounded-lg font-semibold tracking-wide transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>New Batch</span>
        </button>
      </div>

      {renderMessage()}

      {/* Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase transition-colors border ${
              activeTab === tab 
                ? 'bg-[#18a058] text-white border-[#18a058]' 
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Batches List */}
      <div className="space-y-3">
        {filteredBatches.map(b => (
          <div 
            key={b.id} 
            onClick={() => setSelectedBatch(b)}
            className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer flex items-center p-4 px-6 relative"
          >
            <div className="flex-shrink-0 text-[#18a058] mr-5">
              <Leaf size={24} strokeWidth={2.5} />
            </div>
            
            <div className="flex-1 grid grid-cols-5 items-center gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Batch ID</div>
                <div className="font-mono font-bold text-emerald-700 text-sm">{b.batch_id_label}</div>
              </div>
              
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Plant</div>
                <div className="font-semibold text-slate-800 text-sm">{b.plant_code}</div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Output (dry)</div>
                <div className="font-mono text-slate-800 text-sm">{b.qbiochar_dry ? `${b.qbiochar_dry.toFixed(3)} t` : '–'}</div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">CORCs Net</div>
                <div className="font-mono font-bold text-sm">
                  {b.corcs_net ? <span className="text-emerald-600">{b.corcs_net.toFixed(3)} tCO₂e</span> : 
                   (b.status === 'SAMPLE_SEALED' || b.status === 'DISPATCHED') ? <span className="text-amber-500 text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">PENDING</span> : 
                   <span className="text-slate-400">–</span>}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Created</div>
                <div className="text-slate-700 text-xs font-medium">{formatDate(b.created_at_utc)}</div>
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center space-x-6 ml-4 w-48 justify-end">
              <span className={`px-2.5 py-1 rounded-full text-[10px] border font-bold uppercase tracking-wide whitespace-nowrap ${getStatusColor(b.status)}`}>
                {b.status.replace(/_/g, ' ')}
              </span>
              <ChevronRight size={20} className="text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        ))}
        {filteredBatches.length === 0 && (
          <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
            No batches found for this filter.
          </div>
        )}
      </div>

      {/* Slide-over Detail View */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedBatch(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-3xl flex">
            <div className="w-full bg-slate-50 shadow-2xl flex flex-col h-full transform transition-transform border-l border-slate-200">
              <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 border-l-4 border-emerald-500 pl-3">Batch Details</h2>
                  <div className="mt-1 flex items-center space-x-3 text-sm font-mono text-emerald-700 pl-4">
                    <span>{selectedBatch.batch_id_label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${getStatusColor(selectedBatch.status)}`}>{selectedBatch.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedBatch(null)} className="p-2 text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Dashboard top row */}
                <div className={`grid ${selectedBatch.status === 'OPEN' ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-6`}>
                  {/* PLC Real-time block - Only show when OPEN */}
                  {selectedBatch.status === 'OPEN' && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center"><Activity size={18} className="text-rose-500 mr-2" /> Live Process (PLC)</h3>
                        <div className="flex items-center space-x-2 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                          <span className="text-emerald-700 text-[10px] uppercase font-bold tracking-tight">VE-03 Sync</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                          <div className="text-[10px] uppercase font-bold text-slate-500">Reactor Temp</div>
                          <div className={`font-mono text-xl font-bold mt-1 ${plcData.temp < 400 ? 'text-blue-600' : plcData.temp > 550 ? 'text-rose-600' : 'text-emerald-600'}`}>{plcData.temp} °C</div>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                          <div className="text-[10px] uppercase font-bold text-slate-500">Res. Time</div>
                          <div className="font-mono text-xl font-bold text-slate-800 mt-1">{plcData.resTime} min</div>
                        </div>
                      </div>

                      <div className="flex-1 min-h-[120px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={tempHistory}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis dataKey="time" hide />
                            <YAxis domain={['auto', 'auto']} hide />
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                            <Line type="monotone" dataKey="temp" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Consumables (Smart Meter) */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 flex items-center mb-4"><Activity size={18} className="text-blue-500 mr-2" /> Energy & Consumables</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-sm font-semibold text-slate-600">Electricity (Smart Meter)</span>
                        <span className="font-mono text-lg font-bold text-blue-700">142 kWh</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-sm font-semibold text-slate-600">Feedstock Moist. Avg</span>
                        <span className="font-mono text-lg font-bold text-slate-700">15.4 %</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-sm font-semibold text-slate-600">Calculated Mass loss</span>
                        <span className="font-mono text-lg font-bold text-slate-700">~65%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* State: OPEN -> Finalize Form */}
                {selectedBatch.status === 'OPEN' && (
                  <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-100 flex items-center">
                      <FlaskConical size={18} className="text-emerald-600 mr-2" />
                      <h3 className="font-bold text-emerald-900 tracking-tight">Log Output & QC Readings</h3>
                    </div>
                    <form onSubmit={finalizeProduction} className="p-5 space-y-6">
                      
                      {/* Scale Integration block */}
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs uppercase font-bold text-slate-600">IoT Bagging Scale Check-in</label>
                          <div className="flex space-x-2">
                             <button type="button" onClick={fetchBaggingScale} className="bg-[#18a058] hover:bg-[#148749] text-white px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">Fetch Bluetooth Scale</button>
                             <button type="button" onClick={() => setActiveCameraAction("bagging")} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors">📷 Timestamp</button>
                          </div>
                        </div>
                        <div className="flex gap-4 items-center">
                          <div className="flex-1 bg-white border border-slate-300 rounded p-3 flex justify-between items-center text-xl shadow-inner text-right font-mono">
                             <span className="text-slate-400 font-sans text-sm">Output Mass</span>
                             <span className="font-bold text-slate-800">{baggingWeight ? `${baggingWeight} t` : '0.00 t'}</span>
                          </div>
                          {photos.bagging && <img src={photos.bagging} alt="scale" className="h-12 w-12 object-cover rounded shadow" />}
                        </div>
                      </div>
                      
                      {/* Fuel Integration block */}
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs uppercase font-bold text-slate-600">IoT Fuel Sensor Check-in</label>
                          <div className="flex space-x-2">
                             <button type="button" onClick={fetchFuelSensor} className="bg-[#18a058] hover:bg-[#148749] text-white px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">Fetch Fuel Mtr.</button>
                          </div>
                        </div>
                        <div className="flex gap-4 items-center">
                          <div className="flex-1 bg-white border border-slate-300 rounded p-3 flex justify-between items-center text-xl shadow-inner text-right font-mono">
                             <span className="text-slate-400 font-sans text-sm">Fuel Used</span>
                             <span className="font-bold text-slate-800">{dieselLitres ? `${dieselLitres} L` : '0.0 L'}</span>
                          </div>
                        </div>
                      </div>

                      {/* QC parameters */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Moisture 1 (%)</label>
                          <input name="m1" type="number" step="0.1" defaultValue="10.2" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Moisture 2 (%)</label>
                          <input name="m2" type="number" step="0.1" defaultValue="11.1" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 flex justify-between">
                            <span>Moisture 3 (%)</span>
                            <span onClick={() => setActiveCameraAction("moisture")} className="text-emerald-600 cursor-pointer hover:underline text-[10px]">📷 Photo</span>
                          </label>
                          <input name="m3" type="number" step="0.1" defaultValue="10.8" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 flex justify-between">
                            <span>pH Level</span>
                            <span onClick={() => setActiveCameraAction("ph")} className="text-emerald-600 cursor-pointer hover:underline text-[10px]">📷 Photo</span>
                          </label>
                          <input name="ph" type="number" step="0.1" defaultValue="8.5" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Bulk Density (kg/m³)</label>
                          <input name="density" type="number" step="1" defaultValue="280" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" required />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm uppercase tracking-wider py-3 px-8 rounded-lg transition-colors shadow flex items-center">
                          Finalize Quality & Production
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* State: PRODUCTION_COMPLETE -> Seal Sample */}
                {selectedBatch.status === 'PRODUCTION_COMPLETE' && (
                  <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-blue-50 px-5 py-3 border-b border-blue-200 flex items-center">
                      <FlaskConical size={18} className="text-blue-600 mr-2" />
                      <h3 className="font-bold text-blue-900 tracking-tight">Sample Sealing & Retention</h3>
                    </div>
                    <div className="p-5 space-y-4">
                      {sealForm.error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded text-sm font-semibold border border-red-200 flex items-center">
                          <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
                          {sealForm.error}
                        </div>
                      )}
                      
                      <p className="text-sm text-slate-600 mb-4">Complete physical sampling to unlock batch dispatch. CoA processing will be done periodically via Lab Portal.</p>
                      
                      <div className="space-y-3">
                        <label className="flex items-start space-x-3 text-sm cursor-pointer border p-3 rounded-lg hover:bg-slate-50 border-slate-200">
                          <input type="checkbox" className="mt-1" checked={sealForm.grabbed} onChange={e => setSealForm({...sealForm, grabbed: e.target.checked})} />
                          <span className="text-slate-800 font-medium">Completed 5-point composite sample grab from output bags.</span>
                        </label>
                        
                        <label className="flex items-start space-x-3 text-sm cursor-pointer border p-3 rounded-lg hover:bg-slate-50 border-slate-200">
                          <input type="checkbox" className="mt-1" checked={sealForm.sealed} onChange={e => setSealForm({...sealForm, sealed: e.target.checked})} />
                          <span className="text-slate-800 font-medium">Sample secured in tamper-evident container.</span>
                        </label>

                        <div className="border p-4 rounded-lg border-slate-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-slate-800 font-medium">Timestamped + GPS-tagged seal photo</span>
                            <button 
                              onClick={() => setActiveCameraAction("seal")}
                              className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase transition-colors flex items-center ${photos.seal ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                              {photos.seal ? <><CheckCircle size={14} className="mr-1" /> Captured</> : '📷 Capture'}
                            </button>
                          </div>
                          <label className={`flex items-start space-x-3 text-sm cursor-pointer mt-3 ${!photos.seal ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input type="checkbox" className="mt-1" disabled={!photos.seal} checked={sealForm.batchIdVisible} onChange={e => setSealForm({...sealForm, batchIdVisible: e.target.checked})} />
                            <span className="text-slate-600 font-medium italic">I confirm the dMRV printed Batch ID is clearly visible in the photo.</span>
                          </label>
                        </div>
                        
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Sub-Sample B Retention Reference</label>
                          <input 
                            type="text" 
                            placeholder="e.g., RET-2026-B-001" 
                            className="w-full border border-slate-300 p-2.5 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={sealForm.retentionRef}
                            onChange={e => setSealForm({...sealForm, retentionRef: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex justify-end">
                        <button onClick={() => sealSample(selectedBatch.id)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-lg uppercase tracking-wider text-sm shadow">
                           Lock Batch & Allow Dispatch
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* State: SAMPLE_SEALED -> Dispatch Form */}
                {selectedBatch.status === 'SAMPLE_SEALED' && (
                  <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-amber-50 px-5 py-3 border-b border-amber-100 flex items-center">
                      <Truck size={18} className="text-amber-600 mr-2" />
                      <h3 className="font-bold text-amber-900 tracking-tight">Log Dispatch</h3>
                    </div>
                    <form onSubmit={(e) => dispatchBatch(e, selectedBatch)} className="p-5 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Buyer Name</label>
                          <input name="buyer" type="text" placeholder="e.g. Acme Farms" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Declared Use (Auditor Req)</label>
                          <select name="declared_use" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" required>
                             <option value="">Select use case...</option>
                             <option value="Soil Application">Soil Application</option>
                             <option value="Concrete Mix">Concrete Mix</option>
                             <option value="Filtration">Filtration / Water Treatment</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Buyer District</label>
                          <input name="buyer_district" type="text" placeholder="e.g. Akola" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" required />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 flex justify-between">
                            <span>Dispatch Empty Weight</span>
                            <button type="button" className="text-amber-600 uppercase text-[9px] hover:underline">Get Weighbridge</button>
                          </label>
                          <input name="weight" type="number" step="0.001" placeholder="3.500" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none" required />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <button className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm uppercase tracking-wider py-3 px-8 rounded-lg transition-colors shadow flex items-center">
                          Confirm Dispatch Delivery
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Batch Modal exactly like screenshot */}
      {showNewBatchModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#f0f9f4] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden border border-emerald-100">
            <div className="px-6 py-4 flex justify-between items-center border-b border-white bg-white">
              <h2 className="text-[#0e4b31] font-bold text-lg">Create Production Batch</h2>
              <button onClick={() => setShowNewBatchModal(false)} className="text-slate-400 hover:text-slate-700 font-light text-xl">✕</button>
            </div>
            
            <form onSubmit={createBatch} className="p-6 space-y-5 bg-[#f0f9f4]">
              <div>
                <label className="block text-sm font-semibold text-[#0e4b31] mb-1.5">Plant Code</label>
                <input 
                  type="text" 
                  value={newBatchForm.plant_code}
                  onChange={e => setNewBatchForm({...newBatchForm, plant_code: e.target.value})}
                  className="w-full border border-emerald-200 p-2.5 rounded-lg bg-white text-sm text-[#0e4b31] focus:ring-2 focus:ring-[#18a058] focus:border-transparent outline-none transition-shadow" 
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0e4b31] mb-1.5">Select Available Feedstock</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-emerald-200 p-2 rounded-lg bg-white">
                  {deliveries.filter((d: any) => !d.batch_id).length === 0 && (
                     <div className="text-sm text-slate-500 italic p-2">No unassigned feedstock deliveries available.</div>
                  )}
                  {deliveries.filter((d: any) => !d.batch_id).map((d: any) => (
                    <label key={d.id} className="flex items-center space-x-3 p-2 hover:bg-slate-50 rounded cursor-pointer">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                        checked={newBatchForm.feedstock_lot_ids.includes(d.id)}
                        onChange={(e) => {
                          const ids = [...newBatchForm.feedstock_lot_ids];
                          if (e.target.checked) ids.push(d.id);
                          else ids.splice(ids.indexOf(d.id), 1);
                          setNewBatchForm({...newBatchForm, feedstock_lot_ids: ids});
                        }}
                      />
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-emerald-800">LT-{String(d.id).padStart(3, '0')}</span> &mdash; {d.wet_mass_tonnes}t from {d.farmer_id} ({d.full_name})
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                  <input type="checkbox" checked readOnly className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 border-[#18a058] appearance-none cursor-pointer z-10 top-0 left-0 translate-x-4 transition-transform" />
                  <label className="toggle-label block overflow-hidden h-6 rounded-full bg-[#18a058] cursor-pointer"></label>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[#18a058] flex items-center">
                    <span className="mr-1 inline-block">📶</span> PLC Connected
                  </span>
                  <span className="text-xs text-slate-500">VE-03: PLC must be online before batch creation</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setShowNewBatchModal(false)} className="px-5 py-2.5 rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 font-semibold transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-lg bg-[#18a058] hover:bg-[#148749] text-white font-semibold shadow transition-colors">
                  Create Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {activeCameraAction && (
        <CameraCaptureModal
          title={`Verify ${activeCameraAction} parameters`}
          onCapture={handleCameraCapture}
          onClose={() => setActiveCameraAction(null)}
        />
      )}

    </div>
  );
}
