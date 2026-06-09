const config = require('../../config');
const { requestJson, friendlyApiError } = require('../utils/apiClient');

const PLAY_URL = config.apis?.mediaDownload || 'https://omegatech-api.dixonomega.tech/api/download/play';

function isYouTubeUrl(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();

        if (host === 'youtu.be') {
            return Boolean(url.pathname.split('/').filter(Boolean)[0]);
        }

        if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
            return false;
        }

        const parts = url.pathname.split('/').filter(Boolean);
        return Boolean(
            url.searchParams.get('v')
            || ((parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') && parts[1])
        );
    } catch {
        return false;
    }
}

function getYouTubeVideoId(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        const parts = url.pathname.split('/').filter(Boolean);

        if (host === 'youtu.be') return parts[0] || '';
        if (url.searchParams.get('v')) return url.searchParams.get('v');
        if (['shorts', 'live', 'embed'].includes(parts[0])) return parts[1] || '';
        return '';
    } catch {
        return '';
    }
}

function downloadQueries(value) {
    const id = getYouTubeVideoId(value);
    const queries = [value];

    if (id) {
        queries.push(`https://youtube.com/watch?v=${id}`);
        queries.push(id);
    }

    return [...new Set(queries.filter(Boolean))];
}

function parseArgs(args) {
    const typeWords = new Set(['video', 'mp4', 'audio', 'mp3', 'song']);
    const url = args.find(arg => isYouTubeUrl(arg)) || args[0] || '';
    const typeWord = args.find(arg => typeWords.has(String(arg).toLowerCase()));
    const type = ['audio', 'mp3', 'song'].includes(String(typeWord || '').toLowerCase()) ? 'mp3' : 'mp4';

    return { url, type };
}

async function fetchDownload(url, type) {
    const quality = config.media?.mediaDownloadQuality || '360p';
    const attempts = [];

    for (const query of downloadQueries(url)) {
        const endpoint = `${PLAY_URL}?query=${encodeURIComponent(query)}&format=${encodeURIComponent(type)}&quality=${encodeURIComponent(quality)}`;

        try {
            const data = await requestJson(endpoint, {
                timeoutMs: config.media?.mediaDownloadTimeoutMs || 60000,
                service: 'YouTube Download API'
            });

            if (data?.downloadUrl) {
                return data;
            }

            attempts.push(`${query}: no download URL`);
        } catch (error) {
            attempts.push(`${query}: ${error.message || error}`);
        }
    }

    throw new Error(`No ${type === 'mp3' ? 'audio' : 'video'} found. Tried: ${attempts.join(' | ')}`);
}

module.exports = {
    config: {
        name: 'ytdl',
        aliases: ['downl'],
        version: '1.2.0',
        description: 'Download YouTube videos or audio',
        usage: 'ytdl <url> [video|audio]',
        examples: [
            'ytdl https://youtube.com/watch?v=...',
            'ytdl https://youtube.com/shorts/maT2Ozr4G48 video',
            'ytdl https://youtu.be/VIDEO_ID audio'
        ],
        permissions: 0,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const { url, type } = parseArgs(args);

        if (!url) {
            await sock.sendMessage(chat, { text: 'Please provide a YouTube URL.' }, { quoted: msg });
            return;
        }

        if (!isYouTubeUrl(url)) {
            await sock.sendMessage(chat, {
                text: 'Please provide a valid YouTube URL. Shorts links are supported.'
            }, { quoted: msg });
            return;
        }

        try {
            try {
                await sock.sendPresenceUpdate('uploading', chat);
            } catch {}

            await sock.sendMessage(chat, { text: `Downloading ${type === 'mp3' ? 'audio' : 'video'}... please wait.` }, { quoted: msg });

            const data = await fetchDownload(url, type);
            const title = data.title || 'YouTube download';
            const caption = [
                title,
                data.duration?.timestamp ? `Duration: ${data.duration.timestamp}` : '',
                data.quality ? `Quality: ${data.quality}` : '',
                data.fileSize ? `Size: ${data.fileSize}` : ''
            ].filter(Boolean).join('\n');

            if (type === 'mp3') {
                await sock.sendMessage(chat, {
                    audio: { url: data.downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false
                }, { quoted: msg });
                return;
            }

            await sock.sendMessage(chat, {
                video: { url: data.downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${title}.mp4`,
                caption
            }, { quoted: msg });
        } catch (error) {
            console.error('YTDL command error:', error);
            await sock.sendMessage(chat, {
                text: friendlyApiError(error, 'YouTube Download API')
            }, { quoted: msg });
        }
    }
};
