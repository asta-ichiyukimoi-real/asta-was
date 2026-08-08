const config = require('../../config');
const state = require('../utils/stateManager');
const logger = require('../utils/logger');

// Lazy load stats to avoid circular dependencies
let statsManager = null;
function getStats() {
    if (!statsManager) {
        try {
            statsManager = require('../models/stats');
        } catch (e) {
            return null;
        }
    }
    return statsManager;
}

const STARTUP_MESSAGE_GRACE_SECONDS = 300;

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

function normalizeText(msg) {
    const message = unwrapMessage(msg.message);
    return message.conversation
        || message.extendedTextMessage?.text
        || message.imageMessage?.caption
        || message.videoMessage?.caption
        || message.documentMessage?.caption
        || message.buttonsResponseMessage?.selectedButtonId
        || message.listResponseMessage?.singleSelectReply?.selectedRowId
        || message.templateButtonReplyMessage?.selectedId
        || '';
}

function getContextInfo(msg) {
    const message = unwrapMessage(msg.message);
    return message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || message.videoMessage?.contextInfo
        || message.documentMessage?.contextInfo
        || null;
}

function getQuotedText(quotedMessage) {
    const message = unwrapMessage(quotedMessage);
    return message.conversation
        || message.extendedTextMessage?.text
        || message.imageMessage?.caption
        || message.videoMessage?.caption
        || message.documentMessage?.caption
        || '';
}

function toUnixSeconds(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value.toNumber === 'function') return value.toNumber();
    if (typeof value.low === 'number') return value.low;
    return Number(value) || 0;
}

function isFreshMessage(msg, startupTimeSeconds) {
    const timestamp = toUnixSeconds(msg.messageTimestamp);
    return !timestamp || timestamp >= startupTimeSeconds - STARTUP_MESSAGE_GRACE_SECONDS;
}

function getParticipantIds(participant) {
    if (!participant) return [];
    if (typeof participant === 'string') return [participant];

    return [
        participant.id,
        participant.lid,
        participant.phoneNumber
    ].filter(Boolean);
}

async function safeSendMessage(sock, jid, content, options, logType = 'send_message_error') {
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

async function getGroupMetadata(sock, groupId) {
    try {
        const meta = await sock.groupMetadata(groupId);
        return meta || null;
    } catch (error) {
        logger.log('group_metadata_lookup_error', {
            groupId,
            error: error.message,
            code: error.data || error.output?.statusCode
        });
        return null;
    }
}

async function notifyOwnerAndAdmins(sock, configCommandHandler, payload) {
    const ownerIds = configCommandHandler?.getOwnerIds?.() || [config.owner]
    const adminIds = configCommandHandler?.getAdminIds?.() || (config.admins || []);
    const targets = [...new Set([...ownerIds, ...adminIds].filter(Boolean))];

    if (!targets.length) return;

    const message = payload.text;
    for (const target of targets) {
        await safeSendMessage(sock, target, { text: message }, undefined, 'group_lifecycle_owner_notice_error');
    }
}

async function handleBotGroupLifecycle(sock, configCommandHandler, groupId, eventType, update = {}) {
    const isGroup = String(groupId || '').endsWith('@g.us');
    if (!isGroup) return;

    const meta = await getGroupMetadata(sock, groupId);
    const groupName = meta?.subject || groupId.split('@')[0] || 'Unknown group';
    const participantCount = meta?.participants?.length || 0;
    const botJid = sock?.user?.id || null;
    const addedBy = update?.addedBy || 'unknown (not exposed by WhatsApp event)';

    logger.log('group_lifecycle_debug', {
        groupId,
        eventType,
        computedGroupName: groupName,
        participantCount,
        botJid,
        addedBy,
        updateSummary: JSON.stringify(update || {})
    });

    if (eventType === 'added') {
        await safeSendMessage(sock, groupId, {
            text: `Thanks for adding me to this group, ${groupName}. I’m ready to help whenever you need me.`
        }, undefined, 'bot_added_welcome_error');

        const payload = {
            text: `Asta Bot joined a group\n` +
                `Event: Bot Added\n` +
                `Group Name: ${groupName}\n` +
                `Group ID: ${groupId}\n` +
                `Bot ID: ${botJid || 'unknown'}\n` +
                `Participants: ${participantCount}\n` +
                `Added By: ${addedBy}\n` +
                `Time: ${new Date().toISOString()}`
        };

        await notifyOwnerAndAdmins(sock, configCommandHandler, payload);
    }

    if (eventType === 'removed') {
        const payload = {
            text: `Asta Bot was removed from a group\n` +
                `Event: Bot Removed / Kicked / Left\n` +
                `Group Name: ${groupName}\n` +
                `Group ID: ${groupId}\n` +
                `Bot ID: ${botJid || 'unknown'}\n` +
                `Participants: ${participantCount}\n` +
                `Time: ${new Date().toISOString()}`
        };

        await notifyOwnerAndAdmins(sock, configCommandHandler, payload);
    }
}

async function createStartupGroupSnapshot(sock) {
    const membersByGroup = new Map();

    try {
        const groups = await sock.groupFetchAllParticipating();
        Object.values(groups || {}).forEach((group) => {
            const groupId = group.id;
            const members = new Set();

            (group.participants || []).forEach((participant) => {
                getParticipantIds(participant).forEach(id => members.add(id));
            });

            membersByGroup.set(groupId, members);
        });
    } catch (error) {
        logger.log('startup_group_snapshot_error', { error: error.message });
    }

    return membersByGroup;
}

function findAutoReply(text, autoReplyConfig) {
    const normalized = text.toLowerCase();
    return Object.keys(autoReplyConfig.keywords).find((keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(normalized);
    });
}

function hasLink(text) {
    return /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/)/i.test(text);
}

