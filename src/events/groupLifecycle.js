const config = require('../../config');
const state = require('../utils/stateManager');
const logger = require('../utils/logger');

function normalizeJid(value) {
    if (!value || typeof value !== 'string') return '';

    const raw = value.trim().toLowerCase();
    if (!raw) return '';

    const atIndex = raw.indexOf('@');
    if (atIndex >= 0) {
        const local = raw.slice(0, atIndex);
        const domain = raw.slice(atIndex + 1);
        const normalizedLocal = local.replace(/:\d+$/, '');
        return `${normalizedLocal}@${domain}`;
    }

    return raw.replace(/:\d+$/, '');
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

module.exports = (sock, options = {}) => {
    const startupTimeMs = options.startupTimeMs || Date.now();
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

    sock.ev.on('group-participants.update', async (update) => {
        try {
            if (Date.now() - startupTimeMs < 15000) return;

            const botState = state.getState();
            const groupId = update.id;
            const chatSettings = state.getChatSettings(groupId);
            const participants = update.participants || [];
            const botJid = sock?.user?.id || null;
            const botLid = sock?.user?.lid || null;
            const botPhone = sock?.user?.phone || null;
            const botJids = new Set([
                normalizeJid(botJid),
                normalizeJid(botLid),
                normalizeJid(botPhone)
            ].filter(Boolean));

            logger.log('group_participants_update_received', {
                groupId,
                action: update.action,
                botJid,
                botLid,
                botPhone,
                participants: participants.map((participant) => getParticipantIds(participant)),
                raw: JSON.stringify(update || {})
            });

            const botWasAdded = participants.some((participant) => {
                const ids = getParticipantIds(participant).map(normalizeJid);
                return ids.some(id => botJids.has(id));
            });

            const botWasRemoved = participants.some((participant) => {
                const ids = getParticipantIds(participant).map(normalizeJid);
                return ids.some(id => botJids.has(id));
            }) && update.action === 'remove';

            logger.log('group_participants_update_classification', {
                groupId,
                action: update.action,
                botWasAdded,
                botWasRemoved,
                botJid,
                normalizedBotJids: [...botJids],
                participantCount: participants.length
            });

            if (botWasAdded && update.action === 'add') {
                await handleBotGroupLifecycle(sock, configCommandHandler, groupId, 'added', {
                    addedBy: 'unknown (WhatsApp does not expose inviter on this event)'
                });
            }

            if (botWasRemoved) {
                await handleBotGroupLifecycle(sock, configCommandHandler, groupId, 'removed');
            }

            for (const participant of participants) {
                const participantId = getParticipantIds(participant)[0];
                if (!participantId) continue;

                if (participantId === botJid) {
                    continue;
                }

                const displayName = participantId.split('@')[0];
                const groupName = groupId.split('@')[0];

                if (update.action === 'add' && (chatSettings.welcomeEnabled ?? botState.welcome.enabled)) {
                    if (!startupSnapshotReady) continue;

                    const startupMembers = startupMembersByGroup.get(groupId);
                    const wasAlreadyInGroup = getParticipantIds(participant)
                        .some(id => startupMembers?.has(id));

                    if (wasAlreadyInGroup) continue;

                    const template = chatSettings.welcomeMessage || botState.welcome.message;
                    const welcomeText = template.replace(/{{name}}/g, displayName).replace(/{{group}}/g, groupName);
                    await safeSendMessage(sock, groupId, { text: welcomeText }, undefined, 'welcome_send_error');

                    if (!startupMembersByGroup.has(groupId)) {
                        startupMembersByGroup.set(groupId, new Set());
                    }
                    getParticipantIds(participant).forEach(id => startupMembersByGroup.get(groupId).add(id));
                }

                if (update.action === 'remove' && (chatSettings.farewellEnabled ?? botState.farewell.enabled)) {
                    const template = chatSettings.farewellMessage || botState.farewell.message;
                    const farewellText = template.replace(/{{name}}/g, displayName).replace(/{{group}}/g, groupName);
                    await safeSendMessage(sock, groupId, { text: farewellText }, undefined, 'farewell_send_error');
                }
            }
        } catch (error) {
            logger.log('group_participants_update_error', { error: error.message, code: error.data || error.output?.statusCode });
        }
    });
};
