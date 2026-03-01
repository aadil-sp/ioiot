import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/login`, { username, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('role', res.data.role);
            localStorage.setItem('username', res.data.username);
            window.location.href = res.data.role === 'admin' ? '/admin' : '/dashboard';
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full mt-20 p-8 glass-panel rounded-2xl border border-white/10 shadow-2xl"
        >
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-4 border border-cyan-500/30">
                    <LogIn className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-3xl font-bold">Welcome Back</h2>
                <p className="text-gray-400 mt-2">Sign in to your IoIoT node</p>
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-4 text-center">{error}</div>}

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <input
                        type="text"
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <input
                        type="password"
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg mt-4 transition-all shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50">
                    Login Account
                </button>
            </form>
            <p className="text-gray-400 text-sm mt-6 text-center">
                Don't have an account? <Link to="/register" className="text-cyan-400 hover:text-cyan-300">Register</Link>
            </p>
        </motion.div>
    );
}
