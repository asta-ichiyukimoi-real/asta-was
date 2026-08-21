const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 5; i += 1) {
        const next =
            current.ephemeralMessage?.message ||
            current.viewOnceMessage?.message ||
            current.viewOnceMessageV2?.message ||
            current.viewOnceMessageV2Extension?.message ||
            current.documentWithCaptionMessage?.message;

        if (!next) break;
        current = next;
    }

    return current;
}


function getContextInfo(msg) {
    const message = unwrapMessage(msg.message);

    return (
        message.extendedTextMessage?.contextInfo ||
        message.imageMessage?.contextInfo ||
        message.videoMessage?.contextInfo ||
        message.audioMessage?.contextInfo ||
        message.documentMessage?.contextInfo ||
        null
    );
}


function getQuotedMessage(msg) {
    return getContextInfo(msg)?.quotedMessage || null;
}


function getMediaType(message) {
    const unwrapped = unwrapMessage(message);

    if (unwrapped.imageMessage) return 'image';
    if (unwrapped.videoMessage) return 'video';
    if (unwrapped.audioMessage) return 'audio';
    if (unwrapped.documentMessage) return 'document';

    return null;
}


async function downloadQuotedMedia(message, type) {
    const unwrapped = unwrapMessage(message);

    const mediaMessage =
        unwrapped[`${type}Message`];

    if (!mediaMessage) {
        throw new Error(
            'Could not find the media inside the View Once message.'
        );
    }

    const stream = await downloadContentFromMessage(
        mediaMessage,
        type
    );

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
        throw new Error(
            'The View Once media is empty or could not be downloaded.'
        );
    }

    return buffer;
}


function getCaption(message, type) {
    const unwrapped = unwrapMessage(message);
    const media = unwrapped[`${type}Message`];

    return media?.caption || '';
}


function getFileName(message) {
    const unwrapped = unwrapMessage(message);

    return (
        unwrapped.documentMessage?.fileName ||
        'viewonce'
    );
}


module.exports = {
    config: {
        name: 'viewonce',

        aliases: [
            'vv',
            'vvo',
            'view',
            'once'
        ],

        version: '1.0.0',

        description:
            'Resend a View Once image, video, audio, or document',

        usage:
            'Reply to a View Once message with .vv',

        examples: [
            '.vv',
            '.viewonce'
        ],

        permissions: 0,

        cooldown: 5,

        category: 'media'
    },


    onRun: async (sock, msg) => {
        const quoted =
            getQuotedMessage(msg);

        if (!quoted) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '👁️ Reply to a View Once image, video, audio, or document with *.vv*.'
                },
                { quoted: msg }
            );

            return;
        }

        const type =
            getMediaType(quoted);

        if (!type) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '❌ The message you replied to does not contain supported media.'
                },
                { quoted: msg }
            );

            return;
        }

        try {
            await sock.sendPresenceUpdate(
                'uploading',
                msg.key.remoteJid
            );
        } catch {}

        await sock.sendMessage(
            msg.key.remoteJid,
            {
                text: '⬇️ Retrieving View Once media...'
            },
            { quoted: msg }
        );

        const buffer =
            await downloadQuotedMedia(
                quoted,
                type
            );

        const caption =
            getCaption(quoted, type);

        if (type === 'image') {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: buffer,
                    caption
                },
                { quoted: msg }
            );

            return;
        }

        if (type === 'video') {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    video: buffer,
                    caption,
                    mimetype:
                        quoted.videoMessage?.mimetype ||
                        'video/mp4'
                },
                { quoted: msg }
            );

            return;
        }
        if (type === 'audio') {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    audio: buffer,
                    mimetype:
                        quoted.audioMessage?.mimetype ||
                        'audio/mpeg',
                    ptt:
                        quoted.audioMessage?.ptt ||
                        false
                },
                { quoted: msg }
            );

            return;
        }

        /*
         * DOCUMENT
         */
        if (type === 'document') {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    document: buffer,

                    mimetype:
                        quoted.documentMessage?.mimetype ||
                        'application/octet-stream',

                    fileName:
                        getFileName(quoted),

                    caption
                },
                { quoted: msg }
            );

            return;
        }

    }
};