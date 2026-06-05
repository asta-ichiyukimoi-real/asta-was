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

function getSender(msg) {
    return msg.key.participant || msg.key.remoteJid;
}

function getTargetJids(msg) {
    const contextInfo = getContextInfo(msg);
    const mentions = contextInfo?.mentionedJid || [];
    const quotedSender = contextInfo?.participant;

    if (mentions.length) return mentions;
    if (quotedSender) return [quotedSender];
    return [getSender(msg)];
}

module.exports = {
    config: {
        name: 'jid',
        aliases: ['myjid', 'id'],
        version: '1.0.0',
        description: 'Shows a user JID',
        usage: 'jid [@user]',
        examples: ['jid', 'jid @user'],
        permissions: 0,
        category: 'utility'
    },
    onRun: async (sock, msg) => {
        const targets = [...new Set(getTargetJids(msg).filter(Boolean))];
        const text = targets
            .map((jid, index) => `*${targets.length > 1 ? `${index + 1}. ` : ''}JID:*\n${jid}`)
            .join('\n\n');

        await sock.sendMessage(msg.key.remoteJid, {
            text: text || 'No JID found.'
        }, { quoted: msg });
    }
};
