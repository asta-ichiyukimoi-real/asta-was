const config = require('../../config');
const health = require('../services/health');
const state = require('../utils/stateManager');
const { sendStyledMessage } = require('../utils/messageStyle');

module.exports = {
    config: {
        name: 'info',
        aliases: ['about'],
        version: '1.1.0',
        description: 'Displays live bot information',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg) => {
        const handler = global.configCommandHandler;
        const snapshot = health.getSnapshot();
        const chatId = msg.key.remoteJid;
        const prefix = state.getChatPrefix(chatId, handler?.getPrefix?.() || config.prefix);
        const dashboardPort = handler?.getDashboardPort?.() || config.dashboardPort || 3030;
        const owners = handler?.getOwnerIds?.() || [config.owner].filter(Boolean);
        const admins = handler?.getAdminIds?.() || config.admins || [];
        const commandEntries = global.commandHandler?.commands?.size || snapshot.health.commandEntries || 0;
        const uniqueCommands = global.commandHandler?.commands
            ? new Set(global.commandHandler.commands.values()).size
            : 0;

        const infoText = [
            '*Bot Info*',
            `Name: ${config.bot?.name || config.botName}`,
            `Version: ${config.bot?.version || config.version}`,
            `Description: ${config.bot?.description || 'WhatsApp bot'}`,
            `Prefix here: ${prefix}`,
            `Timezone: ${handler?.get?.('bot.timezone', config.bot?.timezone) || 'unknown'}`,
            `Status: ${snapshot.health.status || 'unknown'}`,
            `Uptime: ${snapshot.health.uptimeSeconds || Math.floor(process.uptime())}s`,
            `Loaded commands: ${uniqueCommands || commandEntries}`,
            `Command entries: ${commandEntries}`,
            `Owners: ${owners.length}`,
            `Admins: ${admins.length}`,
            `Dashboard: ${handler?.get?.('dashboard.enabled', config.dashboard?.enabled) === false ? 'off' : `http://127.0.0.1:${dashboardPort}`}`,
            `Developer shell: ${handler?.get?.('developer.shellEnabled', config.developer?.shellEnabled) ? 'on' : 'off'}`,
            `Developer eval: ${handler?.get?.('developer.evalEnabled', config.developer?.evalEnabled) ? 'on' : 'off'}`
        ].join('\n');

        await sendStyledMessage(sock, msg.key.remoteJid, infoText, {
            quoted: msg,
            commandName: 'info'
        });
    }
};
