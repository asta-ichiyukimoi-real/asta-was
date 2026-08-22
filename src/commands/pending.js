const state = require('../utils/stateManager');
const groupApproval = require('../utils/groupApproval');

const pendingSessions = new Map();

function getSender(msg) {
    return msg.key.participant || msg.key.remoteJid;
}

function sessionKey(msg) {
    return `${msg.key.remoteJid}:${getSender(msg)}`;
}

function senderIsBotAdmin(msg) {
    const sender = getSender(msg);
    const handler = global.configCommandHandler;
    return Boolean(handler?.isOwner?.(sender, msg) || handler?.isAdmin?.(sender));
}

function getPendingGroupApprovals() {
    if (typeof state.getPendingGroupApprovals === 'function') {
        return state.getPendingGroupApprovals();
    }

    return Object.values(state.getState?.().groupApprovals?.pending || {});
}
function getPendingGroups() {
    return getPendingGroupApprovals()
        .filter(item => item?.groupId)
        .sort((a, b) => {
            const left = Date.parse(a.addedAt || '') || 0;
            const right = Date.parse(b.addedAt || '') || 0;
            return left - right || String(a.groupId).localeCompare(String(b.groupId));
        });
}

function formatPendingList(pending) {
    return pending.map((item, index) => {
        const name = item.groupName || 'Unknown group';
        const leaveAt = item.leaveAt || 'unknown';
        return `${index + 1}. ${name}\n   JID: ${item.groupId}\n   Leaves: ${leaveAt}`;
    }).join('\n\n');
}

function parseSelection(text, total) {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return [];
    if (['all', 'approve all'].includes(normalized)) {
        return Array.from({ length: total }, (_, index) => index);
    }

    const indexes = normalized
        .split(/[\s,]+/)
        .map(value => Number.parseInt(value, 10))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= total)
        .map(value => value - 1);

    return [...new Set(indexes)];
}

async function showPending(sock, msg) {
    const chatId = msg.key.remoteJid;
    const pending = getPendingGroups();

    if (!pending.length) {
        pendingSessions.delete(sessionKey(msg));
        await sock.sendMessage(chatId, { text: 'There are no pending groups right now.' }, { quoted: msg });
        return;
    }

    pendingSessions.set(sessionKey(msg), {
        groups: pending.map(item => item.groupId),
        createdAt: Date.now()
    });

    await sock.sendMessage(chatId, {
        text: [
            '*Pending Groups*',
            '',
            formatPendingList(pending),
            '',
            'Reply with the number to approve it, like 1.',
            'You can approve multiple groups with 1 2, or reply all.',
            '[REPLY_ID:pending]'
        ].join('\n')
    }, { quoted: msg });
}

module.exports = {
    config: {
        name: 'pending',
        aliases: ['pendinggroups', 'grouppending'],
        version: '1.0.0',
        description: 'Show pending groups and approve them by replying with numbers',
        usage: 'pending',
        examples: ['pending'],
        permissions: 0,
        cooldown: 0,
        category: 'admin'
    },

    onRun: async (sock, msg) => {
        if (!senderIsBotAdmin(msg)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Only the bot owner or a bot admin can view pending groups.'
            }, { quoted: msg });
            return;
        }

        await showPending(sock, msg);
    },

    onReply: async (sock, msg, replyText) => {
        const chatId = msg.key.remoteJid;

        if (!senderIsBotAdmin(msg)) {
            await sock.sendMessage(chatId, {
                text: 'Only the bot owner or a bot admin can approve pending groups.'
            }, { quoted: msg });
            return;
        }

        const session = pendingSessions.get(sessionKey(msg));
        if (!session || Date.now() - session.createdAt > 10 * 60 * 1000) {
            pendingSessions.delete(sessionKey(msg));
            await sock.sendMessage(chatId, {
                text: 'That pending list expired. Run .pending again.'
            }, { quoted: msg });
            return;
        }

        const indexes = parseSelection(replyText, session.groups.length);
        if (!indexes.length) {
            await sock.sendMessage(chatId, {
                text: 'Reply with a valid number from the pending list, like 1 or 1 2.'
            }, { quoted: msg });
            return;
        }

        const sender = getSender(msg);
        const approved = indexes.map(index => session.groups[index]).filter(Boolean);
        approved.forEach(groupId => groupApproval.approve(groupId, sender));
        pendingSessions.delete(sessionKey(msg));

        await sock.sendMessage(chatId, {
            text: [
                `Approved ${approved.length} pending group${approved.length === 1 ? '' : 's'}:`,
                approved.map(groupId => `- ${groupId}`).join('\n')
            ].join('\n')
        }, { quoted: msg });
    }
};