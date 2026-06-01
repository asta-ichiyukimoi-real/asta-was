const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'delcmd',
        aliases: ['rmcmd', 'removecmd'],
        version: '1.0.0',
        description: 'Deletes a custom command from this chat',
        usage: 'delcmd <name>',
        examples: ['delcmd rules'],
        permissions: 1,
        cooldown: 2,
        category: 'custom'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const name = args[0]?.toLowerCase();

        if (!name) {
            await sock.sendMessage(chatId, { text: 'Use: !delcmd <name>' }, { quoted: msg });
            return;
        }

        if (!state.getCustomCommand(chatId, name)) {
            await sock.sendMessage(chatId, { text: `No custom command named !${name} exists here.` }, { quoted: msg });
            return;
        }

        state.removeCustomCommand(chatId, name);
        await sock.sendMessage(chatId, { text: `Deleted custom command !${name}.` }, { quoted: msg });
    }
};
