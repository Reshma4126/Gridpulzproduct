const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('Users table ready.');
        }
    });
});

module.exports = db;