function hasBadWord(text, words) {
    const normalized = text.toLowerCase();
    return words.find((word) => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(normalized);
    });
}

async function isGroupAdmin(sock, groupId, sender) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === sender);
        return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
    } catch {
        return false;
    }
}

async function applyModeration(sock, msg, text, configCommandHandler = null) {
    const groupId = msg.key.remoteJid;
    if (!groupId.endsWith('@g.us')) return false;

    const sender = msg.key.participant || msg.key.remoteJid;
    const senderIsPrivileged = (configCommandHandler?.isOwner(sender, msg) ?? sender === config.owner)
        || (configCommandHandler?.isAdmin(sender) ?? config.admins.includes(sender))
        || state.hasRole(groupId, sender, 'mod')
        || state.hasRole(groupId, sender, 'trusted')
        || await isGroupAdmin(sock, groupId, sender);

    if (senderIsPrivileged) return false;

    if (state.hasRole(groupId, sender, 'banned')) {
        try {
            await sock.groupParticipantsUpdate(groupId, [sender], 'remove');
            logger.log('role_ban_removed_user', { groupId, userId: sender });
        } catch (error) {
            logger.log('role_ban_remove_error', { groupId, userId: sender, error: error.message });
        }
        return true;
    }

    const groupModeration = state.getGroupModeration(groupId);
    const badWord = hasBadWord(text, groupModeration.badWords || []);
    const linkViolation = groupModeration.antiLink && hasLink(text);

    if (!badWord && !linkViolation) return false;

    try {
        await sock.sendMessage(groupId, { delete: msg.key });
    } catch (error) {
        logger.log('moderation_delete_error', { groupId, userId: sender, error: error.message });
    }

    const reason = linkViolation ? 'links are not allowed here' : 'that word is not allowed here';
    const warningCount = state.addWarning(groupId, sender);
    const handle = sender.split('@')[0];
    logger.log('moderation_action', { groupId, userId: sender, reason, warningCount });

    await safeSendMessage(sock, groupId, {
        text: `@${handle}, ${reason}. Warning ${warningCount}/3.`,
        mentions: [sender]
    }, undefined, 'moderation_warning_send_error');

    if (warningCount >= 3) {
        try {
            await sock.groupParticipantsUpdate(groupId, [sender], 'remove');
            state.clearWarnings(groupId, sender);
            logger.log('moderation_removed_user', { groupId, userId: sender });
        } catch (error) {
            logger.log('moderation_remove_error', { groupId, userId: sender, error: error.message });
            await safeSendMessage(sock, groupId, {
                text: `I tried to remove @${handle}, but I need admin permission first.`,
                mentions: [sender]
            }, undefined, 'moderation_remove_notice_send_error');
        }
    }

    return true;
}

