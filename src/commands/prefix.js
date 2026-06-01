const config = require('../../config');

async function sendPrefix(sock, msg) {
    const reply = `*Bot Prefix*

Current prefix: ${config.prefix}

Use ${config.prefix} before any command to execute it.

Example: ${config.prefix}help`;

    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'prefix',
        aliases: [],
        version: '1.0.0',
        description: 'Shows the bot prefix',
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
