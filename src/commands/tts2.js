const googleTTS = require('google-tts-api'); // Using the package you already installed

module.exports = {
    config: {
        name: 'say',
        aliases: ['tts', 'speak'],
        version: '1.2.0',
        description: 'Converts text into a WhatsApp audio note safely using local base64 encoding',
        usage: 'say <text>',
        examples: ['say Hello group! This layout works perfectly.'],
        permissions: 0, // Everyone can use it
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
            const base64Audio = await googleTTS.getAudioBase64(textToSpeak, {
                lang: 'en',
                slow: false,
                host: 'https://translate.google.com',
                timeout: 10000,
            });

            const localAudioUrl = `data:audio/mp3;base64,${base64Audio}`;
            await sock.sendMessage(jid, {
                audio: { url: localAudioUrl },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true 
            }, { quoted: msg });

        } catch (error) {
            console.error('Audio Generation Error:', error);
            await sock.sendMessage(jid, { text: 'Failed to safely generate the audio note.' }, { quoted: msg });
        }
    }
};
