const sharp = require('sharp');

async function imageToStickerBuffer(imageBuffer, name = 'ASTA BOT') {
    const metadata = await sharp(imageBuffer).metadata();

    const width = metadata.width || 512;
    const height = metadata.height || 512;

    const scale = Math.min(480 / width, 480 / height, 1);

    const resizedWidth = Math.max(1, Math.round(width * scale));
    const resizedHeight = Math.max(1, Math.round(height * scale));

    const image = await sharp(imageBuffer)
        .rotate()
        .resize(resizedWidth, resizedHeight, {
            fit: 'inside'
        })
        .png()
        .toBuffer();

    const watermark = Buffer.from(`
        <svg width="512" height="512">
            <style>
                .name {
                    font-family: Arial, sans-serif;
                    font-size: 22px;
                    font-weight: bold;
                    fill: white;
                    stroke: black;
                    stroke-width: 4px;
                    paint-order: stroke fill;
                }
            </style>
            <text
                x="256"
                y="493"
                text-anchor="middle"
                class="name"
            >${String(name)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;')}</text>
        </svg>
    `);

    return sharp({
        create: {
            width: 512,
            height: 512,
            channels: 4,
            background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
            }
        }
    })
        .composite([
            {
                input: image,
                gravity: 'center'
            },
            {
                input: watermark,
                gravity: 'center'
            }
        ])
        .webp({
            quality: 90,
            effort: 4
        })
        .toBuffer();
}

async function sendImageSticker(sock, chatId, imageBuffer, options = {}) {
    const sticker = await imageToStickerBuffer(imageBuffer, 'ASTA BOT');

    await sock.sendMessage(
        chatId,
        { sticker },
        options
    );
}

module.exports = {
    imageToStickerBuffer,
    sendImageSticker
};