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
        || message.videoMessage?.contextInfo
        || message.audioMessage?.contextInfo
        || message.documentMessage?.contextInfo
        || null;
}

function getQuotedMessage(msg) {
    return unwrapMessage(getContextInfo(msg)?.quotedMessage);
}

function getMessageText(msg) {
    const message = unwrapMessage(msg.message);
    return message.conversation
        || message.extendedTextMessage?.text
        || message.imageMessage?.caption
        || message.videoMessage?.caption
        || message.documentMessage?.caption
        || '';
}

function findMediaMessage(msg, kinds) {
    const direct = unwrapMessage(msg.message);
    const quoted = getQuotedMessage(msg);

    for (const kind of kinds) {
        const key = `${kind}Message`;
        if (direct[key]) return { message: direct[key], kind };
        if (quoted[key]) return { message: quoted[key], kind };
    }

    return null;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function downloadMediaToBuffer(mediaMessage, kind) {
    const stream = await downloadContentFromMessage(mediaMessage, kind);
    return streamToBuffer(stream);
}

function toDataUri(buffer, mime = 'application/octet-stream') {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

module.exports = {
    unwrapMessage,
    getContextInfo,
    getQuotedMessage,
    getMessageText,
    findMediaMessage,
    downloadMediaToBuffer,
    toDataUri
};
