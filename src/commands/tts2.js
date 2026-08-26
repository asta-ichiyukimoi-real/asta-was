const say = require('say');
const fs = require('fs');
const path = require('path');

module.exports = {
    config: {
        name: 'say',
        aliases: ['tts', 'speak'],
        version: '1.0.0',
        description: 'Converts your text into a WhatsApp audio note',
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

        const tempAudioPath = path.join(__dirname, `../temp_audio_${Date.now()}.wav`);
        say.export(textToSpeak, null, 1.0, tempAudioPath, async (err) => {
            if (err) {
                console.error('TTS Error:', err);
                await sock.sendMessage(jid, { text: 'Failed to convert text to speech.' }, { quoted: msg });
                return;
            }

            try {
                await sock.sendMessage(jid, {
                    audio: { url: tempAudioPath },
                    mimetype: 'audio/mp4', 
                    ptt: true              
                }, { quoted: msg });

            } catch (sendError) {
                console.error('Failed to send audio:', sendError);
            } finally {                if (fs.existsSync(tempAudioPath)) {
                    fs.unlinkSync(tempAudioPath);
                }
            }
        });
    }
};
