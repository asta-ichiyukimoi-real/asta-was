module.exports = {
    config: {
        name: '',// name of the command
        aliases: [''], //side name of the command
        version: '1.0.0',//version of the 
        description: 'Replies with pong to check bot responsiveness',// discription on the command
        permissions: 0, //
        category: 'general'//category in which the bot is
    },
    onRun: async (sock, msg, args) => {
        const reply = `🏓 *Pong!*

I am online and ready to roll.

*Status:* Active ✅
*Response:* Fast & chill`;
        await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
    }
};

