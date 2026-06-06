function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 5; i += 1) {
        const next = current.ephemeralMessage?.message
            || current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.documentWithCaptionMessage?.message;

        if (!next) break;
        current = next;
    }

    return current;
}

function getContextInfo(msg) {
    const message = unwrapMessage(msg.message);
    return message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || message.videoMessage?.contextInfo
        || message.documentMessage?.contextInfo
        || null;
}

module.exports = {
    config: {
        name: 'delete',
        aliases: ['del'],
        version: '1.1.0',
        description: 'Deletes a replied message',
        usage: 'delete',
        examples: ['delete'],
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },
    onRun: async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        const contextInfo = getContextInfo(msg);
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;

        if (!stanzaId) {
            await sock.sendMessage(chatId, {
                text: 'Reply to the message you want me to delete, then send .delete.'
            }, { quoted: msg });
            return;
        }

        try {
            await sock.sendMessage(chatId, {
                delete: {
                    remoteJid: chatId,
                    fromMe: Boolean(contextInfo?.fromMe),
                    id: stanzaId,
                    participant
                }
            });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: [
                    'I could not delete that message.',
                    'Possible reasons: I am not admin, the message is too old, or WhatsApp refused the delete.',
                    `Error: ${error.message || error}`
                ].join('\n')
            }, { quoted: msg });
        }
    }
};
