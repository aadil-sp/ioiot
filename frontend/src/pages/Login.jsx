import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Fingerprint, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login({ setAuth }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        const trimmedUsername = username.trim();
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/auth/login`, { username: trimmedUsername, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('role', res.data.role);
            localStorage.setItem('username', res.data.username);
            if (res.data.userId) localStorage.setItem('userId', res.data.userId);
            setAuth({
                token: res.data.token,
                role: res.data.role,
                username: res.data.username
            });
            navigate(res.data.role === 'admin' ? '/admin' : '/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Authentication denied.');
        }
    };

    return (
        <div className="flex justify-center items-center w-full min-h-[70vh]">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-sm p-8 sm:p-10 bg-[#0A0A0A] rounded-3xl border border-orange-500/30 shadow-[0_0_50px_-15px_#f973164d] hover:shadow-[0_0_50px_-10px_#f9731680] transition-shadow duration-500"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="w-20 h-20 mb-6 drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]">
                        <img src="/logo.png" alt="ioIoT Logo" className="w-full h-full object-contain" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-widest uppercase text-white">LOG IN</h2>
                    <p className="text-orange-500/70 text-sm mt-2 tracking-widest uppercase">Sign in to your account</p>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-950/50 border-l-4 border-red-500 text-red-400 p-3 mb-6 text-sm text-center">
                        {error}
                    </motion.div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-xs uppercase tracking-widest text-[#555] font-semibold">Username</label>
                        <input
                            type="text"
                            className="w-full bg-[#111] border-b-2 border-[#333] p-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-wider"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs uppercase tracking-widest text-[#555] font-semibold">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                className="w-full bg-[#111] border-b-2 border-[#333] p-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-widest"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-orange-500 transition-colors"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button className="w-full bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase tracking-widest py-4 mt-8 transition-all hover:shadow-[0_0_25px_#f97316b3] group relative overflow-hidden">
                        <span className="relative z-10">Sign In</span>
                        <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-[0%] transition-transform duration-300 pointer-events-none"></div>
                    </button>
                </form>
                <div className="mt-8 text-center">
                    <Link to="/register" className="text-xs text-[#666] uppercase tracking-widest hover:text-orange-400 transition-colors">
                        [ Create An Account ]
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
