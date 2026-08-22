const state = require('../utils/stateManager');
const groupApproval = require('../utils/groupApproval');

function isGroupJid(value) {
    return String(value || '').endsWith('@g.us');
}

function senderIsBotAdmin(msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const handler = global.configCommandHandler;
    return (handler?.isOwner?.(sender, msg) || handler?.isAdmin?.(sender));
}

function getApprovedGroups() {
    if (typeof state.getApprovedGroups === 'function') {
        return state.getApprovedGroups();
    }

    return state.getState?.().groupApprovals?.approved || {};
}

function getPendingGroupApprovals() {
    if (typeof state.getPendingGroupApprovals === 'function') {
        return state.getPendingGroupApprovals();
    }

    return Object.values(state.getState?.().groupApprovals?.pending || {});
}
function resolveGroupId(msg, args) {
    if (isGroupJid(args[0])) return args[0];
    if (isGroupJid(msg.key.remoteJid)) return msg.key.remoteJid;
    return '';
}

module.exports = {
    config: {
        name: 'approvegroup',
        aliases: ['groupapprove', 'groupapproval'],
        version: '1.0.0',
        description: 'Approve or remove approval for groups using the bot',
        usage: 'approvegroup [approve|unapprove|list] [group_jid]',
        examples: ['approvegroup', 'approvegroup list', 'approvegroup unapprove 123@g.us'],
        permissions: 0,
        cooldown: 0,
        category: 'admin'
    },

    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;

        if (!senderIsBotAdmin(msg)) {
            await sock.sendMessage(chatId, {
                text: 'Only the bot owner or a bot admin can approve groups.'
            }, { quoted: msg });
            return;
        }

        const action = args[0]?.toLowerCase() || 'approve';

        if (action === 'list') {
            const approved = getApprovedGroups();
            const pending = getPendingGroupApprovals();
            const approvedLines = Object.keys(approved).sort();
            const pendingLines = pending
                .sort((a, b) => String(a.groupId).localeCompare(String(b.groupId)))
                .map(item => `${item.groupId} - leaves at ${item.leaveAt || 'unknown'}`);

            await sock.sendMessage(chatId, {
                text: [
                    '*Group Approvals*',
                    '',
                    '*Approved*',
                    approvedLines.length ? approvedLines.join('\n') : 'none',
                    '',
                    '*Pending*',
                    pendingLines.length ? pendingLines.join('\n') : 'none'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        const groupId = resolveGroupId(msg, action === 'approve' || action === 'unapprove' ? args.slice(1) : args);
        if (!groupId) {
            await sock.sendMessage(chatId, {
                text: 'Use this in a group, or send a group JID like: .approvegroup 123@g.us'
            }, { quoted: msg });
            return;
        }

        if (['unapprove', 'remove', 'revoke', 'delete'].includes(action)) {
            groupApproval.unapprove(groupId);
            await sock.sendMessage(chatId, {
                text: `Removed approval for ${groupId}.`
            }, { quoted: msg });
            return;
        }

        const sender = msg.key.participant || msg.key.remoteJid;
        groupApproval.approve(groupId, sender);

        await sock.sendMessage(chatId, {
            text: `Approved this group: ${groupId}`
        }, { quoted: msg });
    }
};