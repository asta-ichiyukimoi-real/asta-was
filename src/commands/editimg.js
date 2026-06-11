const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrapMessage(message) {
    let current = message || {};
    for (let i = 0; i < 5; i += 1) {
        const next = current.ephemeralMessage?.message
            || current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.documentWithCaptionMessage?.message;
        if (!next) break;
        current = next;
    }
    return current;
}

function getContextInfo(msg) {
    const message = unwrapMessage(msg.message);
    return message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || null;
}

function findImageMessage(msg) {
    const message = unwrapMessage(msg.message);
    if (message.imageMessage) return message.imageMessage;

    const quoted = getContextInfo(msg)?.quotedMessage;
    const quotedMessage = unwrapMessage(quoted);
    return quotedMessage.imageMessage || null;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function uploadToTelegraph(buffer) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');

    const res = await fetch('https://telegra.ph/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!data[0]?.src) throw new Error('Upload to telegra.ph failed');
    return `https://telegra.ph${data[0].src}`;
}

module.exports = {
    config: {
        name: 'edit',
        aliases: ['imgedit', 'photoedit'],
        version: '1.0.0',
        description: 'Edit images with AI. Reply to an image with your prompt.',
        permissions: 0,
        category: 'ai'
    },

    onRun: async (sock, msg, args) => {
        const prompt = args.join(' ').trim();
        const imageMessage = findImageMessage(msg);

        if (!imageMessage) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Reply to an image with `.edit <prompt>`\nExample: `.edit make it anime style`'
            }, { quoted: msg });
            return;
        }

        if (!prompt) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Add a prompt. Example: `.edit turn it into cyberpunk`'
            }, { quoted: msg });
            return;
        }

        try {
            await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });

            // 1. Download image
            const stream = await downloadContentFromMessage(imageMessage, 'image');
            const buffer = await streamToBuffer(stream);

            // 2. Upload to telegra.ph
            const imageUrl = await uploadToTelegraph(buffer);

            // 3. Call Nabees API
            const apiUrl = `https://api.nabees.online/api/ai/pti?prompt=${encodeURIComponent(prompt)}&image_url=${encodeURIComponent(imageUrl)}&ratio=auto`;

            const res = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(60000)
            });

            const data = await res.json();

            if (data.status!== 200 ||!data.data?.image_url) {
                throw new Error(`API returned status ${data.status}: ${JSON.stringify(data)}`);
            }

            // 4. Send result
            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: data.data.image_url },
                caption: `*Done*\nPrompt: ${data.data.prompt}`
            }, { quoted: msg });

            await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('Edit error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Error:* ${error.message}\n\nCheck logs for full details.`
            }, { quoted: msg });
            await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
        }
    }
};