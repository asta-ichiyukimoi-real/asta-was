const config = require('../../config');
const state = require('../utils/stateManager');

async function sendPrefix(sock, msg) {
    const chatId = msg.key.remoteJid;
    const globalPrefix = global.configCommandHandler?.getPrefix?.() || config.prefix;
    const chatSettings = state.getChatSettings(chatId);
    const currentPrefix = state.getChatPrefix(chatId, globalPrefix);
    const customPrefix = chatSettings.prefix || null;
    const reply = `*Bot Prefix*

Current prefix here: ${currentPrefix}
Global prefix: ${globalPrefix}
Custom prefix here: ${customPrefix || 'none'}

Use ${currentPrefix} before any command to execute it.

Examples:
${currentPrefix}help
${currentPrefix}menu
${currentPrefix}setprefix !
${currentPrefix}setprefix reset`;

    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'prefix',
        aliases: [],
        version: '1.1.0',
        description: 'Shows the bot prefix',
        usage: 'prefix',
        examples: ['prefix', 'setprefix !', 'setprefix reset'],
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        await sendPrefix(sock, msg);
    },
    onChat: async (sock, msg, text) => {
        await sendPrefix(sock, msg);
    }
};
