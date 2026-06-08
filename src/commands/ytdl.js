const axios = require('axios');
const statsManager = require('../models/stats');

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

async function record(command, chat, sender, status) {
    try {
        await statsManager.recordCommand(command, chat, sender, 0, status);
    } catch {}
}

module.exports = {
    config: {
        name: 'ytdl',
        aliases: ['downl'],
        version: '1.1.0',
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
        const sender = msg.key.participant || msg.key.remoteJid;
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

            await sock.sendMessage(chat, { text: 'Downloading... please wait.' }, { quoted: msg });

            const apiUrl = `https://omegatech-api.dixonomega.tech/api/download/all?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });

            if (!response.data?.success) {
                await sock.sendMessage(chat, { text: 'Failed to download this YouTube link.' }, { quoted: msg });
                await record('ytdl', chat, sender, 'error');
                return;
            }

            const result = response.data.result || response.data;

            if (type === 'audio') {
                const audioFile = result.audio?.find(item => /opus \(159kb\/s\)/i.test(item.label || ''))
                    || result.audio?.find(item => /m4a \(131kb\/s\)/i.test(item.label || ''))
                    || result.audio?.[result.audio.length - 1];

                if (!audioFile?.url) {
                    await sock.sendMessage(chat, { text: 'No audio file was found for this video.' }, { quoted: msg });
                    await record('ytdl', chat, sender, 'error');
                    return;
                }

                await sock.sendMessage(chat, {
                    audio: { url: audioFile.url },
                    mimetype: audioFile.mimeType || 'audio/mpeg',
                    ptt: false
                }, { quoted: msg });

                await record('ytdl', chat, sender, 'success');
                await sock.sendMessage(chat, {
                    text: `Audio downloaded.\nQuality: ${audioFile.label || 'unknown'}`
                }, { quoted: msg });
                return;
            }

            const videoFile = result.video?.find(item => item.label === 'mp4 (360p)')
                || result.video?.find(item => /360p/i.test(item.label || ''))
                || result.video?.find(item => /mp4/i.test(item.label || ''))
                || result.video?.[0];

            if (!videoFile?.url) {
                await sock.sendMessage(chat, { text: 'No video file was found for this link.' }, { quoted: msg });
                await record('ytdl', chat, sender, 'error');
                return;
            }

            await sock.sendMessage(chat, {
                video: { url: videoFile.url },
                mimetype: videoFile.mimeType || 'video/mp4',
                caption: `Video downloaded.\nQuality: ${videoFile.label || 'unknown'}`
            }, { quoted: msg });

            await record('ytdl', chat, sender, 'success');
        } catch (error) {
            console.error('YTDL command error:', error);

            let errorMessage = 'Error downloading video.';
            if (error.code === 'ECONNABORTED') {
                errorMessage = 'Download timeout. The video might be too long.';
            } else if (error.response?.status === 404) {
                errorMessage = 'Video not found.';
            } else if (error.message) {
                errorMessage = `Download failed: ${error.message}`;
            }

            await sock.sendMessage(chat, { text: errorMessage }, { quoted: msg });
            await record('ytdl', chat, sender, 'error');
        }
    }
};
