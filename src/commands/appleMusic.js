const config = require('../../config');
const { friendlyApiError } = require('../utils/apiClient');

const API_URL =
    config.apis?.appleMusic ||
    'https://omegatech-api.dixonomega.tech/api/Search/Applemusic';

const SEARCH_LIMIT = 2;
const TIMEOUT_MS = 60000;


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

    return {
        step: marker(quotedText, 'STEP').toLowerCase(),

        query: decodeURIComponent(
            marker(quotedText, 'QUERY') || ''
        ),

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

                cover: decodeURIComponent(
                    marker(quotedText, 'COVER1') || ''
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

                cover: decodeURIComponent(
                    marker(quotedText, 'COVER2') || ''
                ),

                explicit:
                    marker(quotedText, 'EXPLICIT2') === 'true'
            }
        ]
    };
}


async function fetchJson(url) {
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            method: 'GET',

            headers: {
                Accept: 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },

            signal: controller.signal
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(
                `Apple Music API returned HTTP ${response.status}.`
            );
        }

        if (!text.trim()) {
            throw new Error(
                'Apple Music API returned an empty response.'
            );
        }

        try {
            return JSON.parse(text);
        } catch {
            console.error(
                '[AppleMusic] Invalid JSON:',
                text.slice(0, 500)
            );

            throw new Error(
                'Apple Music API returned invalid JSON.'
            );
        }

    } finally {
        clearTimeout(timeout);
    }
}


async function searchMusic(query) {
    const url =
        `${API_URL}?action=search` +
        `&query=${encodeURIComponent(query)}` +
        `&limit=${SEARCH_LIMIT}`;

    console.log(
        '[AppleMusic] Searching:',
        url
    );

    const response = await fetchJson(url);

    if (
        !response?.success ||
        !Array.isArray(response?.data?.results)
    ) {
        throw new Error(
            'Invalid Apple Music search response.'
        );
    }

    return response.data.results;
}


function getDownloadApiUrl(appleMusicUrl) {
    return (
        `${API_URL}` +
        `?action=download` +
        `&url=${encodeURIComponent(appleMusicUrl)}`
    );
}

async function downloadAudio(appleMusicUrl) {
    const apiUrl =
        getDownloadApiUrl(appleMusicUrl);

    console.log(
        '[AppleMusic] Download API:',
        apiUrl
    );

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
    );

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',

            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                Accept:
                    'audio/mpeg,audio/*,*/*'
            },

            redirect: 'follow',

            signal: controller.signal
        });

        console.log(
            '[AppleMusic] Download status:',
            response.status
        );

        console.log(
            '[AppleMusic] Final URL:',
            response.url
        );

        console.log(
            '[AppleMusic] Content-Type:',
            response.headers.get('content-type')
        );

        if (!response.ok) {
            throw new Error(
                `Music download failed with HTTP ${response.status}.`
            );
        }

        const contentType =
            response.headers.get('content-type') || '';

        if (
            contentType.includes('application/json') ||
            contentType.includes('text/html')
        ) {
            const text = await response.text();

            console.error(
                '[AppleMusic] Download endpoint returned:',
                text.slice(0, 1000)
            );

            try {
                const json = JSON.parse(text);

                const realUrl =
                    json?.data?.downloadUrl ||
                    json?.downloadUrl;

                if (realUrl) {
                    console.log(
                        '[AppleMusic] Found real download URL:',
                        realUrl
                    );

                    return downloadDirectAudio(realUrl);
                }
            } catch {
 
            }

            throw new Error(
                'Apple Music download endpoint did not return audio.'
            );
        }

        const arrayBuffer =
            await response.arrayBuffer();

        const buffer =
            Buffer.from(arrayBuffer);

        if (!buffer.length) {
            throw new Error(
                'Apple Music returned an empty audio file.'
            );
        }

        console.log(
            '[AppleMusic] Audio size:',
            buffer.length,
            'bytes'
        );


        const isId3 =
            buffer.length >= 3 &&
            buffer.toString(
                'ascii',
                0,
                3
            ) === 'ID3';

        const firstByte =
            buffer.length > 0
                ? buffer[0]
                : 0;

        const secondByte =
            buffer.length > 1
                ? buffer[1]
                : 0;

        const isMpegFrame =
            firstByte === 0xff &&
            (secondByte & 0xe0) === 0xe0;

        if (!isId3 && !isMpegFrame) {
            console.warn(
                '[AppleMusic] File does not look like a normal MP3.'
            );
        }

        return buffer;

    } finally {
        clearTimeout(timeout);
    }
}


