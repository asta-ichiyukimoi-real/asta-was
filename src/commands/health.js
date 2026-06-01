const health = require('../services/health');
const config = require('../../config');

module.exports = {
    config: {
        name: 'health',
        aliases: ['status'],
        version: '1.0.0',
        description: 'Shows bot health and runtime stats',
        usage: 'health',
        examples: ['health'],
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const snapshot = health.getSnapshot();
        const h = snapshot.health;
        const text = `*Bot Health*

Status: ${h.status || 'unknown'}
Uptime: ${h.uptimeSeconds || 0}s
Memory: ${h.memoryMb || 0}MB
Commands Run: ${h.commandsRun || 0}
Pending Reminders: ${snapshot.pendingReminders}
Last Error: ${h.lastError || 'none'}

Dashboard: http://127.0.0.1:${config.dashboardPort || 3030}`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
