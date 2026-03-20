import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${API_BASE}/auth/register`, { username, password });
      setMessage(res.data.message || 'Registered! Please wait for admin approval.');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
      <div className="card animate-fade" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <UserPlus color="var(--accent-primary)" /> Register Profile
        </h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', marginBottom: '1rem', textAlign: 'center' }}>{message}</div>}
        <form onSubmit={handleRegister}>
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
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} type="submit">Register</button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--accent-primary)' }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
