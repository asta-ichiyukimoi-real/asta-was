const jid = require("./jid");

module.exports = {
    config: {
        name: 'profile',
        aliases: ['pfp'],
        version: '1.0.0',
        description: 'get user profile',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {

        const pfp = await sock.profilePictureUrl(jid, 'image')
        await sock.sendMessage(msg.key.remoteJid,
        { 
            image: { url : pfp },
            text: `name: ${jid}`
        }, 
        { quoted: msg });
    }
};
