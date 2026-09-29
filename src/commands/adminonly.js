const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'adminonly',
        version: '1.0.0',
        description: 'Restrict bot usage globally to the bot owner and configured admins',
        usage: 'adminonly <on|off|status>',
        examples: ['adminonly on', 'adminonly off'],
        permissions: 1,
        cooldown: 0,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || chatId;
        const configHandler = global.configCommandHandler;

        if (!configHandler?.isOwner(sender, msg) && !configHandler?.isAdmin(sender)) {
            await sock.sendMessage(chatId, {
                text: 'Only the bot owner or configured bot admins can change admin-only mode.'
            }, { quoted: msg });
            return;
        }

        const action = String(args[0] || 'status').toLowerCase();
        if (action === 'on' || action === 'off') {
            const enabled = action === 'on';
            state.setAdminOnlyEnabled(enabled);
            await sock.sendMessage(chatId, {
                text: enabled
                    ? 'Admin-only mode is on globally. Only the bot owner and configured bot admins can use the bot.'
                    : 'Admin-only mode is off globally. Everyone can use the bot, subject to other active restrictions.'
            }, { quoted: msg });
            return;
        }

        if (action === 'status') {
            await sock.sendMessage(chatId, {
                text: `Global admin-only mode is ${state.isAdminOnlyEnabled() ? 'on' : 'off'}.`
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatId, {
            text: 'Use: .adminonly <on|off|status>'
        }, { quoted: msg });
    }
};
