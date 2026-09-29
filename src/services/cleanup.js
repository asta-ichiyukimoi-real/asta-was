const statsManager = require('../models/stats');
const fs = require('fs');
const path = require('path');

let cleanupIntervalId = null;
let authCleanupIntervalId = null;

const AUTH_TEMP_FILE_PATTERN = /\.(?:tmp|temp)$/i;

function cleanupAuthTemporaryFiles(authDir, maxAgeMs = 30 * 60 * 1000) {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
        throw new Error('Auth temporary-file age must be a positive number of milliseconds.');
    }

    const authPath = path.resolve(process.cwd(), authDir || './auth_info_baileys');
    if (!fs.existsSync(authPath)) return [];

    const directoryStat = fs.lstatSync(authPath);
    if (!directoryStat.isDirectory()) {
        throw new Error(`Baileys auth path is not a directory: ${authPath}`);
    }

    const cutoff = Date.now() - maxAgeMs;
    const removed = [];

    for (const entry of fs.readdirSync(authPath, { withFileTypes: true })) {
        if (!entry.isFile() || !AUTH_TEMP_FILE_PATTERN.test(entry.name)) continue;

        const filePath = path.join(authPath, entry.name);
        const fileStat = fs.lstatSync(filePath);
        if (!fileStat.isFile() || fileStat.mtimeMs >= cutoff) continue;

        fs.unlinkSync(filePath);
        removed.push(entry.name);
    }

    return removed;
}

function performAuthFileCleanup(authDir) {
    try {
        const removed = cleanupAuthTemporaryFiles(authDir);
        if (removed.length) {
            console.log(`🧹 Removed ${removed.length} stale Baileys auth temporary file(s): ${removed.join(', ')}`);
        }
    } catch (error) {
        console.error('Baileys auth temporary-file cleanup error:', error.message);
    }
}

function startAuthFileCleanupService(authDir, intervalMinutes = 30) {
    if (authCleanupIntervalId) return;
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
        throw new Error('Auth cleanup interval must be a positive number of minutes.');
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    performAuthFileCleanup(authDir);
    authCleanupIntervalId = setInterval(() => performAuthFileCleanup(authDir), intervalMs);
    console.log(`✅ Baileys auth temporary-file cleanup started (runs every ${intervalMinutes} minutes)`);
}

function stopAuthFileCleanupService() {
    if (!authCleanupIntervalId) return;
    clearInterval(authCleanupIntervalId);
    authCleanupIntervalId = null;
    console.log('Baileys auth temporary-file cleanup stopped');
}

function startCleanupService(intervalHours = 24) {
    if (cleanupIntervalId) return;

    // Run cleanup every N hours
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    // Run immediately on startup
    performCleanup();

    cleanupIntervalId = setInterval(() => {
        performCleanup();
    }, intervalMs);

    console.log(`✅ Database cleanup service started (runs every ${intervalHours} hours)`);
}

function performCleanup() {
    try {
        const now = new Date().toISOString();
        
        // Keep last 90 days of data
        statsManager.clearOldData(90);
        
        // Record daily stats
        statsManager.recordDailyStats();
        
        console.log(`🧹 Database cleanup completed at ${now}`);
    } catch (error) {
        console.error('Cleanup service error:', error.message);
    }
}

function stopCleanupService() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
        console.log('Database cleanup service stopped');
    }
}

module.exports = {
    startCleanupService,
    stopCleanupService,
    performCleanup,
    cleanupAuthTemporaryFiles,
    startAuthFileCleanupService,
    stopAuthFileCleanupService
};
