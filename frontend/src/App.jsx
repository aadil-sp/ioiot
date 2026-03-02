import { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import DeviceDetail from './pages/DeviceDetail';
import { Cpu, LogOut, LayoutDashboard, Shield, Sun, Moon } from 'lucide-react';

export const ThemeContext = createContext({ dark: true, toggle: () => { } });

function App() {
  const [auth, setAuth] = useState({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
    username: localStorage.getItem('username'),
  });
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');

  const { token, role, username } = auth;

  const toggleTheme = () => {
    setDark(d => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Apply theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: toggleTheme }}>
      <BrowserRouter>
        <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${dark ? 'bg-[#050505] text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
          <header className={`px-6 py-4 border-b flex justify-between items-center sticky top-0 z-50 backdrop-blur-xl transition-colors duration-300 ${dark ? 'border-orange-500/20 bg-black/60' : 'border-orange-300/40 bg-white/80'}`}>
            <div className="flex items-center gap-3">
              <Cpu className="w-8 h-8 text-orange-500 drop-shadow-[0_0_10px_#f97316cc]" />
              <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
                IoIoT
              </h1>
              <span className={`text-[10px] font-mono tracking-widest border px-2 py-0.5 rounded ${dark ? 'text-orange-500/60 border-orange-500/20' : 'text-orange-600 border-orange-400/30'}`}>v2.0</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-xl border transition-all ${dark ? 'border-[#222] text-yellow-400 hover:bg-yellow-400/10' : 'border-orange-300/40 text-orange-600 hover:bg-orange-100'}`}
                title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {token && (
                <div className="flex items-center gap-3">
                  <div className={`hidden md:flex items-center gap-2 text-sm font-mono ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span>{username}</span>
                    {role === 'admin' && <span className="text-orange-500 text-xs border border-orange-500/30 px-2 py-0.5 rounded">ADMIN</span>}
                  </div>
                  <Link to={role === 'admin' ? '/admin' : '/dashboard'}
                    className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${dark ? 'bg-[#111] text-gray-400 border-[#222] hover:border-orange-500/40 hover:text-white' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400 hover:text-gray-900'}`}>
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
            </div>
          </header>

          <main className="flex-1 relative overflow-hidden">
            <div className={`absolute top-1/4 left-1/4 w-[50vw] h-[50vh] rounded-full blur-[120px] pointer-events-none ${dark ? 'bg-orange-600/5' : 'bg-orange-400/10'}`}></div>
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
    </ThemeContext.Provider>
  );
}

export default App;
