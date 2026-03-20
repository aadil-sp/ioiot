const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PrintJob = require('../models/PrintJob');
const { authenticate, requireAdmin } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Configure Multer for File Uploads ────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ─── Upload File Endpoint ───────────────────────────────────────────────────
router.post('/upload', upload.single('document'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ fileUrl, fileName: req.file.originalname });
});

// ─── Get All Shops (Public) ──────────────────────────────────────────────────
router.get('/shops', async (req, res) => {
    try {
        const shops = await User.find({ role: 'shopkeeper', isApproved: true }, 'shopName username');
        res.json(shops);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shops' });
    }
});

// ─── Guest Upload Print Job (Public) ─────────────────────────────────────────
router.post('/jobs/guest', async (req, res) => {
    try {
        const { shopId, fileName, fileUrl, options, price } = req.body;
        
        // Generate a random 6-character claim code
        const guestCode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const job = new PrintJob({
            shopId,
            guestCode,
            fileName,
            fileUrl,
            options,
            price: price || 0
        });

        await job.save();
        res.status(201).json({ 
            message: 'Job submitted successfully', 
            guestCode, 
            jobId: job._id 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});

// ─── Guest Status Check (Public) ─────────────────────────────────────────────
router.get('/jobs/status/:guestCode', async (req, res) => {
    try {
        const jobs = await PrintJob.find({ guestCode: req.params.guestCode.toUpperCase() })
            .populate('shopId', 'shopName');
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

// ─── Authenticated Upload Print Job (User) ───────────────────────────────────
router.post('/jobs', authenticate, async (req, res) => {
    try {
        const { shopId, fileName, fileUrl, options, price } = req.body;

        const user = await User.findById(req.user.id);
        const jobPrice = price || 0;

        if (user.role === 'user') {
            if (user.walletBalance < jobPrice) {
                return res.status(400).json({ error: 'Insufficient wallet balance.' });
            }
            user.walletBalance -= jobPrice;
            await user.save();
        }

        const job = new PrintJob({
            userId: req.user.id,
            shopId,
            fileName,
            fileUrl,
            options,
            price: jobPrice
        });

        await job.save();
        res.status(201).json({ message: 'Job submitted successfully', job, newBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create job' });
    }
});

// ─── Get User's Jobs (User) ──────────────────────────────────────────────────
router.get('/my-jobs', authenticate, async (req, res) => {
    try {
        const jobs = await PrintJob.find({ userId: req.user.id }).populate('shopId', 'shopName');
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// ─── Shopkeeper: Get Shop Jobs ───────────────────────────────────────────────
router.get('/shop-jobs', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'shopkeeper') return res.status(403).json({ error: 'Not a shopkeeper' });

        const jobs = await PrintJob.find({ shopId: user._id }).sort({ createdAt: -1 }).populate('userId', 'username');
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shop jobs' });
    }
});

// ─── Shopkeeper: Update Job Status (e.g., pending -> approved -> completed) ──
router.put('/jobs/:id/status', authenticate, async (req, res) => {
    try {
        const { status } = req.body;
        const job = await PrintJob.findById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const user = await User.findById(req.user.id);
        if (user.role !== 'admin' && job.shopId.toString() !== user._id.toString()) {
            return res.status(403).json({ error: 'Unauthorized to update this job' });
        }

        job.status = status;
        await job.save();
        res.json(job);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update job status' });
    }
});

// ─── Admin: Get All Jobs ─────────────────────────────────────────────────────
router.get('/admin/jobs', authenticate, requireAdmin, async (req, res) => {
    try {
        const jobs = await PrintJob.find()
            .populate('shopId', 'shopName username')
            .populate('userId', 'username')
            .sort({ createdAt: -1 });
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all jobs' });
    }
});

// ─── Admin: Top Up Wallet (All standard users) ───────────────────────────────────────────────────
router.post('/admin/topup', authenticate, requireAdmin, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

        // Grant to standard users
        await User.updateMany({ role: 'user' }, { $inc: { walletBalance: amount } });
        res.json({ message: `Topped up Rs. ${amount} for all users successfully` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to topup' });
    }
});

// ─── Admin: Top Up Wallet (Single user) ───────────────────────────────────────────────────
router.post('/admin/topup/:userId', authenticate, requireAdmin, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.walletBalance += amount;
        await user.save();
        res.json({ message: `Topped up Rs. ${amount} for ${user.username}`, balance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ error: 'Failed to topup single user' });
    }
});

// ─── Delete a job ────────────────────────────────────────────────────────────
router.delete('/jobs/:id', authenticate, async (req, res) => {
    try {
        const job = await PrintJob.findById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const user = await User.findById(req.user.id);
        
        // Admin can delete any, user can delete own, shopkeeper can delete own shop's jobs
        let authorized = false;
        if (user.role === 'admin') authorized = true;
        else if (job.userId && job.userId.toString() === user._id.toString()) authorized = true;
        else if (job.shopId && job.shopId.toString() === user._id.toString()) authorized = true;

        if (!authorized) return res.status(403).json({ error: 'Unauthorized to delete this job' });

        await job.deleteOne();
        res.json({ message: 'Job deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

module.exports = router;
