import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import { Cpu } from 'lucide-react';

function App() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col font-sans">
        <header className="px-6 py-4 border-b border-orange-500/20 flex justify-between items-center bg-black/60 backdrop-blur-xl sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Cpu className="w-8 h-8 text-orange-500 drop-shadow-[0_0_10px_#f97316cc]" />
            <h1 className="text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
              IoIoT Core
            </h1>
          </div>
          {token && (
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all shadow-[0_0_15px_#f9731600] hover:shadow-[0_0_15px_#f9731666]"
            >
              TERMINATE FLIGHT
            </button>
          )}
        </header>

        <main className="flex-1 p-6 md:p-10 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Subtle Orange Glow Background */}
          <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vh] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="w-full max-w-7xl z-10 relative">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/admin" element={token && role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
              <Route path="/dashboard" element={token ? <UserDashboard /> : <Navigate to="/login" />} />
              <Route path="/" element={<Navigate to={token ? (role === 'admin' ? '/admin' : '/dashboard') : '/login'} />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
