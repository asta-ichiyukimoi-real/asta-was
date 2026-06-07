const state = require('../utils/stateManager');
const { getTargetJids, formatMentions } = require('../utils/targets');
const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'warn',
        aliases: ['warning'],
        version: '1.0.0',
        description: 'Warns a user; 3 warnings removes them',
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        const targets = getTargetJids(msg);
        if (!targets.length) {
            await sock.sendMessage(groupId, {
                text: 'Mention someone or reply to their message.\nExample: !warn @user stop spamming'
            }, { quoted: msg });
            return;
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';
        const warnedBy = msg.key.participant;

        for (const target of targets) {
            try {
                // Update both state and database
                const count = state.addWarning(groupId, target);
                await statsManager.warnUser(target, groupId, reason, warnedBy);
                
                if (count >= 3) {
                    await statsManager.banUser(target, groupId, 'Auto-ban: 3 warnings', 'SYSTEM', false);
                    try {
                        await sock.groupParticipantsUpdate(groupId, [target], 'remove');
                    } catch (error) {
                        console.error('Could not remove user:', error);
                    }
                    state.clearWarnings(groupId, target);
                }
            } catch (error) {
                console.error('Error warning user:', error);
            }
        }

        await sock.sendMessage(groupId, {
            text: `Warned ${formatMentions(targets)}. Users are removed after 3 warnings.`,
            mentions: targets
        }, { quoted: msg });

        try {
            await statsManager.recordCommand('warn', groupId, msg.key.participant, 0, 'success');
        } catch (error) {
            console.error('Error recording command:', error);
        }
    }
};
