const axios = require('axios');
const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'ytdl',
        aliases: ['youtube', 'yt', 'download'],
        version: '1.0.0',
        description: 'Download YouTube videos or audio',
        usage: 'ytdl <url> [video|audio]',
        examples: ['ytdl https://youtube.com/watch?v=...', 'ytdl https://youtube.com/shorts/... audio'],
        permissions: 0,
        category: 'media'
    },


    onRun: async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const url = args[1];
        const type = (args[2] || 'video').toLowerCase();

        if (!url) {
            await sock.sendMessage(chat, { text: '❌ Please provide a YouTube URL' }, { quoted: msg });
            return;
        }

        // Validate YouTube URL
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
            await sock.sendMessage(chat, { text: '❌ Please provide a valid YouTube URL' }, { quoted: msg });
            return;
        }

        try {
            await sock.sendMessage(chat, { text: '⏳ Downloading... please wait' }, { quoted: msg });

            // Call the download API
            const apiUrl = `https://omegatech-api.dixonomega.tech/api/download/all?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });

            if (!response.data.success) {
                await sock.sendMessage(chat, { text: '❌ Failed to download video' }, { quoted: msg });
                await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'error');
                return;
            }

            const result = response.data.result;

            if (type === 'audio') {
                // Get best quality audio (opus 159kb/s preferred, fallback to m4a 131kb/s)
                let audioFile = result.audio?.find(a => a.label.includes('opus (159kb/s)')) ||
                                result.audio?.find(a => a.label.includes('m4a (131kb/s)')) ||
                                result.audio?.[result.audio.length - 1];

                if (!audioFile) {
                    await sock.sendMessage(chat, { text: '❌ No audio found for this video' }, { quoted: msg });
                    await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'error');
                    return;
                }

                await sock.sendMessage(chat, { 
                    audio: { url: audioFile.url },
                    mimetype: audioFile.mimeType || 'audio/mpeg',
                    ptt: false
                }, { quoted: msg });

                await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'success');
                await sock.sendMessage(chat, { 
                    text: `🎵 Audio downloaded\n\n🏷️ Quality: ${audioFile.label}` 
                }, { quoted: msg });
            } else {
                // Get 360p video
                const videoFile = result.video?.find(v => v.label === 'mp4 (360p)');

                if (!videoFile) {
                    await sock.sendMessage(chat, { text: '❌ 360p quality not available for this video' }, { quoted: msg });
                    await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'error');
                    return;
                }

                // Send video
                await sock.sendMessage(chat, { 
                    video: { url: videoFile.url },
                    mimetype: videoFile.mimeType || 'video/mp4',
                    caption: '🎬 Video Downloaded'
                }, { quoted: msg });

                await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'success');
            }
        } catch (error) {
            console.error('Error downloading video:', error.message);
            
            let errorMsg = '❌ Error downloading video';
            if (error.code === 'ECONNABORTED') {
                errorMsg = '❌ Download timeout - video might be too long';
            } else if (error.response?.status === 404) {
                errorMsg = '❌ Video not found';
            }

            await sock.sendMessage(chat, { text: errorMsg }, { quoted: msg });
            await statsManager.recordCommand('ytdl', chat, msg.key.participant, 0, 'error');
        }
    }
};
