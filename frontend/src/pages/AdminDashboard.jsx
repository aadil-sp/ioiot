import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import DeviceControl from '../components/DeviceControl';

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/admin/users`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const approveUser = async (id) => {
        try {
            await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/admin/users/${id}/approve`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            fetchUsers();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="w-full flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700">

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#333] pb-6">
                <div>
                    <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-widest text-white mb-2">SYSTEM<span className="text-orange-500">_ADMIN</span></h2>
                    <p className="text-[#888] font-mono tracking-widest text-sm">SECURE COMMAND LINE</p>
                </div>
                <div className="bg-[#111] px-4 py-2 rounded-lg border border-orange-500/30 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-orange-500" />
                    <span className="text-xs uppercase tracking-widest font-bold text-orange-400">Clearance Level: OMEGA</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">

                {/* User Management Panel */}
                <div className="xl:col-span-4 space-y-4">
                    <div className="bg-[#0A0A0A] p-8 rounded-3xl border border-orange-500/20 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-[50px]"></div>

                        <div className="flex items-center gap-3 mb-6 border-b border-[#333] pb-4">
                            <Users className="w-6 h-6 text-red-500" />
                            <h3 className="text-lg font-bold uppercase tracking-widest text-white">Access Requests</h3>
                        </div>

                        {users.length === 0 ? (
                            <div className="bg-[#111] p-6 text-center border border-dashed border-[#333] rounded-xl flex items-center justify-center">
                                <span className="text-[#555] font-mono text-sm tracking-widest">NO_PENDING_REQUESTS_</span>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scroll">
                                {users.map((u, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                                        key={u._id}
                                        className="flex flex-col sm:flex-row justify-between sm:items-center bg-[#111] p-5 rounded-xl border border-orange-500/10 hover:border-orange-500/40 transition-colors gap-4"
                                    >
                                        <div>
                                            <span className="block font-mono text-lg font-bold text-gray-200">@{u.username}</span>
                                            <span className="text-[10px] uppercase tracking-widest font-mono mt-1 block">
                                                STATE:
                                                {u.isApproved
                                                    ? <span className="text-green-500 ml-2 drop-shadow-[0_0_5px_#22c55ecc]">_AUTHORIZED</span>
                                                    : <span className="text-red-500 ml-2 drop-shadow-[0_0_5px_#ef4444cc]">_RESTRICTED</span>}
                                            </span>
                                        </div>
                                        {!u.isApproved && (
                                            <button
                                                onClick={() => approveUser(u._id)}
                                                className="bg-orange-500/10 border border-orange-500/50 hover:bg-orange-500 text-orange-400 hover:text-black font-semibold text-xs tracking-widest uppercase px-4 py-2 rounded transition-all"
                                            >
                                                Grant
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Console / Map / Remote Array */}
                <div className="xl:col-span-8">
                    <DeviceControl deviceId="device-001" isAdmin={true} />
                </div>
            </div>
        </div>
    );
}
