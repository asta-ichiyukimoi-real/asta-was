const config = require('../../config');
const { chooseReply } = require('../utils/replyCopy');

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
        const sender = msg.pushName || 'there';
        const greeting = chooseReply([
            `Hello, ${sender}! I am here and ready to help whenever you need me.`,
            `Hi, ${sender}. It is good to hear from you. Let me know what I can help with.`,
            `A warm hello to you, ${sender}! You can get started with ${config.prefix}help.`
        ]);
        const reply = `${greeting}\n\n*Explore:* ${config.prefix}help`;

        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};

