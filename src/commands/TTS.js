module.exports = {
    config: {
        name: 'tts',
        aliases: ['text2speech'],
        version: '1.0.0',
        description: 'Replies with pong to check bot responsiveness',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        try{
        const message = args.join(' ').trim();

         if (!message) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please provide a query. Example: .tts hello asta'
            }, { quoted: msg });
            return;
        }

        const fullUrl = `https://omegatech-api.dixonomega.tech/api/ai/text2speech-v3?text=${encodeURIComponent}&voice=man1&language=en`;
        await sock.sendMessage(chatId, {
                            audio: { url: ttsData.audio },
                            mimetype: 'audio/mpeg',
                            ptt: false
                        });
                    } catch(err) {
                        await sock.sendMessage(msg.key.remoteJid, {
                text: `an error occured ${err.message}`
            }, { quoted: msg });
                    }
    }
};
