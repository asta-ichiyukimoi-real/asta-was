const axios = require('axios');

module.exports = {
    config: {
        name: 'anime',
        aliases: ['pti', 'img2anime'],
        version: '1.0.0',
        description: 'Transform an image using the PTI AI API',
        permissions: 0,
        category: 'ai'
    },

    onRun: async (sock, msg, args) => {
        try {
            const prompt = args.join(' ');

            if (!prompt) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: '❌ Please provide a prompt.\n\nExample:\nanime make it anime style'
                    },
                    { quoted: msg }
                );
            }

            // Check if user replied to an image
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quoted || !quoted.imageMessage) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: '❌ Reply to an image and provide a prompt.\n\nExample:\nanime make it anime style'
                    },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                { text: '🎨 Processing image, please wait...' },
                { quoted: msg }
            );

            // Download image
            const buffer = await sock.downloadMediaMessage({
                message: quoted
            });

            // Upload image somewhere
            // Replace this with your uploader
            const imageUrl = await global.utils.uploadImage(buffer);

            const apiUrl =
                `https://api.nabees.online/api/ai/pti?prompt=${encodeURIComponent(prompt)}&image_url=${encodeURIComponent(imageUrl)}&ratio=auto`;

            const { data } = await axios.get(apiUrl);

            if (!data?.data?.image_url) {
                throw new Error('No image returned from API');
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: { url: data.data.image_url },
                    caption:
`✨ Image Generated Successfully

📝 Prompt: ${data.data.prompt}
🆔 Code: ${data.data.code}
📐 Ratio: ${data.data.ratio}`
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error(error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `❌ Failed to generate image.\n\n${error.message}`
                },
                { quoted: msg }
            );
        }
    }
};