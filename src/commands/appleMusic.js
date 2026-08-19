const config = require('../../config');
const { friendlyApiError } = require('../utils/apiClient');

const API_URL =
    config.apis?.appleMusic ||
    'https://omegatech-api.dixonomega.tech/api/Search/Applemusic';

const SEARCH_LIMIT = 2;
const TIMEOUT_MS = 60000;


/**
 * Unwrap WhatsApp messages.
 */
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
        message.documentMessage?.contextInfo ||
        null
    );
}


function getQuotedText(msg) {
    const quoted = getContextInfo(msg)?.quotedMessage;
    const message = unwrapMessage(quoted);

    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        ''
    );
}


/**
 * Read our reply markers.
 */
function marker(text, name) {
    const match = String(text || '').match(
        new RegExp(`\\[MUSIC_${name}:([^\\]]*)\\]`, 'i')
    );

    return match ? match[1] : '';
}


function readMusicContext(msg) {
    const quotedText = getQuotedText(msg);

    const rawQuery = marker(quotedText, 'QUERY');

    return {
        step: marker(quotedText, 'STEP').toLowerCase(),

        query: rawQuery
            ? decodeURIComponent(rawQuery)
            : '',

        results: [
            {
                url: decodeURIComponent(
                    marker(quotedText, 'URL1') || ''
                ),
                title: decodeURIComponent(
                    marker(quotedText, 'TITLE1') || ''
                ),
                artist: decodeURIComponent(
                    marker(quotedText, 'ARTIST1') || ''
                ),
                explicit:
                    marker(quotedText, 'EXPLICIT1') === 'true'
            },

            {
                url: decodeURIComponent(
                    marker(quotedText, 'URL2') || ''
                ),
                title: decodeURIComponent(
                    marker(quotedText, 'TITLE2') || ''
                ),
                artist: decodeURIComponent(
                    marker(quotedText, 'ARTIST2') || ''
                ),
                explicit:
                    marker(quotedText, 'EXPLICIT2') === 'true'
            }
        ]
    };
}


/**
 * Generic fetch helper for this API.
 *
 * We intentionally DON'T use requestJson() because the API
 * sometimes returns HTTP 200 with unusual/empty bodies.
 */
async function fetchApiJson(url) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal
        });

        const text = await response.text();

        console.log(
            `[AppleMusic] HTTP ${response.status} ${response.statusText}`
        );

        if (!response.ok) {
            throw new Error(
                `Apple Music API returned HTTP ${response.status}.`
            );
        }

        if (!text || !text.trim()) {
            throw new Error(
                'Apple Music API returned HTTP 200 but an empty response.'
            );
        }

        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            console.error(
                '[AppleMusic] Invalid JSON response:',
                text.slice(0, 500)
            );

            throw new Error(
                'Apple Music API returned invalid JSON.'
            );
        }

        return data;

    } finally {
        clearTimeout(timeout);
    }
}


/**
 * Search Apple Music.
 */
async function searchMusic(query) {
    const url =
        `${API_URL}` +
        `?action=search` +
        `&query=${encodeURIComponent(query)}` +
        `&limit=${SEARCH_LIMIT}`;

    console.log('[AppleMusic] Search URL:', url);

    const response = await fetchApiJson(url);

    if (
        !response ||
        response.success !== true ||
        !response.data ||
        !Array.isArray(response.data.results)
    ) {
        console.error(
            '[AppleMusic] Unexpected search response:',
            JSON.stringify(response)
        );

        throw new Error(
            'Apple Music returned an unexpected search response.'
        );
    }

    return response.data.results;
}


/**
 * Build the download endpoint.
 *
 * IMPORTANT:
 * We don't request this ourselves.
 *
 * This URL is passed directly to Baileys as the audio source.
 */
function getDownloadUrl(appleMusicUrl) {
    return (
        `${API_URL}` +
        `?action=download` +
        `&url=${encodeURIComponent(appleMusicUrl)}`
    );
}


/**
 * Safe MP3 filename.
 */
