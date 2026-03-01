import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import DeviceControl from '../components/DeviceControl';

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/users`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const approveUser = async (id) => {
        try {
            await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/users/${id}/approve`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            fetchUsers();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="w-full max-w-6xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-cyan-400" />
                <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Admin Dashboard</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="flex items-center gap-2 mb-4 text-xl font-semibold border-b border-white/10 pb-2">
                            <Users className="w-5 h-5 text-purple-400" /> User Approvals
                        </div>
                        {users.length === 0 ? (
                            <p className="text-gray-400 text-sm">No users pending or found.</p>
                        ) : (
                            <div className="space-y-3">
                                {users.map(u => (
                                    <motion.div key={u._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                                        <div>
                                            <span className="block font-medium">{u.username}</span>
                                            <span className="text-xs text-gray-400">Status: {u.isApproved ? <span className="text-green-400">Approved</span> : <span className="text-yellow-400">Pending</span>}</span>
                                        </div>
                                        {!u.isApproved && (
                                            <button onClick={() => approveUser(u._id)} className="bg-purple-500 hover:bg-purple-600 text-xs px-3 py-1 rounded-md transition shadow-lg shadow-purple-500/20">
                                                Approve
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2">
                    {/* Admin also sees the single device */}
                    <DeviceControl deviceId="device-001" />
                </div>
            </div>
        </div>
    );
}
