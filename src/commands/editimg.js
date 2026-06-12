const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function findImageMessage(msg) {
    const directImage = msg.message?.imageMessage;
    if (directImage) return directImage;

    return (
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
        null
    );
}

async function uploadImage(buffer, tempPath) {
    fs.writeFileSync(tempPath, buffer);

    const form = new FormData();
    form.append('file', fs.createReadStream(tempPath));

    const response = await axios.post(
        'https://discardapi.dpdns.org/api/catbox?apikey=guru',
        form,
        {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        }
    );

    if (!response.data?.status || !response.data?.result?.url) {
        throw new Error('Failed to upload image.');
    }

    return response.data.result.url;
}

module.exports = {
    config: {
        name: 'edit',
        aliases: ['anime', 'editimg', 'toon'],
        version: '1.0.0',
        description: 'Transform images with AI',
        permissions: 0,
        cooldown: 10,
        category: 'ai'
    },

    onRun: async (sock, msg, args) => {
        let tempPath = null;

        try {
            const prompt = args.join(' ').trim();

            if (!prompt) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
`❌ Please provide a prompt.

Example:
.pti make it anime style`
                    },
                    { quoted: msg }
                );
            }

            const imageMessage = findImageMessage(msg);

            if (!imageMessage) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
`❌ Reply to an image.

Example:
.pti make it anime style`
                    },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: '🎨 Uploading image...'
                },
                { quoted: msg }
            );

            const stream = await downloadContentFromMessage(
                imageMessage,
                'image'
            );

            const buffer = await streamToBuffer(stream);

            const tempDir = path.join(__dirname, '../../temp');

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            tempPath = path.join(
                tempDir,
                `pti_${Date.now()}.jpg`
            );

            const imageUrl = await uploadImage(
                buffer,
                tempPath
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: '🖌️ Generating image...'
                },
                { quoted: msg }
            );

            const { data } = await axios.get(
                `https://api.nabees.online/api/ai/pti?prompt=${encodeURIComponent(prompt)}&image_url=${encodeURIComponent(imageUrl)}&ratio=auto`,
                {
                    timeout: 120000
                }
            );

            console.log('PTI RESPONSE:', data);

            if (!data?.data?.image_url) {
                throw new Error(
                    data?.message ||
                    'No image returned from API.'
                );
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: {
                        url: data.data.image_url
                    },
                    caption:
`✨ AI Image Generated

📝 Prompt: ${data.data.prompt}
🆔 Code: ${data.data.code}
📐 Ratio: ${data.data.ratio}`
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error('PTI ERROR:', error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`❌ Failed

${error.message}`
                },
                { quoted: msg }
            );
        } finally {
            if (tempPath && fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                } catch (err) {
                    console.error(err);
                }
            }
        }
    }
};