const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/bot.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

function initDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }

            // Enable foreign keys and WAL mode
            db.configure('busyTimeout', 5000);
            
            db.serialize(() => {
                db.run('PRAGMA foreign_keys = ON');
                db.run('PRAGMA journal_mode = WAL');
                createTables();
                console.log('✅ Database initialized at', DB_PATH);
                resolve(db);
            });
        });
    });
}

function createTables() {
    // Command stats table
    db.exec(`
        CREATE TABLE IF NOT EXISTS command_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_name TEXT NOT NULL,
            chat_id TEXT NOT NULL,
            user_id TEXT,
            execution_time INTEGER,
            status TEXT DEFAULT 'success',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(command_name, chat_id, created_at)
        )
    `);

    // User stats table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            total_messages INTEGER DEFAULT 0,
            total_commands INTEGER DEFAULT 0,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            warnings INTEGER DEFAULT 0
        )
    `);

    // Chat stats table
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL UNIQUE,
            chat_name TEXT,
            total_messages INTEGER DEFAULT 0,
            total_commands INTEGER DEFAULT 0,
            members_count INTEGER DEFAULT 0,
            prefix TEXT DEFAULT '.',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Bot performance table
    db.exec(`
        CREATE TABLE IF NOT EXISTS bot_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_usage INTEGER,
            cpu_usage REAL,
            response_time INTEGER,
            uptime_seconds INTEGER,
            total_commands_executed INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Daily stats table (for charts)
    db.exec(`
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stat_date DATE NOT NULL UNIQUE,
            total_commands INTEGER DEFAULT 0,
            unique_users INTEGER DEFAULT 0,
            unique_chats INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            average_response_time INTEGER DEFAULT 0
        )
    `);

    // Create indexes for faster queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_command_stats_date ON command_stats(created_at);
        CREATE INDEX IF NOT EXISTS idx_command_stats_name ON command_stats(command_name);
        CREATE INDEX IF NOT EXISTS idx_user_stats_id ON user_stats(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_stats_id ON chat_stats(chat_id);
    `);
}

function getDatabase() {
    if (!db) {
        initDatabase();
    }
    return db;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

// Export database functions
module.exports = {
    initDatabase,
    getDatabase,
    closeDatabase
};
