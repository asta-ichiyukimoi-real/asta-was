const { findMediaMessage, downloadMediaToBuffer } = require('../utils/media');

module.exports = {
    config: {
        name: 'sticker',
        aliases: ['s', 'stick', 'stiker', 'tosticker'],
        version: '1.0.0',
        description: 'Convert an image to a WhatsApp sticker',
        usage: 'sticker <send/reply to image>',
        examples: ['sticker', 's'],
        permissions: 0,
        cooldown: 5,
        category: 'media'
    },

    onRun: async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        const media = findMediaMessage(msg, ['image']);

        if (!media) {
            await sock.sendMessage(chatId, {
                text: 'Send an image with .sticker as the caption, or reply to an image with .sticker.'
            }, { quoted: msg });
            return;
        }

        try {
            await sock.sendMessage(chatId, {
                text: 'Creating sticker...'
            }, { quoted: msg });

            const imageBuffer = await downloadMediaToBuffer(media.message, media.kind);

            await sock.sendMessage(chatId, {
                sticker: imageBuffer
            }, { quoted: msg });
        } catch (error) {
            console.error('Sticker command error:', error);
            await sock.sendMessage(chatId, {
                text: `Could not create sticker:\n${String(error.message || error).slice(0, 1000)}`
            }, { quoted: msg });
        }
    }
};
