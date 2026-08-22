const config = require('../../config');
const state = require('./stateManager');
const logger = require('./logger');

const DEFAULT_LEAVE_AFTER_MS = 30 * 60 * 1000;
const timers = new Map();

function getLeaveAfterMs(configCommandHandler = null) {
    return configCommandHandler?.get?.('groupApproval.leaveAfterMs', config.groupApproval?.leaveAfterMs)
        || DEFAULT_LEAVE_AFTER_MS;
}

function isGroupJid(groupId) {
    return String(groupId || '').endsWith('@g.us');
}

function getApprovalCommand(prefix = '.') {
    return `${prefix}approvegroup`;
}

async function safeSendMessage(sock, jid, content, options, logType = 'group_approval_send_error') {
    try {
        await sock.sendMessage(jid, content, options);
        return true;
    } catch (error) {
        logger.log(logType, {
            chatId: jid,
            error: error.message,
            code: error.data || error.output?.statusCode
        });
        return false;
    }
}

async function leaveIfStillPending(sock, groupId) {
    timers.delete(groupId);

    if (state.isGroupApproved(groupId)) {
        state.clearGroupApprovalPending(groupId);
        return;
    }

    const pending = state.getPendingGroupApprovals().find(item => item.groupId === groupId);
    if (!pending) return;

    const leaveAtMs = Date.parse(pending.leaveAt || '');
    if (Number.isFinite(leaveAtMs) && leaveAtMs > Date.now()) {
        schedulePendingLeave(sock, groupId, leaveAtMs - Date.now());
        return;
    }

    await safeSendMessage(sock, groupId, {
        text: 'This group was not approved by the bot owner or a bot admin, so I am leaving now.'
    }, undefined, 'group_approval_leave_notice_error');

    try {
        await sock.groupLeave(groupId);
        state.clearGroupApprovalPending(groupId);
        logger.log('group_approval_left_unapproved_group', { groupId });
    } catch (error) {
        logger.log('group_approval_leave_error', {
            groupId,
            error: error.message,
            code: error.data || error.output?.statusCode
        });
    }
}

function schedulePendingLeave(sock, groupId, delayMs) {
    if (!isGroupJid(groupId)) return;

    const existing = timers.get(groupId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        leaveIfStillPending(sock, groupId).catch((error) => {
            logger.log('group_approval_leave_timeout_error', {
                groupId,
                error: error.message,
                code: error.data || error.output?.statusCode
            });
        });
    }, Math.max(1000, delayMs));

    timers.set(groupId, timer);
}

async function markPendingAndSchedule(sock, groupId, details = {}, configCommandHandler = null) {
    if (!isGroupJid(groupId) || state.isGroupApproved(groupId)) return null;

    const leaveAfterMs = getLeaveAfterMs(configCommandHandler);
    const pending = state.markGroupApprovalPending(groupId, {
        ...details,
        leaveAfterMs
    });

    const leaveAtMs = Date.parse(pending.leaveAt || '');
    const delayMs = Number.isFinite(leaveAtMs) ? leaveAtMs - Date.now() : leaveAfterMs;
    schedulePendingLeave(sock, groupId, delayMs);

    const prefix = configCommandHandler?.getPrefix?.() || config.prefix || '.';
    await safeSendMessage(sock, groupId, {
        text: [
            'This group is not approved yet, so I will not respond to commands here.',
            `The bot owner or a bot admin must approve it with ${getApprovalCommand(prefix)}.`,
            'If it is still not approved after 30 minutes, I will leave this group.'
        ].join('\n')
    }, undefined, 'group_approval_pending_notice_error');

    return pending;
}

function approve(groupId, approvedBy = null) {
    const approved = state.approveGroup(groupId, approvedBy);
    const existing = timers.get(groupId);
    if (existing) clearTimeout(existing);
    timers.delete(groupId);
    return approved;
}

function unapprove(groupId) {
    const existing = timers.get(groupId);
    if (existing) clearTimeout(existing);
    timers.delete(groupId);
    return state.unapproveGroup(groupId);
}

function scheduleStoredPendingGroups(sock) {
    state.getPendingGroupApprovals().forEach((pending) => {
        if (!pending?.groupId || state.isGroupApproved(pending.groupId)) {
            state.clearGroupApprovalPending(pending?.groupId);
            return;
        }

        const leaveAtMs = Date.parse(pending.leaveAt || '');
        const delayMs = Number.isFinite(leaveAtMs) ? leaveAtMs - Date.now() : 1000;
        schedulePendingLeave(sock, pending.groupId, delayMs);
    });
}

function isApprovalCommand(text, prefix = '.') {
    if (!String(text || '').startsWith(prefix)) return false;
    const commandName = String(text).slice(prefix.length).trim().split(/ +/)[0]?.toLowerCase();
    return ['approvegroup', 'groupapprove', 'groupapproval', 'pending', 'pendinggroups', 'grouppending'].includes(commandName);
}

function isPrivileged(sender, msg, configCommandHandler = null) {
    return (configCommandHandler?.isOwner?.(sender, msg) ?? sender === config.owner)
        || (configCommandHandler?.isAdmin?.(sender) ?? (config.admins || []).includes(sender));
}

function isPendingReply(msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.documentMessage?.contextInfo
        || null;
    const quoted = contextInfo?.quotedMessage || {};
    const quotedText = quoted.conversation
        || quoted.extendedTextMessage?.text
        || quoted.imageMessage?.caption
        || quoted.videoMessage?.caption
        || quoted.documentMessage?.caption
        || '';

    return /\[REPLY_ID:pending\]/i.test(quotedText);
}

async function blockIfUnapproved(sock, msg, text, configCommandHandler = null) {
    const groupId = msg.key.remoteJid;
    if (!isGroupJid(groupId) || state.isGroupApproved(groupId)) return false;

    const pending = state.getPendingGroupApprovals().find(item => item.groupId === groupId);
    if (!pending) {
        const leaveAfterMs = getLeaveAfterMs(configCommandHandler);
        const created = state.markGroupApprovalPending(groupId, { leaveAfterMs });
        const leaveAtMs = Date.parse(created.leaveAt || '');
        schedulePendingLeave(sock, groupId, Number.isFinite(leaveAtMs) ? leaveAtMs - Date.now() : leaveAfterMs);
    }

    const prefix = state.getChatPrefix(groupId, configCommandHandler?.getPrefix?.() || config.prefix || '.');
    const sender = msg.key.participant || msg.key.remoteJid;

    if ((isApprovalCommand(text, prefix) || isPendingReply(msg)) && isPrivileged(sender, msg, configCommandHandler)) {
        return false;
    }

    if (String(text || '').startsWith(prefix)) {
        await safeSendMessage(sock, groupId, {
            text: [
                'This group is not approved yet, so I cannot work here.',
                `The bot owner or a bot admin can approve it with ${getApprovalCommand(prefix)}.`,
                'If it is still not approved after the approval window, I will leave.'
            ].join('\n')
        }, { quoted: msg }, 'group_approval_block_notice_error');
    }

    return true;
}

module.exports = {
    approve,
    unapprove,
    markPendingAndSchedule,
    scheduleStoredPendingGroups,
    blockIfUnapproved
};