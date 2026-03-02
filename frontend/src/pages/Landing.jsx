import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cpu, Zap, Wifi, Shield, Code2, MonitorPlay, Smartphone, Globe } from 'lucide-react';
import { useContext } from 'react';
import { ThemeContext } from '../App';

export default function Landing() {
    const { dark } = useContext(ThemeContext);

    const features = [
        { icon: <Zap className="w-6 h-6 text-yellow-400" />, title: 'Real-Time Control', desc: 'Instantly control your ESP32 devices globally via WebSockets with ultra-low latency.' },
        { icon: <Code2 className="w-6 h-6 text-blue-400" />, title: 'Auto CodeGen', desc: 'Configure pins and generate the exact Arduino code needed for your hardware instantly.' },
        { icon: <MonitorPlay className="w-6 h-6 text-purple-400" />, title: 'Web Serial Flash', desc: 'Compile in the cloud and flash your ESP32 directly from your browser over USB.' },
        { icon: <Wifi className="w-6 h-6 text-green-400" />, title: 'Hybrid Connectivity', desc: 'Seamlessly switch between WiFi Cloud mode and Bluetooth Serial local mode.' },
        { icon: <Shield className="w-6 h-6 text-red-400" />, title: 'Secure Access', desc: 'JWT-based authentication ensures only you and your admins can control your hardware.' },
        { icon: <Smartphone className="w-6 h-6 text-pink-400" />, title: 'Mobile Optimized', desc: 'A fully responsive dashboard that looks and works beautifully on any device.' },
    ];

    return (
        <div className="flex flex-col min-h-[calc(100vh-73px)] relative overflow-hidden">
            {/* Background Effects */}
            <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[100px] pointer-events-none ${dark ? 'bg-orange-600/10' : 'bg-orange-300/20'}`}></div>
            <div className={`absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[120px] pointer-events-none ${dark ? 'bg-red-600/10' : 'bg-red-300/20'}`}></div>

            <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 z-10 py-20 text-center">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <Cpu className="w-12 h-12 sm:w-16 sm:h-16 text-orange-500 drop-shadow-[0_0_15px_#f97316cc]" />
                    </div>

                    <h1 className="text-5xl sm:text-7xl font-black tracking-tight mb-6">
                        The Ultimate <br className="sm:hidden" />
                        <span className="bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 bg-clip-text text-transparent">
                            IoT Platform
                        </span>
                    </h1>

                    <p className={`text-lg sm:text-2xl mb-12 max-w-2xl mx-auto leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Connect, configure, cloud-compile, and control your ESP32 hardware directly from the web. Zero setup required.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/register"
                            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold text-lg hover:shadow-[0_0_30px_#f9731666] hover:scale-105 transition-all">
                            Get Started Free
                        </Link>
                        <Link to="/login"
                            className={`w-full sm:w-auto px-8 py-4 rounded-2xl border font-bold text-lg hover:scale-105 transition-all ${dark ? 'border-[#333] text-gray-300 hover:border-orange-500 hover:text-white bg-[#111]' : 'border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-600 bg-white'}`}>
                            Log In
                        </Link>
                    </div>
                </motion.div>

                {/* Features Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-32 max-w-6xl mx-auto w-full text-left">
                    {features.map((f, i) => (
                        <div key={i} className={`p-8 rounded-3xl border transition-all hover:-translate-y-2 hover:shadow-2xl ${dark ? 'bg-[#0A0A0A] border-[#1a1a1a] hover:border-[#333]' : 'bg-white border-gray-100 hover:border-orange-200'}`}>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${dark ? 'bg-[#111] border border-[#222]' : 'bg-gray-50 border border-gray-100'}`}>
                                {f.icon}
                            </div>
                            <h3 className={`text-xl font-bold mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>{f.title}</h3>
                            <p className={`leading-relaxed ${dark ? 'text-[#888]' : 'text-gray-500'}`}>{f.desc}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Live Demo Metric */}
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 1 }}
                    className="mt-32 max-w-4xl mx-auto text-center">
                    <Globe className={`w-12 h-12 mx-auto mb-6 opacity-50 ${dark ? 'text-gray-600' : 'text-gray-400'}`} />
                    <p className={`font-mono text-sm tracking-widest uppercase ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Powered by Hugging Face & Vercel
                    </p>
                </motion.div>
            </main>

            {/* Footer */}
            <footer className={`mt-auto py-8 border-t text-center ${dark ? 'border-[#222] bg-[#050505]' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`font-mono text-sm ${dark ? 'text-[#666]' : 'text-gray-500'}`}>
                    All rights reserved Adilitix Robotics {new Date().getFullYear()}
                </p>
            </footer>
        </div>
    );
}
