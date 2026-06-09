const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const ALL_URL = 'https://omegatech-api.dixonomega.tech/api/download/all';
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

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

function parseArgs(args) {
    const typeWords = new Set(['video', 'mp4', 'audio', 'mp3', 'song']);
    const url = args.find(arg => isYouTubeUrl(arg)) || args[0] || '';
    const typeWord = args.find(arg => typeWords.has(String(arg).toLowerCase()));
    const type = ['audio', 'mp3', 'song'].includes(String(typeWord || '').toLowerCase()) ? 'audio' : 'video';

    return { url, type };
}

function safeName(value, extension) {
    const base = String(value || 'youtube-download')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'youtube-download';

    return `${base}.${extension}`;
}

function pickMediaFile(result, type) {
    if (type === 'audio') {
        return result.audio?.find(item => /mp3/i.test(item.label || item.mimeType || ''))
            || result.audio?.find(item => /m4a|opus/i.test(item.label || item.mimeType || ''))
            || result.audio?.[result.audio.length - 1];
    }

    return result.video?.find(item => /360p/i.test(item.label || ''))
        || result.video?.find(item => /mp4/i.test(item.label || item.mimeType || ''))
        || result.video?.[0];
}

function extensionFor(mediaFile, type) {
    const label = `${mediaFile?.label || ''} ${mediaFile?.mimeType || ''}`.toLowerCase();
    if (type === 'audio') {
        if (label.includes('m4a')) return 'm4a';
        if (label.includes('opus')) return 'opus';
        return 'mp3';
    }

    return 'mp4';
}

async function fetchAllDownload(url) {
    const endpoint = `${ALL_URL}?url=${encodeURIComponent(url)}`;
    const response = await axios.get(endpoint, {
        timeout: config.media?.mediaDownloadTimeoutMs || 60000,
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' }
    });

    if (!response.data?.success) {
        throw new Error(response.data?.message || response.data?.error || 'Download API could not fetch this YouTube URL.');
    }

    return response.data.result || response.data;
}

async function downloadToTemp(url, fileName) {
    const tempPath = path.join(os.tmpdir(), `${Date.now()}-${fileName}`);
    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: config.media?.mediaDownloadTimeoutMs || 60000,
        maxRedirects: 5,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
            Accept: '*/*',
            Referer: 'https://www.youtube.com/'
        },
        validateStatus: status => status >= 200 && status < 400
    });

    const contentLength = Number(response.headers['content-length'] || 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
        throw new Error(`File is too large (${Math.round(contentLength / 1024 / 1024)} MB).`);
    }

    let downloaded = 0;
    const writer = fs.createWriteStream(tempPath);

    await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (downloaded > MAX_DOWNLOAD_BYTES) {
                response.data.destroy(new Error('File exceeded download size limit.'));
            }
        });
        response.data.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        response.data.pipe(writer);
    });

    return tempPath;
}

function removeTemp(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
}

module.exports = {
    config: {
        name: 'ytdl',
        aliases: ['downl'],
        version: '1.3.0',
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
        let tempPath = '';

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

            await sock.sendMessage(chat, {
                text: `Fetching ${type} link and preparing upload...`
            }, { quoted: msg });

            const result = await fetchAllDownload(url);
            const mediaFile = pickMediaFile(result, type);

            if (!mediaFile?.url) {
                await sock.sendMessage(chat, {
                    text: `No ${type} file was found for this YouTube URL.`
                }, { quoted: msg });
                return;
            }

            const title = result.title || result.videoTitle || result.details?.title || 'YouTube download';
            const extension = extensionFor(mediaFile, type);
            const fileName = safeName(title, extension);

            await sock.sendMessage(chat, {
                text: `Downloading to temp file...\nQuality: ${mediaFile.label || 'unknown'}`
            }, { quoted: msg });

            tempPath = await downloadToTemp(mediaFile.url, fileName);

            if (type === 'audio') {
                await sock.sendMessage(chat, {
                    audio: { url: tempPath },
                    mimetype: mediaFile.mimeType || 'audio/mpeg',
                    fileName,
                    ptt: false
                }, { quoted: msg });
                return;
            }

            await sock.sendMessage(chat, {
                video: { url: tempPath },
                mimetype: mediaFile.mimeType || 'video/mp4',
                fileName,
                caption: `${title}\nQuality: ${mediaFile.label || 'unknown'}`
            }, { quoted: msg });
        } catch (error) {
            console.error('YTDL command error:', error);

            const status = error.response?.status || error.status;
            const text = status === 403
                ? 'The raw YouTube file link returned 403 even when the bot tried to download it first. That means the link is restricted to another IP/session.'
                : `Download failed: ${error.message || error}`;

            await sock.sendMessage(chat, { text }, { quoted: msg });
        } finally {
            removeTemp(tempPath);
        }
    }
};
