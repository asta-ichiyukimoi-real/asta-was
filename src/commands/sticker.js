const sharp = require('sharp');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function findImageMessage(msg) {
    const directImage = msg.message?.imageMessage;
    if (directImage) return directImage;

    return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || null;
}

module.exports = {
    config: {
        name: 'sticker',
        aliases: ['s', 'stiker'],
        version: '1.0.0',
        description: 'Turns an image into a WhatsApp sticker',
        usage: 'sticker',
        examples: ['sticker', 's'],
        permissions: 0,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const imageMessage = findImageMessage(msg);

        if (!imageMessage) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send an image with !sticker as the caption, or reply to an image with !sticker.'
            }, { quoted: msg });
            return;
        }

        try {
            const stream = await downloadContentFromMessage(imageMessage, 'image');
            const imageBuffer = await streamToBuffer(stream);
            const stickerBuffer = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp()
                .toBuffer();

            await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer }, { quoted: msg });
        } catch (error) {
            console.error('Sticker command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'I could not create a sticker from that image.'
            }, { quoted: msg });
        }
    }
};
