const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php';
const REQUEST_TIMEOUT = 120000;

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

    return (
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
        null
    );
}

function extensionFromMime(mime) {
    if (/png/i.test(mime)) return 'png';
    if (/webp/i.test(mime)) return 'webp';
    return 'jpg';
}

async function uploadToCatbox(buffer, mime) {
    const form = new FormData();

    form.append('reqtype', 'fileupload');
    form.append(
        'fileToUpload',
        new Blob([buffer], { type: mime }),
        `pti-${Date.now()}.${extensionFromMime(mime)}`
    );

    const response = await fetch(CATBOX_UPLOAD_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });

    const text = (await response.text()).trim();

    if (!response.ok || !/^https?:\/\//i.test(text)) {
        throw new Error(`Catbox upload failed: ${text}`);
    }

    return text;
}

module.exports = {
    config: {
        name: 'pti',
        aliases: ['anime', 'img2img', 'toon'],
        version: '1.0.0',
        description: 'Transform images with AI',
        usage: 'pti <prompt>',
        examples: [
            'pti make it anime style',
            'pti turn this into a disney character',
            'pti cyberpunk style'
        ],
        permissions: 0,
        cooldown: 10,
        category: 'ai'
    },

    onRun: async (sock, msg, args) => {
        const prompt = args.join(' ').trim();

        if (!prompt) {
            return await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '❌ Please provide a prompt.\n\n' +
                        'Example:\n' +
                        '.pti make it anime style'
                },
                { quoted: msg }
            );
        }

        const imageMessage = findImageMessage(msg);

        if (!imageMessage) {
            return await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '❌ Reply to an image with your prompt.\n\n' +
                        'Example:\n' +
                        '.pti make it anime style'
                },
                { quoted: msg }
            );
        }

        try {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: '🎨 Uploading image and generating AI artwork...'
                },
                { quoted: msg }
            );

            const stream = await downloadContentFromMessage(
                imageMessage,
                'image'
            );

            const imageBuffer = await streamToBuffer(stream);

            const imageUrl = await uploadToCatbox(
                imageBuffer,
                imageMessage.mimetype || 'image/jpeg'
            );

            const apiUrl =
                `https://api.nabees.online/api/ai/pti?prompt=${encodeURIComponent(prompt)}` +
                `&image_url=${encodeURIComponent(imageUrl)}` +
                `&ratio=auto`;

            const { data } = await axios.get(apiUrl, {
                timeout: REQUEST_TIMEOUT
            });

            if (!data?.data?.image_url) {
                throw new Error('No image returned from API');
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: {
                        url: data.data.image_url
                    },
                    caption:
`✨ AI Image Generated

📝 Prompt: ${data.data.prompt}
🆔 Code: ${data.data.code}
📐 Ratio: ${data.data.ratio}`
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error('PTI command error:', error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '❌ Failed to generate image.\n\n' +
                        (error.message || 'Unknown error')
                },
                { quoted: msg }
            );
        }
    }
};