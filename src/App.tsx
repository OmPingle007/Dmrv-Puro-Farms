/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { useState } from "react";
import { LogOut, Leaf, Wrench, Flag, Settings2, Truck } from "lucide-react";
import Login from "./pages/Login.tsx";
import FieldOfficer from "./pages/FieldOfficer.tsx";
import PlantOperator from "./pages/PlantOperator.tsx";
import LabTechnician from "./pages/LabTechnician.tsx";
import Auditor from "./pages/Auditor.tsx";
import Management from "./pages/Management.tsx";

function Layout() {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Handle routing & protection
  if (location.pathname === "/") {
    if (token && role) {
      const defaultRoute = role === "FIELD_OFFICER" ? "/field?tab=deliveries" : 
                           role === "PLANT_OPERATOR" ? "/operator" :
                           role === "LAB_TECHNICIAN" ? "/lab" :
                           role === "AUDITOR" ? "/auditor" : "/management";
      return <Navigate to={defaultRoute} replace />;
    }
  } else {
    if (!token || !role) {
      return <Navigate to="/" replace />;
    }

    let isAllowed = false;
    if (role === "FIELD_OFFICER" && location.pathname.startsWith("/field")) isAllowed = true;
    if (role === "PLANT_OPERATOR" && location.pathname === "/operator") isAllowed = true;
    if (role === "LAB_TECHNICIAN" && location.pathname === "/lab") isAllowed = true;
    if (role === "AUDITOR" && location.pathname === "/auditor") isAllowed = true;
    if (role === "MANAGEMENT" && location.pathname === "/management") isAllowed = true;

    if (!isAllowed) {
      const fallbackRoute = role === "FIELD_OFFICER" ? "/field?tab=deliveries" : 
                            role === "PLANT_OPERATOR" ? "/operator" :
                            role === "LAB_TECHNICIAN" ? "/lab" :
                            role === "AUDITOR" ? "/auditor" : "/management";
      return <Navigate to={fallbackRoute} replace />;
    }
  }

  const isLogin = location.pathname === "/";
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab') || 'deliveries';

  if (isLogin) {
    return (
      <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Login />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden relative">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-[#0e3020] text-white flex flex-col shrink-0 fixed md:static inset-y-0 left-0 z-30 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0a2317]">
          <div className="flex items-center space-x-2">
            <div className="bg-emerald-500/20 p-1.5 rounded">
              <span className="text-emerald-400 font-bold text-lg leading-none">P</span>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white uppercase">PuroFarms</h1>
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest leading-none">dMRV Platform</p>
            </div>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={() => setIsSidebarOpen(false)}>✕</button>
        </div>

        <div className="p-4 border-b border-white/5 flex flex-col">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">Logged In As</span>
          <span className="text-xs font-medium text-white truncate">{localStorage.getItem("email") || "user@purofarms.com"}</span>
          <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-white/10 text-emerald-300 self-start">
            {role ? role.replace('_', ' ') : 'USER'}
          </div>
        </div>

        <nav className="flex-1 py-2 flex flex-col overflow-y-auto">
          
          {role === 'MANAGEMENT' && (
            <div className={`flex items-center px-4 py-3 cursor-pointer ${location.pathname === '/management' ? 'bg-emerald-500 text-white font-medium' : 'text-white/70 hover:bg-white/5'}`}>
              <span className="mr-3">📊</span> Management Overview
            </div>
          )}
          
          {role === 'PLANT_OPERATOR' && (
            <>
              <div className="px-4 py-2 mt-1 text-[10px] font-semibold text-white/40 uppercase tracking-widest">Production</div>
              <Link to="/operator?tab=batches" className={`flex items-center px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${tab === 'batches' || !tab || (location.pathname === '/operator' && tab !== 'instruments' && tab !== 'flags' && tab !== 'calibration' && tab !== 'dispatches') ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <Leaf size={16} className="mr-3" /> Batches
              </Link>
              <Link to="/operator?tab=instruments" className={`flex items-center px-4 py-2.5 mx-2 mt-1 rounded-lg text-sm transition-colors ${tab === 'instruments' ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <Wrench size={16} className="mr-3" /> Instruments
              </Link>
              <Link to="/operator?tab=flags" className={`flex items-center px-4 py-2.5 mx-2 mt-1 rounded-lg text-sm transition-colors ${tab === 'flags' ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <Flag size={16} className="mr-3" /> Flags
              </Link>
              <Link to="/operator?tab=calibration" className={`flex items-center px-4 py-2.5 mx-2 mt-1 rounded-lg text-sm transition-colors ${tab === 'calibration' ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <Settings2 size={16} className="mr-3" /> Calibration
              </Link>
              <Link to="/operator?tab=dispatches" className={`flex items-center px-4 py-2.5 mx-2 mt-1 rounded-lg text-sm transition-colors ${tab === 'dispatches' ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <Truck size={16} className="mr-3" /> Dispatches
              </Link>
            </>
          )}
          
          {role === 'LAB_TECHNICIAN' && (
            <div className={`flex items-center px-4 py-3 cursor-pointer ${location.pathname === '/lab' ? 'bg-emerald-500 text-white font-medium' : 'text-white/70 hover:bg-white/5'}`}>
              <span className="mr-3">🧪</span> Lab Portal (NABL)
            </div>
          )}
          
          {role === 'FIELD_OFFICER' && (
            <>
              <Link to="/field?tab=deliveries" className={`flex items-center px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${tab === 'deliveries' ? 'bg-emerald-500 text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <span className="mr-3">🚚</span> Deliveries
              </Link>
              <Link to="/field?tab=farmers" className={`flex items-center px-4 py-2.5 mx-2 mt-1 rounded-lg text-sm transition-colors ${tab === 'farmers' ? 'bg-[#18a058] text-white font-medium shadow-sm' : 'text-white/70 hover:bg-white/5'}`}>
                 <span className="mr-3">🧑‍🌾</span> Farmers
              </Link>
            </>
          )}
          
          {role === 'AUDITOR' && (
            <div className="px-4 py-4 mt-2 border-t border-white/5">
              <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">Compliance</div>
              <div className="flex items-center text-sm text-white font-medium">
                <span className="mr-3">📜</span> Audit Trail (Immutable)
              </div>
            </div>
          )}
          
          <div className="mt-auto px-4 mb-4 border-t border-white/5 pt-4">
            <button 
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("role");
                localStorage.removeItem("email");
                window.location.href = "/";
              }}
              className="flex items-center text-sm text-white/50 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </button>
          </div>
        </nav>
      </aside>
      
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center space-x-3 md:space-x-4">
            <button className="md:hidden text-slate-500 p-1" onClick={() => setIsSidebarOpen(true)}>
              ☰
            </button>
            <h2 className="text-base md:text-xl font-bold text-slate-800">
              {location.pathname === '/management' ? 'Management Dashboard' :
               location.pathname === '/operator' ? 'Plant Operator Console' :
               location.pathname === '/lab' ? 'Lab Portal' :
               location.pathname === '/auditor' ? 'Auditor View' :
               location.pathname === '/field' ? (tab === 'farmers' ? 'Farmer Registry' : 'Biomass Deliveries') : 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center space-x-6 text-sm hidden md:flex">
             <div className="text-right">
              <p className="font-semibold text-slate-800">PuroFarms User</p>
              <p className="text-xs text-slate-500 font-bold tracking-wide uppercase">{role ? role.replace('_', ' ') : 'USER'}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">👤</div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 text-slate-800">
          <Routes>
            <Route path="/field" element={<FieldOfficer />} />
            <Route path="/operator" element={<PlantOperator />} />
            <Route path="/lab" element={<LabTechnician />} />
            <Route path="/auditor" element={<Auditor />} />
            <Route path="/management" element={<Management />} />
          </Routes>
        </div>
        
        <footer className="h-12 bg-white border-t border-slate-200 px-8 flex items-center justify-between shrink-0 text-[10px] text-slate-400 font-medium">
          <div className="flex space-x-4">
            <span>PLATFORM v1.4.0 (MVP)</span>
            <span>•</span>
            <span>NODE_ENV: PRODUCTION_COMPLIANCE</span>
          </div>
          <div>&copy; 2026 PuroFarms Private Limited • All transactions hashed via SHA-256</div>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
