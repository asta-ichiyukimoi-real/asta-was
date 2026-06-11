const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { requestJson, friendlyApiError, getErrorMessage, isTimeout } = require('../utils/apiClient');

const EDIT_API_URL = 'https://api.nabees.online/api/ai/pti';
const AI_EDIT_TIMEOUT_MS = config.ai?.editTimeoutMs || 60000;

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
        || message.videoMessage?.contextInfo
        || message.documentMessage?.contextInfo
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

async function imageMessageToBuffer(imageMessage) {
    if (!imageMessage) return null;
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    const buffer = await streamToBuffer(stream);
    return buffer;
}

async function uploadImageToCatbox(buffer, mime = 'image/jpeg') {
    const CATBOX_UPLOAD_URL = config.apis?.catboxUpload || 'https://catbox.moe/user/api.php';
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', new Blob([buffer], { type: mime }), `edit-${Date.now()}.jpg`);

    const response = await fetch(CATBOX_UPLOAD_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(AI_EDIT_TIMEOUT_MS)
    });

    const text = (await response.text()).trim();
    if (!response.ok ||!/^https?:\/\//i.test(text)) {
        throw new Error(`Image upload failed: ${text || response.status}`);
    }
    return text;
}

module.exports = {
    config: {
        name: 'edit',
        aliases: ['editimg', 'imgedit', 'photoedit'],
        version: '1.0.0',
        description: 'Edit images with AI. Reply to an image with your prompt.',
        usage: '.edit <prompt>',
        examples: [
            '.edit make it anime style',
            '.edit change background to space',
            '.edit add cyberpunk neon effect'
        ],
        permissions: 0,
        cooldown: 10,
        category: 'ai'
    },

    onRun: async (sock, msg, args) => {
        const prompt = args.join(' ').trim();
        const imageMessage = findImageMessage(msg);

        if (!imageMessage) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Reply to an image with `.edit <prompt>`.\nExample: `.edit make it anime style`'
            }, { quoted: msg });
            return;
        }

        if (!prompt) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Add a prompt. Example: `.edit make it anime style`'
            }, { quoted: msg });
            return;
        }

        try {
            await sock.sendPresenceUpdate('uploading', msg.key.remoteJid);
            const imageBuffer = await imageMessageToBuffer(imageMessage);
            if (!imageBuffer) throw new Error('Failed to download image');

            const imageUrl = await uploadImageToCatbox(imageBuffer);

            const apiUrl = `${EDIT_API_URL}?prompt=${encodeURIComponent(prompt)}&image_url=${encodeURIComponent(imageUrl)}&ratio=auto`;
            const data = await requestJson(apiUrl, { timeoutMs: AI_EDIT_TIMEOUT_MS, service: 'Edit API' });

            if (data.status!== 200 ||!data.data?.image_url) {
                throw new Error('API returned no image');
            }

            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: data.data.image_url },
                caption: `*Edited Image*\nPrompt: ${data.data.prompt}`
            }, { quoted: msg });

       } catch (error) {
    console.error('Edit command error:', error);

    const rawMsg = getErrorMessage(error);
    const isTO = isTimeout(error);
    
    let text = '';
    if (isTO) {
        text = 'Edit request timed out. The API took too long to respond.';
    } else {
        text = `*Edit API Error*\n${rawMsg}\n\nThis helps debug. Remove this raw error in production.`;
    }

    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}
    }
};