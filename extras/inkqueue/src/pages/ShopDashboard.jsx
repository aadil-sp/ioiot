import { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Printer, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ShopDashboard() {
  const [jobs, setJobs] = useState([]);
  const navigate = useNavigate();

  const fetchJobs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/inkqueue/shop-jobs`);
      setJobs(res.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    fetchJobs();
    // In a real app we'd use polling or sockets, for now manual fetch is ok
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API_BASE}/inkqueue/jobs/${id}/status`, { status });
      fetchJobs();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  // Simulate Print Dialog
  const handlePrintDevice = (jobCode) => {
    alert(`Sending job to physical printer! (Simulated)\nCode: ${jobCode}`);
    setTimeout(() => {
        alert("Print successful!");
    }, 1500);
  };

  return (
    <div className="container animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Store color="var(--accent-primary)" /> Print Queue
        </h2>
      </div>

      <div className="grid-cards">
        {jobs.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
            <Printer size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ margin: 0 }}>The queue is currently empty.</p>
          </div>
        ) : jobs.map(job => (
          <div key={job._id} className="card" style={{ borderLeft: job.status === 'pending' ? '4px solid var(--warning)' : '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ wordBreak: 'break-all', maxWidth: '70%' }}>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.2rem' }}>{job.fileName}</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {job.guestCode || job.userId?.username}</p>
              </div>
              <span className={`badge badge-${job.status}`}>{job.status}</span>
            </div>
            
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <p style={{ margin: 0 }}><strong>Date:</strong> {new Date(job.createdAt).toLocaleString()}</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <span className="badge badge-printing">Copies: {job.options?.copies || 1}</span>
                {job.options?.color ? <span className="badge badge-pending">Color</span> : <span className="badge badge-approved">B&W</span>}
                {job.options?.doubleSided && <span className="badge badge-completed">Double-sided</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem' }}>
              <a href={job.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">View file</a>
              
              {job.status === 'pending' && (
                <button className="btn btn-primary" onClick={() => updateStatus(job._id, 'approved')} style={{ flex: 1 }}>
                  <CheckCircle size={16} /> Approve
                </button>
              )}

              {job.status === 'approved' && (
                <button className="btn btn-primary" onClick={() => { updateStatus(job._id, 'printing'); handlePrintDevice(job._id); }} style={{ flex: 1 }}>
                  <Printer size={16} /> Print Now
                </button>
              )}

              {job.status === 'printing' && (
                <button className="btn btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => updateStatus(job._id, 'completed')}>
                  <CheckCircle size={16} /> Mark Complete
                </button>
              )}

              {job.status !== 'terminated' && job.status !== 'completed' && (
                <button className="btn btn-danger" onClick={() => updateStatus(job._id, 'terminated')}>
                  <XCircle size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
