const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');
console.log('INIT START');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'super-secret-gridpulz-key-change-me-in-production';

app.use(cors());
app.use(express.json());
// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// POST /api/auth/register/operator
app.post('/api/auth/register/operator', async (req, res) => {
    try {
        const { companyName, email, password, location, chargingPoints, totalPower, connectorTypes } = req.body;
        
        if (!companyName || !email || !password || !location || !chargingPoints || !totalPower) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const metadata = JSON.stringify({
            location,
            chargingPoints,
            totalPower,
            connectorTypes
        });

        db.run(
            `INSERT INTO users (role, email, password, name, metadata) VALUES (?, ?, ?, ?, ?)`,
            ['operator', email, hashedPassword, companyName, metadata],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Success, generate token
                const token = jwt.sign({ id: this.lastID, role: 'operator' }, JWT_SECRET, { expiresIn: '24h' });
                res.status(201).json({ message: 'Operator registered successfully', token, role: 'operator' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/register/user
app.post('/api/auth/register/user', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const metadata = JSON.stringify({});

        db.run(
            `INSERT INTO users (role, email, password, name, metadata) VALUES (?, ?, ?, ?, ?)`,
            ['user', email, hashedPassword, fullName, metadata],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Success, generate token
                const token = jwt.sign({ id: this.lastID, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
                res.status(201).json({ message: 'User registered successfully', token, role: 'user' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password, role } = req.body;
        
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Missing email, password, or role' });
        }

        db.get(`SELECT * FROM users WHERE email = ? AND role = ?`, [email, role], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials or wrong role selected' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ message: 'Login successful', token, role: user.role });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// GET /api/user/profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
    db.get(`SELECT id, role, email, name, metadata, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'Database error or user not found' });
        res.json({
            id: user.id,
            role: user.role,
            email: user.email,
            name: user.name,
            metadata: JSON.parse(user.metadata || '{}')
        });
    });
});

// PUT /api/user/profile
app.put('/api/user/profile', authenticateToken, (req, res) => {
    try {
        const metadata = JSON.stringify({
            vehicleType: req.body.vehicleType || null,
            batteryCapacity: req.body.batteryCapacity || null,
            preferredChargingType: req.body.preferredChargingType || null,
            currentCharge: req.body.currentCharge || null,
            currentLocation: req.body.currentLocation || null,
            frequentLocations: req.body.frequentLocations || null,
            preferredChargingTime: req.body.preferredChargingTime || null,
            typicalUsage: req.body.typicalUsage || null
        });

        db.run(`UPDATE users SET metadata = ? WHERE id = ?`, [metadata, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Profile updated successfully' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
});
