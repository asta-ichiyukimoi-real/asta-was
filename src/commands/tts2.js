const googleTTS = require('google-tts-api');
const { spawn } = require('child_process');

function convertToOpus(inputBuffer) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-vn',
            '-c:a', 'libopus',
            '-b:a', '48k',
            '-ar', '48000',
            '-ac', '1',
            '-application', 'voip',
            '-f', 'ogg',
            'pipe:1'
        ]);

        const chunks = [];
        const errors = [];

        ffmpeg.stdout.on('data', chunk => {
            chunks.push(chunk);
        });

        ffmpeg.stderr.on('data', chunk => {
            errors.push(chunk);
        });

        ffmpeg.on('error', error => {
            reject(error);
        });

        ffmpeg.on('close', code => {
            if (code !== 0) {
                reject(new Error(
                    Buffer.concat(errors).toString() ||
                    `FFmpeg exited with code ${code}`
                ));
                return;
            }

            const output = Buffer.concat(chunks);

            if (!output.length) {
                reject(new Error('FFmpeg produced an empty audio file.'));
                return;
            }

            resolve(output);
        });

        ffmpeg.stdin.on('error', () => {});
        ffmpeg.stdin.end(inputBuffer);
    });
}

module.exports = {
    config: {
        name: 'say',
        aliases: ['tts', 'speak'],
        version: '2.0.0',
        description: 'Converts text into a WhatsApp-compatible voice note',
        usage: 'say <text>',
        examples: [
            'say Hello everyone'
        ],
        permissions: 0,
        category: 'utility'
    },

    onRun: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const textToSpeak = args.join(' ').trim();

        if (!textToSpeak) {
            await sock.sendMessage(
                jid,
                {
                    text: 'Please provide some text to convert to audio.'
                },
                { quoted: msg }
            );
            return;
        }

        if (textToSpeak.length > 800) {
            await sock.sendMessage(
                jid,
                {
                    text: 'Text is too long! Please keep it under 800 characters.'
                },
                { quoted: msg }
            );
            return;
        }

        try {
            await sock.sendPresenceUpdate('recording', jid);

            const base64Audio = await googleTTS.getAudioBase64(
                textToSpeak,
                {
                    lang: 'en',
                    slow: false,
                    host: 'https://translate.google.com',
                    timeout: 10000
                }
            );

            if (!base64Audio) {
                throw new Error('Google TTS returned empty audio.');
            }

            const mp3Buffer = Buffer.from(base64Audio, 'base64');

            if (!mp3Buffer.length) {
                throw new Error('Generated MP3 buffer is empty.');
            }

            const opusAudio = await convertToOpus(mp3Buffer);

            await sock.sendMessage(
                jid,
                {
                    audio: opusAudio,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                },
                { quoted: msg }
            );

            await sock.sendPresenceUpdate('paused', jid);
        } catch (error) {
            console.error('Audio Generation Error:', error);

            try {
                await sock.sendPresenceUpdate('paused', jid);
            } catch {}

            await sock.sendMessage(
                jid,
                {
                    text: `Failed to generate the voice note.\n\n${error.message || error}`
                },
                { quoted: msg }
            );
        }
    }
};