async function downloadDirectAudio(url) {
    console.log(
        '[AppleMusic] Fetching final audio URL:',
        url
    );

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            method: 'GET',

            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                Accept:
                    'audio/mpeg,audio/*,*/*'
            },

            redirect: 'follow',

            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(
                `Final audio URL returned HTTP ${response.status}.`
            );
        }

        const contentType =
            response.headers.get('content-type') || '';

        console.log(
            '[AppleMusic] Final content type:',
            contentType
        );

        const arrayBuffer =
            await response.arrayBuffer();

        const buffer =
            Buffer.from(arrayBuffer);

        if (!buffer.length) {
            throw new Error(
                'Final audio URL returned an empty file.'
            );
        }

        console.log(
            '[AppleMusic] Final audio size:',
            buffer.length,
            'bytes'
        );

        return buffer;

    } finally {
        clearTimeout(timeout);
    }
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

    const name = cleanArtist
        ? `${cleanArtist} - ${cleanTitle}`
        : cleanTitle;

    return `${(name || 'music').slice(0, 100)}.mp3`;
}



async function showSearchResults(
    sock,
    msg,
    query,
    results
) {
    const first = results[0] || {};
    const second = results[1] || {};

    const lines = [
        '🎵 *Apple Music Search*',
        '',
        `🔎 *${query}*`,
        ''
    ];

    results.forEach((track, index) => {
        lines.push(
            `*${index + 1}. ${track.title || 'Unknown'}*`,
            `👤 ${track.artist || 'Unknown Artist'}`,
            track.explicit
                ? '🔞 Explicit'
                : '🟢 Clean',
            ''
        );
    });

    lines.push(
        'Reply with *1* or *2* to download.',
        '[REPLY_ID:music]'
    );

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: lines.join('\n')
        },
        { quoted: msg }
    );
}


async function sendMusic(sock, msg, track) {
    const title =
        track.title || 'Music';

    const artist =
        track.artist || 'Unknown Artist';

    if (!track.url) {
        throw new Error(
            'Selected track has no Apple Music URL.'
        );
    }

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

    try {
        await sock.sendPresenceUpdate(
            'uploading',
            msg.key.remoteJid
        );
    } catch {}

    const audioBuffer =
        await downloadAudio(track.url);

    const fileName =
        safeFileName(title, artist);

    console.log(
        `[AppleMusic] Sending ${fileName} ` +
        `(${audioBuffer.length} bytes)`
    );

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName,
            ptt: false
        },
        { quoted: msg }
    );
}

async function handleMusicError(
    sock,
    msg,
    error
) {
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
            'Failed to download the music.';
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

        version: '4.0.0',

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


    onRun: async (
        sock,
        msg,
        args
    ) => {
        const query =
            args.join(' ').trim();

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
            const results =
                await searchMusic(query);

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


    onReply: async (
        sock,
        msg,
        replyText
    ) => {
        const context =
            readMusicContext(msg);

        const answer =
            String(replyText || '').trim();

        try {
            if (context.step !== 'result') {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            'Start again with:\n' +
                            '.music <song name>'
                    },
                    { quoted: msg }
                );

                return;
            }

            const choice =
                Number(answer);

            if (
                !Number.isInteger(choice) ||
                choice < 1 ||
                choice > SEARCH_LIMIT
            ) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            '❌ Reply with *1* or *2*.'
                    },
                    { quoted: msg }
                );

                return;
            }

            const selected =
                context.results[choice - 1];

            if (!selected?.url) {
                throw new Error(
                    'Selected song is unavailable.'
                );
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