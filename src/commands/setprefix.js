const config = require('../../config');
const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'setprefix',
        aliases: ['groupprefix'],
        version: '1.0.0',
        description: 'Sets a custom prefix for this chat',
        usage: 'setprefix <prefix|reset>',
        examples: ['setprefix .', 'setprefix reset'],
        permissions: 1,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const next = args[0];

        if (!next) {
            const current = state.getChatPrefix(chatId, config.prefix);
            await sock.sendMessage(chatId, { text: `Current prefix here: ${current}` }, { quoted: msg });
            return;
        }

        if (next.toLowerCase() === 'reset') {
            state.setChatSettings(chatId, { prefix: null });
            await sock.sendMessage(chatId, { text: `Prefix reset to global default: ${config.prefix}` }, { quoted: msg });
            return;
        }

        if (next.length > 3) {
            await sock.sendMessage(chatId, { text: 'Please keep the prefix 1-3 characters.' }, { quoted: msg });
            return;
        }

        state.setChatSettings(chatId, { prefix: next });
        await sock.sendMessage(chatId, { text: `Prefix for this chat is now: ${next}` }, { quoted: msg });
    }
};
