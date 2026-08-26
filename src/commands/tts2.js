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
        
        // 1. Combine user arguments into a clean string
        const textToSpeak = args.join(' ');

        if (!textToSpeak.trim()) {
            await sock.sendMessage(jid, { text: 'Please provide some text to convert to audio.' }, { quoted: msg });
            return;
        }

        // Google TTS limits single requests to 200 characters
        if (textToSpeak.length > 200) {
            await sock.sendMessage(jid, { text: 'Text is too long! Please keep it under 200 characters.' }, { quoted: msg });
            return;
        }

        try {
            // 2. Fetch the text compilation strictly as raw base64 data string
            const base64Audio = await googleTTS.getAudioBase64(textToSpeak, {
                lang: 'en',
                slow: false,
                host: 'https://translate.google.com',
                timeout: 10000,
            });

            // 3. Construct a standard local data URI pointer
            const localAudioUrl = `data:audio/mp3;base64,${base64Audio}`;

            // 4. Send directly to WhatsApp via Baileys buffer handling
            await sock.sendMessage(jid, {
                audio: { url: localAudioUrl },
                mimetype: 'audio/mp4', // Forces audio player scaling on WhatsApp mobile devices
                ptt: true 
            }, { quoted: msg });

        } catch (error) {
            console.error('Audio Generation Error:', error);
            await sock.sendMessage(jid, { text: 'Failed to safely generate the audio note.' }, { quoted: msg });
        }
    }
};
