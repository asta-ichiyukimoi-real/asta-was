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

    return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || null;
}

module.exports = {
    config: {
        name: 'upimg2',
        aliases: ['imgurl', 'uploadimg'],
        version: '1.0.0',
        description: 'Upload an image and get a URL',
        permissions: 0,
        category: 'utility'
    },

    onRun: async (sock, msg) => {
        let tempPath = null;

        try {
            const imageMessage = findImageMessage(msg);

            if (!imageMessage) {
                return await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: '❌ Please send or reply to an image.' },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                { text: '📤 Uploading image...' },
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
                `upload_${Date.now()}.jpg`
            );

            fs.writeFileSync(tempPath, buffer);

            const form = new FormData();

            // Try "file" first
            form.append(
                'file',
                fs.createReadStream(tempPath)
            );

            const response = await axios.post(
                'https://discardapi.dpdns.org/api/catbox?apikey=guru',
                form,
                {
                    headers: form.getHeaders(),
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    validateStatus: () => true
                }
            );

            console.log('========== RESPONSE ==========');
            console.log('STATUS:', response.status);
            console.log('HEADERS:', response.headers);
            console.log('DATA:', response.data);
            console.log('==============================');

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`STATUS: ${response.status}

URL:
${response.result.url}`
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error('upimg2 error:', error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`❌ Error

${error.message}

${error.response?.data
    ? JSON.stringify(error.response.data, null, 2)
    : ''}`
                },
                { quoted: msg }
            );
        } finally {
            if (tempPath && fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
};