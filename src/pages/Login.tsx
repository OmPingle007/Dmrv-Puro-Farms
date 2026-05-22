import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, Eye, EyeOff } from "lucide-react";

const DEMO_USERS = [
  { role: "Field Officer", email: "field_officer@purofarms.com", color: "text-emerald-700" },
  { role: "Plant Operator", email: "operator@purofarms.com", color: "text-blue-700" },
  { role: "Lab Technician", email: "lab@nabl-partner.com", color: "text-purple-700" },
  { role: "VVB Auditor", email: "auditor@vvb-puro.com", color: "text-orange-700" },
  { role: "Management", email: "ceo@purofarms.com", color: "text-red-800" },
] as const;

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password");
      return;
    }
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("email", email);

      // Route based on role for the demo
      if (data.role === "FIELD_OFFICER") navigate("/field?tab=deliveries");
      else if (data.role === "PLANT_OPERATOR") navigate("/operator");
      else if (data.role === "LAB_TECHNICIAN") navigate("/lab");
      else if (data.role === "AUDITOR") navigate("/auditor");
      else if (data.role === "MANAGEMENT") navigate("/management");
      else navigate("/management"); // fallback
    } catch(err: any) {
      setError(err.message);
    }
  };

  const autofill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo1234");
    setError("");
  };

  return (
    <div className="min-h-screen bg-[#0e4b31] flex justify-center items-start md:items-center p-6 sm:p-12 font-sans py-12">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        
        {/* Left Column */}
        <div className="text-white">
          <div className="flex items-center space-x-3 mb-10">
            <div className="bg-white/20 p-2 rounded-xl">
              <Leaf className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">PuroFarms</h1>
              <p className="text-emerald-300 text-sm">dMRV Platform</p>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Digital Monitoring,<br/>Reporting & Verification
          </h2>
          <p className="text-emerald-100/90 text-sm md:text-base leading-relaxed mb-10 max-w-md">
            Compliance-grade biochar carbon credit platform.<br/>
            Puro.earth methodology · SHA-256 hash chain · 13 Validation Engine rules
          </p>

          <div className="mb-4">
            <h3 className="text-xs font-bold tracking-[0.15em] text-emerald-300 uppercase">
              Quick access — All passwords: demo1234
            </h3>
          </div>

          <div className="space-y-3">
            {DEMO_USERS.map((user) => (
              <button 
                type="button"
                key={user.role} 
                onClick={() => autofill(user.email)}
                className="w-full sm:w-[420px] bg-white/10 hover:bg-white/20 border border-transparent hover:border-white/20 transition-all text-left flex items-center px-4 py-3 rounded-xl group"
              >
                <div className={`bg-white font-bold text-xs px-3 py-1.5 rounded uppercase tracking-wide mr-4 shadow-sm ${user.color}`}>
                  {user.role}
                </div>
                <div className="font-mono text-xs text-white opacity-90 group-hover:opacity-100">
                  {user.email}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="flex justify-center lg:justify-end">
          <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 w-full max-w-md">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Sign In</h2>
            <p className="text-slate-500 text-sm mb-8">Enter your credentials to access your portal</p>

            {error && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 font-medium text-xs rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all pr-12"
                    placeholder="••••••••"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button 
                type="submit" 
                className="w-full bg-[#176241] hover:bg-[#114b31] text-white font-semibold py-3.5 px-4 rounded-lg transition-colors shadow-sm mt-6"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
