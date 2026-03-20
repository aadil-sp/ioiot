import { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Printer, Search, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function Landing() {
    const [shops, setShops] = useState([]);
    const [selectedShop, setSelectedShop] = useState(null);
    const [file, setFile] = useState(null);
    const [options, setOptions] = useState({ color: false, copies: 1, doubleSided: false, pages: 1 });
    const [price, setPrice] = useState(0);
    const [loading, setLoading] = useState(false);
    
    // For guest status check
    const [guestCode, setGuestCode] = useState('');
    const [statusResult, setStatusResult] = useState(null);

    const navigate = useNavigate();
    const token = localStorage.getItem('inkqueue_token');

    useEffect(() => {
        axios.get(`${API_BASE}/inkqueue/shops`)
            .then(res => setShops(res.data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        // Simple Pricing Logic: B&W = Rs. 2/page, Color = Rs. 10/page.
        const baseCost = options.color ? 10 : 2;
        let total = baseCost * options.pages * options.copies;
        if (options.doubleSided) total = total * 0.9; // 10% discount for double-sided
        setPrice(Math.round(total));
    }, [options]);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedShop || !file) {
            alert("Please select a shop and a file to print.");
            return;
        }
        setLoading(true);
        try {
            // First upload the file to get URL
            const formData = new FormData();
            formData.append('document', file);
            
            const uploadRes = await axios.post(`${API_BASE}/inkqueue/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const { fileUrl, fileName } = uploadRes.data;

            // Submit the job with the returned URL and price
            const payload = { shopId: selectedShop, fileUrl, fileName, options, price };
            if (token) {
                // Authenticated user
                const res = await axios.post(`${API_BASE}/inkqueue/jobs`, payload);
                if (res.data.newBalance !== undefined) {
                    localStorage.setItem('inkqueue_wallet_balance', res.data.newBalance);
                }
                alert(`Job submitted successfully! Rs. ${price} deducted.`);
                // Force a page turn refresh to update navbar
                window.location.href = '/dashboard';
            } else {
                // Guest user
                const res = await axios.post(`${API_BASE}/inkqueue/jobs/guest`, payload);
                alert(`Job submitted! Save your Guest Tracking Code: ${res.data.guestCode}`);
                setGuestCode(res.data.guestCode);
                setStatusResult(null); // Clear previous status
                setFile(null);
            }
        } catch (error) {
            alert("Error submitting job: " + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async (e) => {
        e.preventDefault();
        if (!guestCode) return;
        try {
            const res = await axios.get(`${API_BASE}/inkqueue/jobs/status/${guestCode}`);
            if (res.data.length > 0) {
                setStatusResult(res.data[0]);
            } else {
                alert("No job found with that code.");
            }
        } catch (error) {
            alert("Error checking status.");
        }
    };

    return (
        <div className="container animate-fade">
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '3.5rem', marginBottom: '1rem' }}>
                    <Printer size={56} color="var(--accent-primary)" style={{ filter: 'drop-shadow(0 0 15px var(--accent-glow))' }}/>
                    <span style={{ background: 'linear-gradient(135deg, #fff, #58a6ff)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                        InkQueue
                    </span>
                </h1>
                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>The fastest way to queue prints directly to any shop near you.</p>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Upload Section */}
                <div className="card glass-card" style={{ flex: '1 1 400px', maxWidth: '600px' }}>
                    <h2><Upload size={24} style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--accent-primary)' }}/> Create Print Job</h2>
                    <form onSubmit={handleUpload}>
                        <div className="input-group">
                            <label className="input-label">Select Shop</label>
                            <select 
                                className="input-field" 
                                value={selectedShop || ''} 
                                onChange={(e) => setSelectedShop(e.target.value)}
                                required
                            >
                                <option value="" disabled>Choose a print shop...</option>
                                {shops.map(shop => (
                                    <option key={shop._id} value={shop._id}>{shop.shopName || shop.username}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Select Document (PDF/Doc/Image)</label>
                            <input 
                                className="input-field" 
                                type="file" 
                                accept=".pdf,.doc,.docx,.jpg,.png"
                                onChange={(e) => setFile(e.target.files[0])}
                                required
                            />
                        </div>
                        
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Settings size={18} /> Print Options</h4>
                            
                            <div className="input-group" style={{ marginBottom: '1rem' }}>
                                <label className="input-label">Total Document Pages</label>
                                <input type="number" min="1" value={options.pages} onChange={e => setOptions({...options, pages: e.target.value})} className="input-field" style={{ maxWidth: '120px' }}/>
                            </div>

                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', alignItems: 'center' }}>
                                    <input type="checkbox" checked={options.color} onChange={e => setOptions({...options, color: e.target.checked})} style={{ width: '18px', height: '18px' }}/>
                                    Color Print (Rs. 10/pg)
                                </label>
                                <label style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', alignItems: 'center' }}>
                                    <input type="checkbox" checked={options.doubleSided} onChange={e => setOptions({...options, doubleSided: e.target.checked})} style={{ width: '18px', height: '18px' }}/>
                                    Double Sided (-10%)
                                </label>
                                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input type="number" min="1" max="100" value={options.copies} onChange={e => setOptions({...options, copies: e.target.value})} style={{ width: '60px', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-elevated)', color: 'white' }}/>
                                    Copies
                                </label>
                            </div>
                        </div>

                        {/* Invoice Summary */}
                        <div style={{ padding: '1rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-md)', background: 'linear-gradient(to right, rgba(88,166,255,0.1), transparent)', borderLeft: '4px solid var(--accent-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0 }}>Estimated Cost</h4>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Deducted from Wallet</span>
                            </div>
                            <h2 style={{ margin: 0, color: 'var(--accent-primary)' }}>Rs. {price}</h2>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} disabled={loading}>
                            {loading ? 'Submitting & Processing...' : 'Queue Print Job'}
                        </button>
                    </form>
                </div>

                {/* Track Section */}
                <div className="card glass-card" style={{ flex: '1 1 300px', maxWidth: '400px', height: 'fit-content' }}>
                    <h2><Search size={24} style={{ marginRight: '0.5rem', verticalAlign: 'middle', color: 'var(--success)' }}/> Track Guest Print</h2>
                    <p>No account? Track your print using the 6-character claim code.</p>
                    <form onSubmit={handleCheckStatus}>
                        <div className="input-group">
                            <input 
                                className="input-field" 
                                type="text" 
                                placeholder="Enter code (e.g. A1B2C3)" 
                                maxLength="6"
                                value={guestCode}
                                onChange={(e) => setGuestCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                        <button className="btn btn-secondary" style={{ width: '100%' }}>Check Status</button>
                    </form>

                    {statusResult && (
                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                            <h4>Status Result</h4>
                            <p><strong>Shop:</strong> {statusResult.shopId?.shopName || statusResult.shopId?.username}</p>
                            <p><strong>File:</strong> {statusResult.fileName}</p>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                <span className="badge badge-printing">Rs. {statusResult.price || 0}</span>
                            </div>
                            <p>
                                <strong>Status: </strong> 
                                <span className={`badge badge-${statusResult.status}`}>{statusResult.status}</span>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
