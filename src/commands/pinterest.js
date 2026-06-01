const config = require('../../config');
const axios = require('axios');

module.exports = {
    config: {
        name: 'pinterest',
        aliases: ['pin', 'pinsearch'],
        version: '1.0.0',
        description: 'Search images on Pinterest',
        permissions: 0,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ');

        if (!query) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Please provide a search query.\n\n*Example:*.pinterest anime girl'
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `🔍 Searching Pinterest for *${query}*...`
            }, { quoted: msg });

            const { data } = await axios.get(
                `https://api.nabees.online/api/pinterest/search?q=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            );

            if (data.status!== 200 ||!data.data.images.length) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '😕 No images found for that query.'
                }, { quoted: msg });
            }

            const images = data.data.images.slice(0, 5); // limit to 5 to avoid spam
            const caption = `*📌 Pinterest Results for:* ${data.data.query}\n` +
                           `*Total Found:* ${data.data.total}\n\n` +
                           `_Powered by ${data.creator.name}_`;

            // Send images one by one
            for (let i = 0; i < images.length; i++) {
                await sock.sendMessage(msg.key.remoteJid, {
                    image: { url: images[i] },
                    caption: i === 0? caption : ''
                }, { quoted: i === 0? msg : undefined });

                await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay between images
            }

        } catch (err) {
            console.error('Pinterest command error:', err);
            await sock.sendMessage(msg.key.remoteJid, {
                text: '⚠️ Failed to fetch images. The API might be down or rate limited.'
            }, { quoted: msg });
        }
    }
};