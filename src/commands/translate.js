const config = require('../../config');
const { requestJson, friendlyApiError } = require('../utils/apiClient');

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

function getQuotedText(msg) {
    const message = unwrapMessage(msg.message);
    const quoted = message.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedMessage = unwrapMessage(quoted);

    return quotedMessage.conversation
        || quotedMessage.extendedTextMessage?.text
        || quotedMessage.imageMessage?.caption
        || quotedMessage.videoMessage?.caption
        || quotedMessage.documentMessage?.caption
        || '';
}

function getConversationId(msg) {
    const sender = msg.key.participant || msg.key.remoteJid || 'unknown';
    return `${String(msg.key.remoteJid || 'chat').replace(/[^a-zA-Z0-9]/g, '_')}_${String(sender).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

async function translateText(text, target, msg) {
    const api = global.configCommandHandler?.get?.('apis.aiChat', config.apis?.aiChat) || config.apis?.aiChat;
    const prompt = [
        `Translate the following text to ${target}.`,
        'Return only the translation. Do not explain.',
        '',
        text
    ].join('\n');
    const url = `${api}?message=${encodeURIComponent(prompt)}&session_id=${encodeURIComponent(`${getConversationId(msg)}_translate`)}`;
    const data = await requestJson(url, { service: 'Translate AI', timeoutMs: config.ai?.requestTimeoutMs || 45000 });
    const translated = data.response || data.answer || data.result || data.message;

    if (!translated) {
        throw new Error('No translation returned.');
    }

    return String(translated).trim();
}

module.exports = {
    config: {
        name: 'translate',
        aliases: ['tr'],
        version: '1.0.0',
        description: 'Translate text using the configured AI chat API',
        usage: 'translate <language> <text>',
        examples: ['translate yoruba I am coming', 'translate en <reply to message>'],
        permissions: 0,
        cooldown: 5,
        category: 'utility'
    },
    onRun: async (sock, msg, args) => {
        const target = args[0];
        const text = args.slice(1).join(' ').trim() || getQuotedText(msg);

        if (!target || !text) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Use: .translate <language> <text>\nOr reply to a message: .translate en'
            }, { quoted: msg });
            return;
        }

        try {
            try {
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
            } catch {}

            const translated = await translateText(text, target, msg);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Translation (${target})*\n${translated}`
            }, { quoted: msg });
        } catch (error) {
            console.error('Translate command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: friendlyApiError(error, 'Translate AI')
            }, { quoted: msg });
        }
    }
};
