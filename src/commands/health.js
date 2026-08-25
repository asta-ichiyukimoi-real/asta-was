const health = require('../services/health');
const config = require('../../config');
const { sendStyledMessage } = require('../utils/messageStyle');

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
        const handler = global.configCommandHandler;
        const prefix = handler?.getPrefix?.() || config.prefix;
        const port = handler?.getDashboardPort?.() || config.dashboardPort || 3030;
        const ownerCount = handler?.getOwnerIds?.().length || (config.owner ? 1 : 0);
        const adminCount = handler?.getAdminIds?.().length || (config.admins || []).length;
        const text = `*Bot Health*

Status: ${h.status || 'unknown'}
Uptime: ${h.uptimeSeconds || 0}s
Memory: ${h.memoryMb || 0}MB
Heap: ${h.heapMb || 0}MB
Commands Run: ${h.commandsRun || 0}
Loaded Commands: ${h.commandEntries || global.commandHandler?.commands?.size || 0}
Pending Reminders: ${snapshot.pendingReminders}
Queue Size: ${snapshot.queueSize || 0}
Prefix: ${prefix}
Owners: ${ownerCount}
Admins: ${adminCount}
Reconnects: ${h.reconnects || 0}
Last API Error: ${h.lastApiError || 'none'}
Last Error: ${h.lastError || 'none'}

Dashboard: https://asta-was.onrender.com/`;

        await sendStyledMessage(sock, msg.key.remoteJid, text, {
            quoted: msg,
            commandName: 'health'
        });
    }
};
