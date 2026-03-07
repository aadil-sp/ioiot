import { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import DeviceDetail from './pages/DeviceDetail';
import Profile from './pages/Profile';
import Landing from './pages/Landing';
import { Cpu, LogOut, LayoutDashboard, Shield, Sun, Moon, User, Menu, X } from 'lucide-react';

export const ThemeContext = createContext({ dark: true, toggle: () => { } });

function NavContent({ auth, setAuth, dark, toggle, mobile, onClose }) {
  const { token, role, username, avatarColor } = auth;
  const displayName = localStorage.getItem('displayName') || username;
  const initials = (displayName || '').slice(0, 2).toUpperCase();
  const avatarC = localStorage.getItem('avatarColor') || '#f97316';

  const navBtn = dark
    ? 'bg-[#111] text-gray-400 border-[#222] hover:border-orange-500/40 hover:text-white'
    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:text-gray-900';

  return (
    <>
      {/* Theme Toggle */}
      <button onClick={toggle}
        className={`p-2 rounded-xl border transition-all ${dark ? 'border-[#222] text-yellow-400 hover:bg-yellow-400/10' : 'border-gray-200 text-orange-600 hover:bg-orange-100'}`}
        title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {token && (
        <>
          {/* Avatar / Profile */}
          <Link to="/profile" onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black font-mono text-sm hover:opacity-80 transition-all"
            style={{ backgroundColor: avatarC }}
            title={displayName || username}>
            {initials || <User className="w-4 h-4" />}
          </Link>

          <Link to={role === 'admin' ? '/admin' : '/dashboard'} onClick={onClose}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${navBtn}`}>
            {role === 'admin' ? <Shield className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
            {role === 'admin' ? 'Admin' : 'Dashboard'}
          </Link>

          {/* Username chip — hide on very small */}
          <div className={`hidden lg:flex items-center gap-2 text-sm font-mono ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span>{displayName || username}</span>
            {role === 'admin' && <span className="text-orange-500 text-xs border border-orange-500/30 px-2 py-0.5 rounded">ADMIN</span>}
          </div>

          <button
            onClick={() => { localStorage.clear(); setAuth({ token: null, role: null, username: null }); window.location.href = '/login'; }}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </>
      )}
    </>
  );
}

function AppShell({ auth, setAuth, dark, toggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${dark ? 'bg-[#050505] text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`px-4 sm:px-6 py-3 sm:py-4 border-b flex justify-between items-center sticky top-0 z-50 backdrop-blur-xl transition-colors duration-300 ${dark ? 'border-orange-500/20 bg-black/70' : 'border-orange-300/40 bg-white/90'}`}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 sm:gap-3">
          <img src="/logo.png" alt="ioIoT Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
          <h1 className="text-xl sm:text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
            ioiot
          </h1>
          <span className={`hidden sm:inline text-[10px] font-mono tracking-widest border px-2 py-0.5 rounded ${dark ? 'text-orange-500/60 border-orange-500/20' : 'text-orange-600 border-orange-400/30'}`}>v2.0</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden sm:flex items-center gap-3">
          <NavContent auth={auth} setAuth={setAuth} dark={dark} toggle={toggle} onClose={() => { }} />
        </div>

        {/* Mobile Menu Toggle */}
        <button className="sm:hidden p-2 rounded-xl" onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className={`sm:hidden flex flex-col gap-3 px-4 py-4 border-b ${dark ? 'bg-black/80 border-[#222]' : 'bg-white/90 border-gray-200'}`}>
          <NavContent auth={auth} setAuth={setAuth} dark={dark} toggle={toggle} mobile onClose={() => setMenuOpen(false)} />
        </div>
      )}

      <main className="flex-1 relative overflow-x-hidden">
        <div className={`absolute top-1/4 left-1/4 w-[50vw] h-[50vh] rounded-full blur-[120px] pointer-events-none ${dark ? 'bg-orange-600/5' : 'bg-orange-400/8'}`}></div>
        <div className="relative z-10">
          <Routes>
            <Route path="/login" element={<Login setAuth={setAuth} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin" element={auth.token && auth.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
            <Route path="/dashboard" element={auth.token ? <UserDashboard /> : <Navigate to="/login" />} />
            <Route path="/device/:id" element={auth.token ? <DeviceDetail /> : <Navigate to="/login" />} />
            <Route path="/profile" element={auth.token ? <Profile /> : <Navigate to="/login" />} />
            <Route path="/" element={auth.token ? <Navigate to={auth.role === 'admin' ? '/admin' : '/dashboard'} /> : <Landing />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
    username: localStorage.getItem('username'),
  });
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');

  const toggleTheme = () => {
    setDark(d => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: toggleTheme }}>
      <BrowserRouter>
        <AppShell auth={auth} setAuth={setAuth} dark={dark} toggle={toggleTheme} />
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}

export default App;
