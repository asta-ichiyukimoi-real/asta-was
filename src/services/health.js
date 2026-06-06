const os = require('os');
const state = require('../utils/stateManager');
const commandQueue = require('../utils/commandQueue');

let intervalStarted = false;

function startHealthMonitor(commandHandler) {
    if (intervalStarted) return;
    intervalStarted = true;

    state.updateHealth({
        status: 'starting',
        startedAt: new Date().toISOString(),
        pid: process.pid,
        node: process.version
    });

    setInterval(() => {
        const memory = process.memoryUsage();
        state.updateHealth({
            uptimeSeconds: Math.floor(process.uptime()),
            memoryMb: Math.round(memory.rss / 1024 / 1024),
            heapMb: Math.round(memory.heapUsed / 1024 / 1024),
            loadAverage: os.loadavg()[0],
            commandEntries: commandHandler?.commands?.size || 0
        });
    }, 60 * 1000);
}

function getSnapshot() {
    const snapshot = state.getState();
    return {
        health: snapshot.health,
        usage: snapshot.usage,
        commands: Object.keys(snapshot.usage.commands || {}).length,
        customCommandChats: Object.keys(snapshot.customCommands.chats || {}).length,
        moderationGroups: Object.keys(snapshot.moderation.groups || {}).length,
        pendingReminders: Object.values(snapshot.reminders.items || {}).filter(item => !item.sent).length,
        queueSize: commandQueue.size(),
        recentLogs: snapshot.logs.recent || []
    };
}

module.exports = {
    startHealthMonitor,
    getSnapshot
};
