const sharp = require('sharp');

async function imageToStickerBuffer(imageBuffer) {
    return sharp(imageBuffer, { animated: true })
        .rotate()
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            withoutEnlargement: true
        })
        .webp({
            quality: 85,
            effort: 4
        })
        .toBuffer();
}

async function sendImageSticker(sock, chatId, imageBuffer, options = {}) {
    const sticker = await imageToStickerBuffer(imageBuffer);
    await sock.sendMessage(chatId, { sticker }, options);
}

module.exports = {
    imageToStickerBuffer,
    sendImageSticker
};
