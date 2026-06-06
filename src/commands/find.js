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
    return message.extendedTextMessage?.contextInfo || null;
}

function getQuotedText(msg) {
    const quoted = getContextInfo(msg)?.quotedMessage;
    const message = unwrapMessage(quoted);
    return message.conversation || message.extendedTextMessage?.text || '';
}

function marker(text, name) {
    const match = String(text || '').match(new RegExp(`\\[FIND_${name}:([^\\]]*)\\]`, 'i'));
    return match ? match[1] : '';
}

function parseChoice(text) {
    const value = String(text || '').toLowerCase();
    if (/\b(1|pin|pinterest|image|images)\b/.test(value)) return 'pinterest';
    if (/\b(2|wall|wallpaper|walls)\b/.test(value)) return 'wallpaper';
    if (/\b(3|mp3|audio|music|song)\b/.test(value)) return 'mp3';
    if (/\b(4|mp4|video)\b/.test(value)) return 'mp4';
    return '';
}

async function askChoice(sock, msg, query) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: [
            `What should I find for *${query}*?`,
            '',
            '1. Pinterest images',
            '2. Wallpapers',
            '3. YouTube MP3',
            '4. YouTube MP4',
            '',
            '[REPLY_ID:find]',
            `[FIND_QUERY:${encodeURIComponent(query)}]`
        ].join('\n')
    }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'find',
        aliases: ['finder'],
        version: '1.0.0',
        description: 'Choose Pinterest, wallpaper, mp3, or mp4 search',
        usage: 'find <query>',
        examples: ['find akaza', 'find faded'],
        permissions: 0,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Use: .find <query>' }, { quoted: msg });
            return;
        }

        await askChoice(sock, msg, query);
    },
    onReply: async (sock, msg, replyText) => {
        const quotedText = getQuotedText(msg);
        const query = decodeURIComponent(marker(quotedText, 'QUERY') || '');
        const choice = parseChoice(replyText);

        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Start again with .find <query>.' }, { quoted: msg });
            return;
        }

        if (!choice) {
            await askChoice(sock, msg, query);
            return;
        }

        if (choice === 'pinterest') {
            await require('./pinterest').onRun(sock, msg, [...query.split(/ +/), '-4']);
            return;
        }

        if (choice === 'wallpaper') {
            await require('./wallpaper').onRun(sock, msg, [...query.split(/ +/), '-4']);
            return;
        }

        await require('./media').onRun(sock, msg, [choice, ...query.split(/ +/)]);
    }
};
