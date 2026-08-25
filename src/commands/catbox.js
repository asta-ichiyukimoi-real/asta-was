const config = require('../../config');
const { findMediaMessage, downloadMediaToBuffer } = require('../utils/media');

function extensionFromMime(mime = '') {
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    return 'jpg';
}

function extractUploadedUrl(data) {
    if (typeof data === 'string') {
        return data.trim();
    }

    return data?.result?.url
        || data?.url
        || data?.data?.url
        || '';
}

async function uploadToCatbox(buffer, mime) {
    const uploadUrl = global.configCommandHandler?.get?.('apis.catboxUpload', config.apis?.catboxUpload)
        || config.apis?.catboxUpload
        || 'https://catbox.moe/user/api.php';
    const form = new FormData();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    form.append('reqtype', 'fileupload');
    form.append(
        'fileToUpload',
        new Blob([buffer], { type: mime || 'image/jpeg' }),
        `asta-image-${Date.now()}.${extensionFromMime(mime)}`
    );

    let response;
    try {
        response = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
    }

    let payload = text;
    try {
        payload = JSON.parse(text);
    } catch {
        // Catbox returns a plain text URL.
    }

    const url = extractUploadedUrl(payload);
    if (!/^https?:\/\//i.test(url)) {
        throw new Error('Upload completed, but no valid URL was returned.');
    }

    return url;
}

module.exports = {
    config: {
        name: 'imgurl',
        aliases: ['imageurl', 'tourl', 'uploadimg', 'upimg', 'upimg2', 'catbox'],
        version: '2.0.0',
        description: 'Uploads an image and returns a direct URL',
        usage: 'imgurl',
        examples: ['imgurl', 'reply to an image with .imgurl'],
        permissions: 0,
        category: 'utility'
    },

    onRun: async (sock, msg) => {
        const chatId = msg.key.remoteJid;

        try {
            const media = findMediaMessage(msg, ['image']);

            if (!media) {
                await sock.sendMessage(chatId, {
                    text: '*Image To URL*\n\nSend an image with `.imgurl` as the caption, or reply to an image with `.imgurl`.'
                }, { quoted: msg });
                return;
            }

            await sock.sendMessage(chatId, {
                text: 'Uploading image and creating URL...'
            }, { quoted: msg });

            const mime = media.message.mimetype || 'image/jpeg';
            const buffer = await downloadMediaToBuffer(media.message, media.kind);
            const url = await uploadToCatbox(buffer, mime);

            await sock.sendMessage(chatId, {
                text: `*Image Uploaded Successfully*\n\n${url}`
            }, { quoted: msg });
        } catch (error) {
            console.error('imgurl command error:', error);
            await sock.sendMessage(chatId, {
                text: `Could not upload that image.\n\nReason: ${error.message}`
            }, { quoted: msg });
        }
    }
};
