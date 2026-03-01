import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';

function App() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0a0f1d] text-gray-100 flex flex-col">
        <header className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20 backdrop-blur-md">
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            IoIoT Platform
          </h1>
          {token && (
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
              className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
            >
              Sign out
            </button>
          )}
        </header>

        <main className="flex-1 p-6 flex flex-col items-center">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin" element={token && role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
            <Route path="/dashboard" element={token ? <UserDashboard /> : <Navigate to="/login" />} />
            <Route path="/" element={<Navigate to={token ? (role === 'admin' ? '/admin' : '/dashboard') : '/login'} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
