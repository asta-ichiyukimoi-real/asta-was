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
            await sock.sendMessage(chatId, { text: 'Please provide the custom command name to remove.\nUse: !delcmd <name>' }, { quoted: msg });
            return;
        }

        if (!state.getCustomCommand(chatId, name)) {
            await sock.sendMessage(chatId, { text: `I could not find a custom command named !${name} in this chat.` }, { quoted: msg });
            return;
        }

        state.removeCustomCommand(chatId, name);
        await sock.sendMessage(chatId, { text: `The custom command !${name} has been removed.` }, { quoted: msg });
    }
};
