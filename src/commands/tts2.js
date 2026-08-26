const googleTTS = require('google-tts-api');

module.exports = {
    config: {
        name: 'say',
        aliases: ['tts', 'speak'],
        version: '1.0.0',
        description: 'Converts your text into a WhatsApp audio note using Google TTS',
        usage: 'say <text>',
        examples: ['say Hello group! How are you doing?'],
        permissions: 0, 
        category: 'utility'
    },
    onRun: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;

        const textToSpeak = args.join(' ');

        if (!textToSpeak.trim()) {
            await sock.sendMessage(jid, { text: 'Please provide some text to convert to audio.' }, { quoted: msg });
            return;
        }

        if (textToSpeak.length > 200) {
            await sock.sendMessage(jid, { text: 'Text is too long! Please keep it under 200 characters.' }, { quoted: msg });
            return;
        }

        try {
            const audioUrl = googleTTS.getAudioUrl(textToSpeak, {
                lang: 'en',     
                slow: false,   
                host: 'https://google.com',
            });
            await sock.sendMessage(jid, {
                audio: { url: audioUrl },
                mimetype: 'audio/mp4',
                ptt: true 
            }, { quoted: msg });

        } catch (error) {
            console.error('Google TTS Error:', error);
            await sock.sendMessage(jid, { text: 'Failed to process speech conversion.' }, { quoted: msg });
        }
    }
};
