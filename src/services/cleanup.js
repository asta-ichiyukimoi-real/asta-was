const statsManager = require('../models/stats');

let cleanupIntervalId = null;

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
    performCleanup
};
