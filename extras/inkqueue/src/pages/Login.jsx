import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { LogIn } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      localStorage.setItem('inkqueue_token', res.data.token);
      localStorage.setItem('inkqueue_role', res.data.role);
      localStorage.setItem('inkqueue_username', res.data.username);
      localStorage.setItem('inkqueue_wallet_balance', res.data.walletBalance);
      
      // Redirect based on role
      if (res.data.role === 'admin') navigate('/admin');
      else if (res.data.role === 'shopkeeper') navigate('/shop');
      else navigate('/dashboard');
      
      // Force refresh to update navbar
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <div className="card animate-fade" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <LogIn color="var(--accent-primary)" /> Welcome Back
        </h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input 
              className="input-field" 
              type="text" 
              required 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input 
              className="input-field" 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} type="submit">Log In</button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--accent-primary)' }}>Register</Link>
        </p>
      </div>
    </div>
  );
}
