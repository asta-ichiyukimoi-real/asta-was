function normalizeJid(value) {
    if (typeof value !== 'string') return '';
    const jid = value.trim().toLowerCase();
    const separator = jid.indexOf('@');
    if (separator < 0) return jid.replace(/:\d+$/, '');

    const localPart = jid.slice(0, separator).replace(/:\d+$/, '');
    return `${localPart}${jid.slice(separator)}`;
}

function isGroupAdmin(participants, sender) {
    const senderId = normalizeJid(sender);
    if (!senderId || !Array.isArray(participants)) return false;

    return participants.some((participant) => {
        if (!participant || !['admin', 'superadmin'].includes(participant.admin)) return false;

        const ids = typeof participant === 'string'
            ? [participant]
            : [participant.id, participant.lid, participant.phoneNumber].filter(Boolean);
        return ids.some(id => normalizeJid(id) === senderId);
    });
}

async function isSenderGroupAdmin(sock, groupId, sender) {
    if (!String(groupId || '').endsWith('@g.us')) return false;
    const metadata = await sock.groupMetadata(groupId);
    return isGroupAdmin(metadata.participants, sender);
}

function hasCommandPermission(level, { isOwner, isBotAdmin, isGroupAdmin: senderIsGroupAdmin }) {
    if (level === 0) return true;
    if (level === 1) return isOwner || isBotAdmin;
    if (level === 2) return isOwner || isBotAdmin || senderIsGroupAdmin;
    return false;
}

module.exports = {
    normalizeJid,
    isGroupAdmin,
    isSenderGroupAdmin,
    hasCommandPermission
};
