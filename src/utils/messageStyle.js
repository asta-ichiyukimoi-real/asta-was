const config = require('../../config');

function getConfig(path, fallback) {
    return global.configCommandHandler?.get?.(path, fallback) ?? fallback;
}

function getCommandImageUrl(commandName) {
    const commandImages = getConfig('assets.commandImages', config.assets?.commandImages || {});
    const defaultUrl = getConfig('assets.defaultCommandImageUrl', config.assets?.defaultCommandImageUrl || '');
    const commandUrl = commandImages?.[commandName];

    return String(commandUrl || defaultUrl || '').trim();
}

async function sendStyledMessage(sock, chatId, text, options = {}) {
    const quoted = options.quoted;
    const imageUrl = options.imageUrl || getCommandImageUrl(options.commandName);
    const messageOptions = quoted ? { quoted } : undefined;

    if (imageUrl) {
        try {
            return await sock.sendMessage(chatId, {
                image: { url: imageUrl },
                caption: text
            }, messageOptions);
        } catch (error) {
            console.warn(`Image message failed for ${options.commandName || 'command'}: ${error.message}`);
        }
    }

    return sock.sendMessage(chatId, { text }, messageOptions);
}

module.exports = {
    getCommandImageUrl,
    sendStyledMessage
};
