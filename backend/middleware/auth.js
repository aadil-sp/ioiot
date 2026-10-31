const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Never fall back to a guessable secret: without JWT_SECRET, use a random one
// (logins reset on every restart, but tokens can't be forged).
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('WARNING: JWT_SECRET is not set — using a random secret. Users will be logged out on every restart.');
    return crypto.randomBytes(48).toString('hex');
})();

// Record when each user was last active, at most once every 5 minutes per user
const lastSeenWrites = new Map();
const touchLastSeen = (userId) => {
    if (!userId) return;
    const now = Date.now();
    if (now - (lastSeenWrites.get(userId) || 0) < 5 * 60 * 1000) return;
    lastSeenWrites.set(userId, now);
    require('../models/User').updateOne({ _id: userId }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
};

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).send({ error: 'Please authenticate.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        touchLastSeen(decoded.id);
        next();
    } catch (e) {
        res.status(401).send({ error: 'Please authenticate.' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Admin access required.' });
    }
    next();
};

module.exports = { authenticate, requireAdmin, JWT_SECRET };