function safeFileName(title, artist) {
    const cleanTitle = String(title || 'music')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanArtist = String(artist || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const name = cleanArtist
        ? `${cleanArtist} - ${cleanTitle}`
        : cleanTitle;

    return `${(name || 'music').slice(0, 100)}.mp3`;
}


/**
 * Show search results.
 */
async function showSearchResults(sock, msg, query, results) {
    const first = results[0] || {};
    const second = results[1] || {};

    const lines = [
        '🎵 *Apple Music Search*',
        '',
        `🔎 Search: *${query}*`,
        ''
    ];

    results.forEach((track, index) => {
        lines.push(
            `*${index + 1}. ${track.title || 'Unknown title'}*`,
            `👤 ${track.artist || 'Unknown artist'}`,
            track.explicit
                ? '🔞 Explicit'
                : '🟢 Clean',
            ''
        );
    });

    lines.push(
        'Reply with *1* or *2* to download.',
        '',
        '[REPLY_ID:music]',
        '[MUSIC_STEP:result]',
        `[MUSIC_QUERY:${encodeURIComponent(query)}]`,

        `[MUSIC_URL1:${encodeURIComponent(first.url || '')}]`,
        `[MUSIC_TITLE1:${encodeURIComponent(first.title || '')}]`,
        `[MUSIC_ARTIST1:${encodeURIComponent(first.artist || '')}]`,
        `[MUSIC_EXPLICIT1:${first.explicit ? 'true' : 'false'}]`,

        `[MUSIC_URL2:${encodeURIComponent(second.url || '')}]`,
        `[MUSIC_TITLE2:${encodeURIComponent(second.title || '')}]`,
        `[MUSIC_ARTIST2:${encodeURIComponent(second.artist || '')}]`,
        `[MUSIC_EXPLICIT2:${second.explicit ? 'true' : 'false'}]`
    );

    /*
     * Send cover image when available.
     *
     * This makes the search result look nicer.
     */
    if (first.cover) {
        await sock.sendMessage(
            msg.key.remoteJid,
            {
                image: {
                    url: first.cover
                },
                caption: lines.join('\n')
            },
            { quoted: msg }
        );

        return;
    }

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: lines.join('\n')
        },
        { quoted: msg }
    );
}


/**
 * Download/send selected song.
 */
async function sendMusic(sock, msg, track) {
    if (!track?.url) {
        throw new Error(
            'The selected song does not have a valid Apple Music URL.'
        );
    }

    const title = track.title || 'Music';
    const artist = track.artist || 'Unknown Artist';

    /*
     * This is the important part.
     *
     * The endpoint itself is used as the audio source.
     */
    const downloadUrl = getDownloadUrl(track.url);

    const fileName = safeFileName(
        title,
        artist
    );

    console.log(
        '[AppleMusic] Download URL:',
        downloadUrl
    );

    try {
        await sock.sendPresenceUpdate(
            'recording',
            msg.key.remoteJid
        );
    } catch {}

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text:
                `⬇️ *Downloading Music...*\n\n` +
                `🎵 *${title}*\n` +
                `👤 ${artist}`
        },
        { quoted: msg }
    );

    /*
     * Do NOT use requestJson() here.
     *
     * Baileys fetches the actual audio from this URL.
     */
    await sock.sendMessage(
        msg.key.remoteJid,
        {
            audio: {
                url: downloadUrl
            },

            mimetype: 'audio/mpeg',

            fileName,

            ptt: false
        },
        { quoted: msg }
    );
}


/**
 * Error handler.
 */
async function handleMusicError(sock, msg, error) {
    console.error(
        'Music command error:',
        error
    );

    let message;

    try {
        message = friendlyApiError(
            error,
            'Apple Music API'
        );
    } catch {
        message =
            error?.message ||
            'Something went wrong while processing the music.';
    }

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: `❌ ${message}`
        },
        { quoted: msg }
    );
}


module.exports = {
    config: {
        name: 'music',

        aliases: [
            'song',
            'itunes'
        ],

        version: '3.0.0',

        description:
            'Search and download music from Apple Music',

        usage:
            'music <song name>',

        examples: [
            'music faded',
            'music alan walker faded'
        ],

        permissions: 0,

        cooldown: 8,

        category: 'media'
    },


    /**
     * .music faded
     */
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();

        if (!query) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        '🎵 *Music Command*\n\n' +
                        'Send a song name.\n\n' +
                        'Example:\n' +
                        '*.music faded*'
                },
                { quoted: msg }
            );

            return;
        }

        try {
            const results = await searchMusic(query);

            if (!results.length) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            `❌ No songs found for *${query}*.`
                    },
                    { quoted: msg }
                );

                return;
            }

            await showSearchResults(
                sock,
                msg,
                query,
                results
            );

        } catch (error) {
            await handleMusicError(
                sock,
                msg,
                error
            );
        }
    },


    /**
     * Handle user's 1 / 2 selection.
     */
    onReply: async (sock, msg, replyText) => {
        const context = readMusicContext(msg);
        const answer = String(replyText || '').trim();

        try {
            if (context.step !== 'result') {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            'Please start again with:\n' +
                            '*.music <song name>*'
                    },
                    { quoted: msg }
                );

                return;
            }

            const choice = Number(answer);

            if (
                !Number.isInteger(choice) ||
                choice < 1 ||
                choice > SEARCH_LIMIT
            ) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            '❌ Invalid choice.\n\n' +
                            'Reply with *1* or *2*.'
                    },
                    { quoted: msg }
                );

                return;
            }

            const selected =
                context.results[choice - 1];

            if (!selected?.url) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            '❌ That result is unavailable. ' +
                            'Please search again.'
                    },
                    { quoted: msg }
                );

                return;
            }

            await sendMusic(
                sock,
                msg,
                selected
            );

        } catch (error) {
            await handleMusicError(
                sock,
                msg,
                error
            );
        }
    }
};