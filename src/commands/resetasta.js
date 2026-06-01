const state = require('../utils/stateManager');
const asta = require('./asta');

module.exports = {
    config: {
        name: 'resetasta',
        aliases: ['clearasta', 'astaclear'],
        version: '1.0.0',
        description: 'Clears your Asta conversation memory',
        permissions: 0,
        cooldown: 3,
        category: 'ai'
    },
    onRun: async (sock, msg, args) => {
        const conversationId = asta.buildConversationId(msg);
        state.resetAstaConversation(conversationId);
        await sock.sendMessage(msg.key.remoteJid, {
            text: 'Asta memory cleared for this chat.'
        }, { quoted: msg });
    }
};
