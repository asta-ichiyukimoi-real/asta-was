const config = require('../../config');

module.exports = {
    config: {
        name: 'hello',
        aliases: ['hi', 'hey'],
        version: '1.0.0',
        description: 'Says hello to the user',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const sender = msg.pushName || 'friend';
        const reply = `👋 Hey ${sender}!

I am your bot assistant, online and ready to help. Send a command to get started.

*Try:* ${config.prefix}help`;

        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};


