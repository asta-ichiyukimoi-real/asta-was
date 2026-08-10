const state = require('../utils/stateManager');
const { findMediaMessage, downloadMediaToBuffer, getMessageText } = require('../utils/media');
const { imageToStickerBuffer } = require('../utils/sticker');

function senderFromMessage(msg) {
    return msg.key.participant || msg.key.remoteJid;
}

function isOwner(msg) {
    return Boolean(global.configCommandHandler?.isOwner?.(senderFromMessage(msg), msg));
}

function normalizeEmoji(value) {
    return String(value || '').trim();
}

function savedPreview(targetMessage) {
    const text = getMessageText(targetMessage);
    if (text) return text.slice(0, 500);

    const media = findMediaMessage(targetMessage, ['image', 'video', 'document', 'audio']);
    return media ? `[${media.kind} message]` : '[message]';
}

module.exports = {
    config: {
        name: 'reactions',
        aliases: ['reactionshortcuts'],
        version: '1.0.0',
        description: 'Reaction shortcuts for bot actions',
        usage: 'react to messages',
        examples: ['React 🗑️ to a bot message', 'React 🎨 to an image', 'React ⭐ to save'],
        permissions: 0,
        cooldown: 0,
        category: 'utility'
    },

    onRun: async (sock, msg) => {
        await sock.sendMessage(msg.key.remoteJid, {
            text: [
                '*Reaction Shortcuts*',
                '🗑️ delete a bot message',
                '🎨 make an image into a sticker',
                '⭐ save a message to bot logs'
            ].join('\n')
        }, { quoted: msg });
    },

    onReaction: async (sock, msg, reaction) => {
        const emoji = normalizeEmoji(reaction.text);
        const chatId = reaction.key?.remoteJid || msg.key.remoteJid;
        const targetMessage = reaction.targetMessage || null;

        if (!emoji) return false;

        if (emoji === '🗑️') {
            if (!targetMessage?.key?.fromMe) return false;
            if (!isOwner(msg)) {
                await sock.sendMessage(chatId, { text: 'Only the owner can delete bot messages by reaction.' }, { quoted: msg });
                return true;
            }

            await sock.sendMessage(chatId, { delete: targetMessage.key });
            return true;
        }

        if (emoji === '🎨' || emoji === '🖼️') {
            if (!targetMessage) return false;

            const media = findMediaMessage(targetMessage, ['image']);
            if (!media) return false;

            try {
                const imageBuffer = await downloadMediaToBuffer(media.message, media.kind);
                const stickerBuffer = await imageToStickerBuffer(imageBuffer);
                await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: targetMessage });
            } catch (error) {
                await sock.sendMessage(chatId, {
                    text: `Could not create sticker from reaction:\n${String(error.message || error).slice(0, 1000)}`
                }, { quoted: msg });
            }
            return true;
        }

        if (emoji === '⭐') {
            if (!targetMessage) return false;

            const saved = state.addSavedMessage({
                chatId,
                savedBy: senderFromMessage(msg),
                messageId: targetMessage.key?.id || null,
                fromMe: Boolean(targetMessage.key?.fromMe),
                preview: savedPreview(targetMessage)
            });

            await sock.sendMessage(chatId, {
                text: `Saved message ${saved.id}.`
            }, { quoted: targetMessage });
            return true;
        }

        return false;
    }
};
