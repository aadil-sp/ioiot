import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/auth/register`, { username, password });
            setMsg(res.data.message);
            setError('');
            setTimeout(() => navigate('/login'), 2500);
        } catch (err) {
            setError(err.response?.data?.error || 'Registration sequence failed.');
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
                    <div className="w-20 h-20 bg-orange-950/40 rounded-2xl flex items-center justify-center mb-6 border border-orange-500/50 shadow-[0_0_20px_#f9731666]">
                        <UserPlus className="w-10 h-10 text-orange-500" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-3xl font-bold tracking-widest uppercase text-white">ENROLL</h2>
                    <p className="text-orange-500/70 text-sm mt-2 tracking-widest uppercase">Secure Identity</p>
                </div>

                {msg && <div className="bg-orange-950/50 border-l-4 border-orange-400 text-orange-300 p-3 mb-6 text-sm text-center">{msg}</div>}
                {error && <div className="bg-red-950/50 border-l-4 border-red-500 text-red-400 p-3 mb-6 text-sm text-center">{error}</div>}

                <form onSubmit={handleRegister} className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-xs uppercase tracking-widest text-[#555] font-semibold">Desired ID</label>
                        <input
                            type="text"
                            className="w-full bg-[#111] border-b-2 border-[#333] p-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-wider"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs uppercase tracking-widest text-[#555] font-semibold">Passphrase</label>
                        <input
                            type="password"
                            className="w-full bg-[#111] border-b-2 border-[#333] p-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-widest"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button className="w-full bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase tracking-widest py-4 mt-8 transition-all hover:shadow-[0_0_25px_#f97316b3] group relative overflow-hidden">
                        <span className="relative z-10">Establish</span>
                        <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-[0%] transition-transform duration-300 pointer-events-none"></div>
                    </button>
                </form>
                <div className="mt-8 text-center">
                    <Link to="/login" className="text-xs text-[#666] uppercase tracking-widest hover:text-orange-400 transition-colors">
                        [ Return to Access ]
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
