module.exports = {
    config: {
        name: 'ping',
        aliases: ['p'],
        version: '1.0.0',
        description: 'Replies with pong to check bot responsiveness',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const reply = `🏓 *Pong!*

I am online and ready to roll.

*Status:* Active ✅
*Response:* Fast & chill`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};
