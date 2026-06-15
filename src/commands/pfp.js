const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    config: {
        name: 'profile',
        aliases: ['pfp'],
        version: '1.0.0',
        description: 'Get user profile picture',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        try {
            // Get target JID: mentioned user > replied user > sender
            let targetJid = msg.key.participant || msg.key.remoteJid;

            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentionedJid && mentionedJid.length > 0) {
                targetJid = mentionedJid[0];
            }

            const quotedJid = msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage && quotedJid) {
                targetJid = quotedJid;
            }

            // Get profile picture URL
            const pfp = await sock.profilePictureUrl(targetJid, 'image').catch(() => null);

            if (!pfp) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: 'This user has no profile picture or it is hidden.'
                }, { quoted: msg });
            }

            // Get name/number for caption
            const number = targetJid.split('@')[0];
            const name = msg.pushName || number;

            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: pfp },
                caption: `*Profile*\nName: ${name}\nNumber: ${number}`
            }, { quoted: msg });

        } catch (error) {
            console.error('Profile command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Error: ${error.message}`
            }, { quoted: msg });
        }
    }
};