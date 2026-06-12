const fetch = require('node-fetch');
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

module.exports = {
    config: {
        name: 'upimg2',
        aliases: ['imgurl', 'uploadimg'],
        version: '1.0.0',
        description: 'Upload an image and get a permanent URL',
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
                    {
                        text: '❌ Please send or reply to an image.'
                    },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: '📤 Uploading image...'
                },
                { quoted: msg }
            );

            const stream = await downloadContentFromMessage(
                imageMessage,
                'image'
            );

            const buffer = await streamToBuffer(stream);

            if (!buffer || buffer.length === 0) {
                throw new Error('Failed to download image.');
            }

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
            form.append('file', fs.createReadStream(tempPath));

            const response = await fetch(
                'https://discardapi.dpdns.org/api/catbox?apikey=guru',
                {
                    method: 'POST',
                    body: form
                }
            );

            const data = await response.json();

            console.log('Upload response:', data);

            if (data?.status && data?.result?.url) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
`✅ Image Uploaded Successfully

🔗 URL:
${data.result.url}`
                    },
                    { quoted: msg }
                );
            } else {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
`❌ Upload Failed

${data?.message || 'Unknown error'}`
                    },
                    { quoted: msg }
                );
            }
        } catch (error) {
            console.error('upimg2 error:', error);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
`❌ Error

${error.message}`
                },
                { quoted: msg }
            );
        } finally {
            if (tempPath && fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                } catch (e) {
                    console.error('Failed to delete temp file:', e);
                }
            }
        }
    }
};