module.exports = (sock, commandHandler, chatCommandHandler, replyCommandHandler, options = {}) => {
    const startupTimeMs = options.startupTimeMs || Date.now();
    const startupTimeSeconds = options.startupTimeSeconds || Math.floor(startupTimeMs / 1000);
    const configCommandHandler = options.configCommandHandler || global.configCommandHandler || null;
    let startupMembersByGroup = new Map();
    let startupSnapshotReady = false;

    sock.ev.on('connection.update', ({ connection }) => {
        if (connection !== 'open') return;

        createStartupGroupSnapshot(sock).then((snapshot) => {
            startupMembersByGroup = snapshot;
            startupSnapshotReady = true;
        });
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !isFreshMessage(msg, startupTimeSeconds)) return;

            if (m.type === 'notify') {
                const text = normalizeText(msg);
                if (!text) return;

                if (!msg.key.fromMe) {
                    const moderated = await applyModeration(sock, msg, text, configCommandHandler);
                    if (moderated) return;
                }

                const quotedMessage = getContextInfo(msg)?.quotedMessage;
                if (!msg.key.fromMe && quotedMessage) {
                    const quotedText = getQuotedText(quotedMessage);
                    const match = quotedText.match(/\[REPLY_ID:([a-zA-Z0-9_-]+)\]/);

                    if (match) {
                        const repliedCommand = match[1].toLowerCase();
                        const executed = await replyCommandHandler.execute(sock, msg, repliedCommand, text);
                        if (executed) return;
                    }
                }

                const prefix = state.getChatPrefix(msg.key.remoteJid, configCommandHandler?.getPrefix?.() || config.prefix);
                if (text.startsWith(prefix)) {
                    const args = text.slice(prefix.length).trim().split(/ +/);
                    const commandName = args.shift().toLowerCase();
                    
                    // Track command execution
                    const stats = getStats();
                    const userId = msg.key.participant || msg.key.remoteJid;
                    const chatId = msg.key.remoteJid;
                    
                    if (stats && !msg.key.fromMe) {
                        const startTime = Date.now();
                        try {
                            await commandHandler.execute(sock, msg, commandName, args);
                            const executionTime = Date.now() - startTime;
                            await stats.recordCommand(commandName, chatId, userId, executionTime, 'success');
                            await stats.updateUserStats(userId, 1, true); // true = isCommand
                            await stats.updateChatStats(chatId, null, 0, 1); // 0 messages, 1 command
                        } catch (error) {
                            await stats.recordCommand(commandName, chatId, userId, 0, 'error');
                        }
                    } else {
                        await commandHandler.execute(sock, msg, commandName, args);
                    }
                    return;
                }

                if (msg.key.fromMe) return;

                // Track messages
                const stats = getStats();
                if (stats) {
                    const userId = msg.key.participant || msg.key.remoteJid;
                    const chatId = msg.key.remoteJid;
                    await stats.updateUserStats(userId, 1, false); // 1 message, not a command
                    await stats.updateChatStats(chatId, null, 1, 0); // 1 message, 0 commands
                }

                const chatCommandTriggered = await chatCommandHandler.execute(sock, msg, text);
                if (chatCommandTriggered) {
                    return;
                }

                const botState = state.getState();
                const chatSettings = state.getChatSettings(msg.key.remoteJid);
                const autoReplyEnabled = chatSettings.autoReplyEnabled ?? botState.autoReply.enabled;
                if (autoReplyEnabled) {
                    const matchedKeyword = findAutoReply(text, botState.autoReply);
                    if (matchedKeyword) {
                        await safeSendMessage(
                            sock,
                            msg.key.remoteJid,
                            { text: botState.autoReply.keywords[matchedKeyword] },
                            undefined,
                            'auto_reply_send_error'
                        );
                    }
                }
            }
        } catch (error) {
            logger.log('messages_upsert_error', { error: error.message, code: error.data || error.output?.statusCode });
        }
    });

};
