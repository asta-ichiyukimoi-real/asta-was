const config = require('../../config');
const { requestJson, friendlyApiError } = require('../utils/apiClient');

const API_URL =
    config.apis?.appleMusic ||
    'https://omegatech-api.dixonomega.tech/api/Search/Applemusic';

const SEARCH_LIMIT = 2;
const SEARCH_TIMEOUT_MS = 30000;


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


function marker(text, name) {
    const match = String(text || '').match(
        new RegExp(`\\[MUSIC_${name}:([^\\]]*)\\]`, 'i')
    );

    return match ? match[1] : '';
}

function readMusicContext(msg) {
    const quotedText = getQuotedText(msg);

    const rawQuery = marker(quotedText, 'QUERY');
    const rawUrl1 = marker(quotedText, 'URL1');
    const rawUrl2 = marker(quotedText, 'URL2');
    const rawTitle1 = marker(quotedText, 'TITLE1');
    const rawTitle2 = marker(quotedText, 'TITLE2');
    const rawArtist1 = marker(quotedText, 'ARTIST1');
    const rawArtist2 = marker(quotedText, 'ARTIST2');

    return {
        step: marker(quotedText, 'STEP').toLowerCase(),

        query: rawQuery
            ? decodeURIComponent(rawQuery)
            : '',

        results: [
            {
                url: rawUrl1
                    ? decodeURIComponent(rawUrl1)
                    : '',

                title: rawTitle1
                    ? decodeURIComponent(rawTitle1)
                    : '',

                artist: rawArtist1
                    ? decodeURIComponent(rawArtist1)
                    : ''
            },
            {
                url: rawUrl2
                    ? decodeURIComponent(rawUrl2)
                    : '',

                title: rawTitle2
                    ? decodeURIComponent(rawTitle2)
                    : '',

                artist: rawArtist2
                    ? decodeURIComponent(rawArtist2)
                    : ''
            }
        ]
    };
}


async function searchMusic(query) {
    const url =
        `${API_URL}?action=search` +
        `&query=${encodeURIComponent(query)}` +
        `&limit=${SEARCH_LIMIT}`;

    const response = await requestJson(url, {
        timeoutMs: SEARCH_TIMEOUT_MS,
        service: 'Apple Music Search API'
    });

    if (
        !response?.success ||
        !response?.data ||
        !Array.isArray(response.data.results)
    ) {
        throw new Error(
            'No valid Apple Music search results were returned.'
        );
    }

    return response.data.results;
}



function getDownloadUrl(appleMusicUrl) {
    return (
        `${API_URL}?action=download` +
        `&url=${encodeURIComponent(appleMusicUrl)}`
    );
}


function safeFileName(title, artist) {
    const cleanTitle = String(title || 'music')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanArtist = String(artist || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    let name = cleanArtist
        ? `${cleanArtist} - ${cleanTitle}`
        : cleanTitle;

    name = name
        .slice(0, 100)
        .trim();

    return `${name || 'music'}.mp3`;
}


/**
 * Display search results.
 */
async function showSearchResults(sock, msg, query, results) {
    const lines = [
        '🎵 *Apple Music Search*',
        '',
        `Search: *${query}*`,
        ''
    ];

    results.forEach((track, index) => {
        const number = index + 1;

        lines.push(
            `*${number}. ${track.title || 'Unknown title'}*`,
            `👤 Artist: ${track.artist || 'Unknown artist'}`,
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
        `[MUSIC_URL1:${encodeURIComponent(results[0]?.url || '')}]`,
        `[MUSIC_TITLE1:${encodeURIComponent(results[0]?.title || '')}]`,
        `[MUSIC_ARTIST1:${encodeURIComponent(results[0]?.artist || '')}]`,
        `[MUSIC_URL2:${encodeURIComponent(results[1]?.url || '')}]`,
        `[MUSIC_TITLE2:${encodeURIComponent(results[1]?.title || '')}]`,
        `[MUSIC_ARTIST2:${encodeURIComponent(results[1]?.artist || '')}]`
    );

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: lines.join('\n')
        },
        { quoted: msg }
    );
}


/**
 * Download and send the selected song.
 *
 * The Apple Music download endpoint is passed directly to Baileys.
 */
async function sendMusic(sock, msg, track) {
    if (!track?.url) {
        throw new Error(
            'The selected song does not have a valid Apple Music URL.'
        );
    }

    const title = track.title || 'Music';
    const artist = track.artist || 'Unknown Artist';

    const downloadUrl = getDownloadUrl(track.url);

    const fileName = safeFileName(
        title,
        artist
    );

    try {
        await sock.sendPresenceUpdate(
            'uploading',
            msg.key.remoteJid
        );
    } catch {}

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text:
                `⬇️ *Downloading...*\n\n` +
                `🎵 ${title}\n` +
                `👤 ${artist}`
        },
        { quoted: msg }
    );

    /*
     * Send the download endpoint directly.
     *
     * DO NOT use requestJson(downloadUrl).
     *
     * The endpoint is expected to return/redirect to the MP3.
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
 * Handle API / download errors.
 */
async function handleMusicError(sock, msg, error) {
    console.error('Music command error:', error);

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: friendlyApiError(error, 'Apple Music API')
        },
        { quoted: msg }
    );
}


module.exports = {
    config: {
        name: 'music',
        aliases: ['song', 'itunes'],
        version: '2.0.0',
        description: 'Search and download music from Apple Music',
        usage: 'music <song name>',
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
                        '.music faded'
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
     * Handle:
     *
     * 1
     * or
     * 2
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
                            '.music <song name>'
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

            const selected = context.results[choice - 1];

            if (!selected?.url) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            '❌ That music result is no longer available.'
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