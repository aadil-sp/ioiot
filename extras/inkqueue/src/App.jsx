import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Printer, LogOut, User as UserIcon } from 'lucide-react';
import Landing from './pages/Landing';
import UserDashboard from './pages/UserDashboard';
import ShopDashboard from './pages/ShopDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { useEffect, useState } from 'react';
import axios from 'axios';

// Add global axios configuration for auth
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('inkqueue_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('inkqueue_role');
    const username = localStorage.getItem('inkqueue_username');
    const walletBalance = localStorage.getItem('inkqueue_wallet_balance');
    if (role && username) {
      setUser({ role, username, walletBalance });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('inkqueue_token');
    localStorage.removeItem('inkqueue_role');
    localStorage.removeItem('inkqueue_username');
    localStorage.removeItem('inkqueue_wallet_balance');
    setUser(null);
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="container">
        <Link to={user?.role === 'admin' ? '/admin' : user?.role === 'shopkeeper' ? '/shop' : user?.role === 'user' ? '/dashboard' : '/'} className="logo" style={{ textDecoration: 'none' }}>
          <Printer size={28} color="var(--accent-primary)" />
          Ink<span>Queue</span>
        </Link>
        <div className="nav-links">
          {!user ? (
            <>
              <Link to="/login" className="btn btn-secondary">Login</Link>
            </>
          ) : (
            <>
              {user.role === 'user' && (
                  <span className="badge badge-pending" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      Wallet: Rs. {user.walletBalance || 0}
                  </span>
              )}
              <span className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserIcon size={18} /> {user.username} ({user.role})
              </span>
              <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.4rem 0.8rem' }}>
                <LogOut size={16} /> Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <Navbar />
      <div className="page-container">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/shop" element={<ShopDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
