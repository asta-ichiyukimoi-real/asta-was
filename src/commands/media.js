const API_URL = 'https://omegatech-api.dixonomega.tech/api/download/play';
const DEFAULT_QUALITY = '360p';

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

function getQuotedText(msg) {
    const quoted = getContextInfo(msg)?.quotedMessage;
    const message = unwrapMessage(quoted);

    return message.conversation
        || message.extendedTextMessage?.text
        || message.imageMessage?.caption
        || message.videoMessage?.caption
        || message.documentMessage?.caption
        || '';
}

function marker(text, name) {
    const match = String(text || '').match(new RegExp(`\\[MEDIA_${name}:([^\\]]*)\\]`, 'i'));
    return match ? match[1] : '';
}

function readMediaContext(msg) {
    const quotedText = getQuotedText(msg);
    const rawQuery = marker(quotedText, 'QUERY');

    return {
        step: marker(quotedText, 'STEP').toLowerCase(),
        format: marker(quotedText, 'FORMAT').toLowerCase(),
        query: rawQuery ? decodeURIComponent(rawQuery) : ''
    };
}

function parseFormat(text) {
    const value = String(text || '').toLowerCase();
    if (/\b(mp3|audio|song|music)\b/.test(value)) return 'mp3';
    if (/\b(mp4|video)\b/.test(value)) return 'mp4';
    return '';
}

function parseDelivery(text, format) {
    const value = String(text || '').toLowerCase();
    if (/\b(doc|document|file)\b/.test(value)) return 'document';
    if (format === 'mp3' && /\b(audio|voice|normal|play)\b/.test(value)) return 'audio';
    if (format === 'mp4' && /\b(video|normal|play)\b/.test(value)) return 'video';
    return '';
}

function safeFileName(value, extension) {
    const base = String(value || 'media')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'media';

    return `${base}.${extension}`;
}

function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : 'Unknown';
}

function mediaCaption(data) {
    return [
        `*${data.title || 'Media'}*`,
        `Duration: ${data.duration?.timestamp || data.seconds || 'Unknown'}`,
        `Quality: ${data.quality || 'Unknown'}`,
        `Size: ${data.fileSize || 'Unknown'}`,
        `Views: ${formatNumber(data.views)}`,
        data.videoUrl || data.permanentLink || ''
    ].filter(Boolean).join('\n');
}

async function fetchMedia(query, format) {
    const url = `${API_URL}?query=${encodeURIComponent(query)}&format=${encodeURIComponent(format)}&quality=${encodeURIComponent(DEFAULT_QUALITY)}`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(60000)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `API responded with status ${response.status}`);
    }

    if (!data?.downloadUrl) {
        throw new Error('No download URL returned for that media.');
    }

    return data;
}

async function askFormat(sock, msg, query) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: [
            `Choose media format for: *${query}*`,
            '',
            'Reply with:',
            'mp3 - audio',
            'mp4 - video',
            '',
            '[REPLY_ID:media]',
            '[MEDIA_STEP:format]',
            `[MEDIA_QUERY:${encodeURIComponent(query)}]`
        ].join('\n')
    }, { quoted: msg });
}

async function askDelivery(sock, msg, query, format) {
    const normal = format === 'mp3' ? 'audio' : 'video';

    await sock.sendMessage(msg.key.remoteJid, {
        text: [
            `Send *${query}* as ${format.toUpperCase()}.`,
            '',
            'Reply with:',
            `${normal} - send as ${normal}`,
            'document - send as file',
            '',
            '[REPLY_ID:media]',
            '[MEDIA_STEP:delivery]',
            `[MEDIA_QUERY:${encodeURIComponent(query)}]`,
            `[MEDIA_FORMAT:${format}]`
        ].join('\n')
    }, { quoted: msg });
}

async function sendMedia(sock, msg, query, format, delivery) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: `Downloading *${query}* as ${format.toUpperCase()}...`
    }, { quoted: msg });

    const data = await fetchMedia(query, format);
    const extension = String(data.extension || format).toLowerCase();
    const fileName = safeFileName(data.title, extension);
    const caption = mediaCaption(data);
    const mimetype = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';

    if (delivery === 'document') {
        await sock.sendMessage(msg.key.remoteJid, {
            document: { url: data.downloadUrl },
            mimetype,
            fileName,
            caption
        }, { quoted: msg });
        return;
    }

    if (format === 'mp3') {
        await sock.sendMessage(msg.key.remoteJid, {
            audio: { url: data.downloadUrl },
            mimetype,
            fileName,
            ptt: false
        }, { quoted: msg });
        return;
    }

    await sock.sendMessage(msg.key.remoteJid, {
        video: { url: data.downloadUrl },
        mimetype,
        fileName,
        caption
    }, { quoted: msg });
}

async function handleMediaError(sock, msg, error) {
    console.error('Media command error:', error);
    await sock.sendMessage(msg.key.remoteJid, {
        text: `Media failed: ${error.message || error}`
    }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'media',
        aliases: ['play', 'download', 'dl'],
        version: '1.0.0',
        description: 'Download YouTube media as mp3 or mp4',
        usage: 'media <song or video name>',
        examples: ['media faded', 'media mp3 faded', 'media mp4 faded'],
        permissions: 0,
        cooldown: 8,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const requestedFormat = parseFormat(args[0]);
        const query = (requestedFormat ? args.slice(1) : args).join(' ').trim();

        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send a song or video name.\nExample: .media faded'
            }, { quoted: msg });
            return;
        }

        if (requestedFormat) {
            await askDelivery(sock, msg, query, requestedFormat);
            return;
        }

        await askFormat(sock, msg, query);
    },
    onReply: async (sock, msg, replyText) => {
        const context = readMediaContext(msg);
        const answer = String(replyText || '').trim();

        try {
            if (context.step === 'format') {
                const format = parseFormat(answer);
                const delivery = parseDelivery(answer, format);

                if (!format) {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: 'Please reply with mp3 or mp4.'
                    }, { quoted: msg });
                    return;
                }

                if (delivery) {
                    await sendMedia(sock, msg, context.query, format, delivery);
                    return;
                }

                await askDelivery(sock, msg, context.query, format);
                return;
            }

            if (context.step === 'delivery') {
                const delivery = parseDelivery(answer, context.format);

                if (!delivery) {
                    const normal = context.format === 'mp3' ? 'audio' : 'video';
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `Please reply with ${normal} or document.`
                    }, { quoted: msg });
                    return;
                }

                await sendMedia(sock, msg, context.query, context.format, delivery);
                return;
            }

            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Start again with .media <song or video name>.'
            }, { quoted: msg });
        } catch (error) {
            await handleMediaError(sock, msg, error);
        }
    }
};
