import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import DeviceDetail from './pages/DeviceDetail';
import { Cpu, LogOut, LayoutDashboard, Shield } from 'lucide-react';

function App() {
  const [auth, setAuth] = useState({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
    username: localStorage.getItem('username'),
  });

  const { token, role, username } = auth;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col font-sans">
        <header className="px-6 py-4 border-b border-orange-500/20 flex justify-between items-center bg-black/60 backdrop-blur-xl sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Cpu className="w-8 h-8 text-orange-500 drop-shadow-[0_0_10px_#f97316cc]" />
            <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
              IoIoT
            </h1>
            <span className="text-[10px] text-orange-500/60 font-mono tracking-widest border border-orange-500/20 px-2 py-0.5 rounded">v2.0</span>
          </div>
          {token && (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span>{username}</span>
                {role === 'admin' && <span className="text-orange-500 text-xs border border-orange-500/30 px-2 py-0.5 rounded">ADMIN</span>}
              </div>
              <Link to={role === 'admin' ? '/admin' : '/dashboard'}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-[#111] text-gray-400 border border-[#222] hover:border-orange-500/40 hover:text-white transition-all">
                {role === 'admin' ? <Shield className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
                {role === 'admin' ? 'Admin' : 'Dashboard'}
              </Link>
              <button
                onClick={() => {
                  localStorage.clear();
                  setAuth({ token: null, role: null, username: null });
                  window.location.href = '/login';
                }}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vh] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="relative z-10">
            <Routes>
              <Route path="/login" element={<Login setAuth={setAuth} />} />
              <Route path="/register" element={<Register />} />
              <Route path="/admin" element={token && role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
              <Route path="/dashboard" element={token ? <UserDashboard /> : <Navigate to="/login" />} />
              <Route path="/device/:id" element={token ? <DeviceDetail /> : <Navigate to="/login" />} />
              <Route path="/" element={<Navigate to={token ? (role === 'admin' ? '/admin' : '/dashboard') : '/login'} />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
