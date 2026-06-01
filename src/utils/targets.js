function getContextInfo(msg) {
    return msg.message?.extendedTextMessage?.contextInfo || {};
}

function getMentionedJids(msg) {
    return getContextInfo(msg).mentionedJid || [];
}

function getQuotedSender(msg) {
    return getContextInfo(msg).participant || null;
}

function getTargetJids(msg) {
    const targets = new Set();

    getMentionedJids(msg).forEach(jid => targets.add(jid));

    const quotedSender = getQuotedSender(msg);
    if (quotedSender) targets.add(quotedSender);

    return Array.from(targets);
}

function formatMentions(jids) {
    return jids.map(jid => `@${jid.split('@')[0]}`).join(', ');
}

module.exports = {
    getTargetJids,
    formatMentions
};
