const config = require('../../config');

function getConfig(path, fallback) {
    return global.configCommandHandler?.get?.(path, fallback) ?? fallback;
}

const LETTER_RANGES = {
    bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    italic: { upper: 0x1d434, lower: 0x1d44e },
    bolditalic: { upper: 0x1d468, lower: 0x1d482 },
    script: { upper: 0x1d49c, lower: 0x1d4b6 },
    boldscript: { upper: 0x1d4d0, lower: 0x1d4ea },
    fraktur: { upper: 0x1d504, lower: 0x1d51e },
    double: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 },
    boldfraktur: { upper: 0x1d56c, lower: 0x1d586 },
    sans: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
    boldsans: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
    sansitalic: { upper: 0x1d608, lower: 0x1d622 },
    boldsansitalic: { upper: 0x1d63c, lower: 0x1d656 },
    mono: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 }
};

const SPECIAL_CHARS = {
    script: {
        B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ',
        e: 'ℯ', g: 'ℊ', o: 'ℴ'
    },
    fraktur: {
        C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ'
    },
    double: {
        C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ'
    }
};

const NAMED_FONTS = {
    normal: 'Normal',
    bold: 'Bold',
    italic: 'Italic',
    bolditalic: 'Bold Italic',
    script: 'Script',
    boldscript: 'Bold Script',
    fraktur: 'Fraktur',
    boldfraktur: 'Bold Fraktur',
    double: 'Double-struck',
    sans: 'Sans',
    boldsans: 'Bold Sans',
    sansitalic: 'Sans Italic',
    boldsansitalic: 'Bold Sans Italic',
    mono: 'Monospace',
    wide: 'Fullwidth',
    smallcaps: 'Small Caps',
    circled: 'Circled',
    squared: 'Squared'
};

const SMALL_CAPS = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

function getCommandImageUrl(commandName) {
    const commandImages = getConfig('assets.commandImages', config.assets?.commandImages || {});
    const defaultUrl = getConfig('assets.defaultCommandImageUrl', config.assets?.defaultCommandImageUrl || '');
    const commandUrl = commandImages?.[commandName];

    return String(commandUrl || defaultUrl || '').trim();
}

function normalizeFontName(fontName) {
    const normalized = String(fontName || 'normal').trim().toLowerCase().replace(/[\s_-]+/g, '');
    const aliases = {
        off: 'normal',
        default: 'normal',
        regular: 'normal',
        bi: 'bolditalic',
        doublestruck: 'double',
        monospace: 'mono',
        fullwidth: 'wide',
        small: 'smallcaps',
        smallcap: 'smallcaps',
        circles: 'circled',
        square: 'squared'
    };

    return aliases[normalized] || normalized;
}

function availableFonts() {
    return Object.keys(NAMED_FONTS);
}

function fontLabel(fontName) {
    return NAMED_FONTS[normalizeFontName(fontName)] || NAMED_FONTS.normal;
}

function offsetChar(char, range) {
    const code = char.codePointAt(0);
    if (code >= 65 && code <= 90 && range.upper) return String.fromCodePoint(range.upper + code - 65);
    if (code >= 97 && code <= 122 && range.lower) return String.fromCodePoint(range.lower + code - 97);
    if (code >= 48 && code <= 57 && range.digit) return String.fromCodePoint(range.digit + code - 48);
    return char;
}

function transformChar(char, fontName) {
    const font = normalizeFontName(fontName);

    if (SPECIAL_CHARS[font]?.[char]) return SPECIAL_CHARS[font][char];

    if (LETTER_RANGES[font]) {
        return offsetChar(char, LETTER_RANGES[font]);
    }

    const code = char.codePointAt(0);
    if (font === 'wide') {
        if (char === ' ') return '　';
        if (code >= 33 && code <= 126) return String.fromCodePoint(code + 0xfee0);
        return char;
    }

    if (font === 'smallcaps') {
        return SMALL_CAPS[char.toLowerCase()] || char;
    }

    if (font === 'circled') {
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x24b6 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x24d0 + code - 97);
        if (code >= 49 && code <= 57) return String.fromCodePoint(0x2460 + code - 49);
        if (char === '0') return '⓪';
        return char;
    }

    if (font === 'squared') {
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1f130 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1f130 + code - 97);
        return char;
    }

    return char;
}

function shouldPreserveSegment(segment) {
    return /^\[REPLY_ID:[a-zA-Z0-9_-]+\]$/.test(segment)
        || /^https?:\/\//i.test(segment)
        || /^www\./i.test(segment)
        || /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i.test(segment)
        || /^@\d+/.test(segment);
}

function styleText(text, fontName) {
    const font = normalizeFontName(fontName);
    if (font === 'normal' || !NAMED_FONTS[font]) return text;

    return String(text || '')
        .split(/(\s+|\[REPLY_ID:[a-zA-Z0-9_-]+\]|https?:\/\/\S+|www\.\S+|[\w.-]+@[\w.-]+\.[a-z]{2,}|@\d+)/g)
        .map(segment => shouldPreserveSegment(segment) ? segment : Array.from(segment).map(char => transformChar(char, font)).join(''))
        .join('');
}

function getReplyFont() {
    return normalizeFontName(getConfig('messages.replyFont', config.messages?.replyFont || 'normal'));
}

function applyReplyFontToContent(content, fontName = getReplyFont()) {
    if (!content || typeof content !== 'object') return content;
    if (content.__skipReplyFont) {
        const { __skipReplyFont, ...next } = content;
        return next;
    }

    const font = normalizeFontName(fontName);
    if (font === 'normal' || !NAMED_FONTS[font]) return content;

    const next = { ...content };
    if (typeof next.text === 'string') next.text = styleText(next.text, font);
    if (typeof next.caption === 'string') next.caption = styleText(next.caption, font);
    return next;
}

function installMessageFont(sock) {
    if (!sock || sock.__astaMessageFontInstalled) return sock;

    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = (jid, content, options) => originalSendMessage(
        jid,
        applyReplyFontToContent(content),
        options
    );
    sock.__astaMessageFontInstalled = true;
    return sock;
}

async function sendStyledMessage(sock, chatId, text, options = {}) {
    const quoted = options.quoted;
    const imageUrl = options.imageUrl || getCommandImageUrl(options.commandName);
    const messageOptions = quoted ? { quoted } : undefined;

    if (imageUrl) {
        try {
            return await sock.sendMessage(chatId, {
                image: { url: imageUrl },
                caption: text
            }, messageOptions);
        } catch (error) {
            console.warn(`Image message failed for ${options.commandName || 'command'}: ${error.message}`);
        }
    }

    return sock.sendMessage(chatId, { text }, messageOptions);
}

module.exports = {
    applyReplyFontToContent,
    availableFonts,
    fontLabel,
    getCommandImageUrl,
    getReplyFont,
    installMessageFont,
    normalizeFontName,
    styleText,
    sendStyledMessage
};
