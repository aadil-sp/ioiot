import { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function UserDashboard() {
  const [jobs, setJobs] = useState([]);
  const navigate = useNavigate();

  const fetchJobs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/inkqueue/my-jobs`);
      setJobs(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    try {
      await axios.delete(`${API_BASE}/inkqueue/jobs/${id}`);
      fetchJobs();
    } catch (err) {
      alert('Failed to delete job');
    }
  };

  return (
    <div className="container animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText color="var(--accent-primary)" /> My Print Jobs
        </h2>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          <Plus size={18} /> New Print Job
        </button>
      </div>

      <div className="grid-cards">
        {jobs.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
            <FileText size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ margin: 0 }}>You don't have any print jobs yet.</p>
          </div>
        ) : jobs.map(job => (
          <div key={job._id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', wordBreak: 'break-all' }}>{job.fileName}</h3>
              <span className={`badge badge-${job.status}`}>{job.status}</span>
            </div>
            
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <p style={{ margin: 0 }}><strong>Shop:</strong> {job.shopId?.shopName}</p>
              <p style={{ margin: 0 }}><strong>Date:</strong> {new Date(job.createdAt).toLocaleString()}</p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {job.options?.color && <span className="badge badge-printing">Color</span>}
              {!job.options?.color && <span className="badge badge-pending">B&W</span>}
              {job.options?.doubleSided && <span className="badge badge-approved">Double-sided</span>}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={job.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1 }}>View PDF</a>
              {job.status === 'pending' && (
                <button 
                  className="btn btn-danger" 
                  onClick={() => handleDelete(job._id)}
                  style={{ padding: '0.5rem' }}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
