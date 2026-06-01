const config = require('../../config');

module.exports = {
    config: {
        name: 'info',
        aliases: ['about'],
        version: '1.0.0',
        description: 'Displays bot information',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const infoText = `*🤖 Bot Info*

• *Name:* ${config.botName}
• *Version:* ${config.version}
• *Prefix:* ${config.prefix}
• *Owner:* ${config.owner}

Built to keep your chats sharp and snappy. ✨`;

        await sock.sendMessage(msg.key.remoteJid, { text: infoText }, { quoted: msg });
    }
};
