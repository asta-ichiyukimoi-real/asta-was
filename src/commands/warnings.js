const state = require('../utils/stateManager');
const { getTargetJids } = require('../utils/targets');
const statsManager = require('../models/stats');

module.exports = {
    config: {
        name: 'warnings',
        aliases: ['warns'],
        version: '1.0.0',
        description: 'Shows warning counts for this group',
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

        if (args[0]?.toLowerCase() === 'clear') {
            const targets = getTargetJids(msg);
            targets.length ? targets.forEach(target => state.clearWarnings(groupId, target)) : state.clearWarnings(groupId);
            await sock.sendMessage(groupId, { text: 'Warnings cleared.' }, { quoted: msg });
            
            try {
                await statsManager.recordCommand('warnings', groupId, msg.key.participant, 0, 'success');
            } catch (error) {
                console.error('Error recording command:', error);
            }
            return;
        }

        try {
            // Get warnings from database
            const allWarns = await statsManager.all(
                `SELECT DISTINCT user_id, warn_count FROM user_warns WHERE chat_id = ? ORDER BY warn_count DESC LIMIT 10`,
                [groupId]
            );

            // Fallback to state if no database records
            const warnings = state.getGroupModeration(groupId).warnings || {};
            const entries = Object.entries(warnings).filter(([, count]) => count > 0);
            
            if (!entries.length && allWarns.length === 0) {
                await sock.sendMessage(groupId, { text: 'No warnings in this group.' }, { quoted: msg });
                return;
            }

            let text = '*⚠️ Warning List*\n\n';
            
            if (allWarns.length > 0) {
                allWarns.forEach((warn, i) => {
                    text += `${i + 1}. ${warn.user_id.split('@')[0]}: ${warn.warn_count} warning${warn.warn_count > 1 ? 's' : ''}\n`;
                });
            } else {
                entries.slice(0, 10).forEach(([jid, count], i) => {
                    text += `${i + 1}. ${jid.split('@')[0]}: ${count} warning${count > 1 ? 's' : ''}\n`;
                });
            }

            await sock.sendMessage(groupId, { text }, { quoted: msg });

            await statsManager.recordCommand('warnings', groupId, msg.key.participant, 0, 'success');
        } catch (error) {
            console.error('Error getting warnings:', error);
            
            // Fallback to state-based warnings
            const warnings = state.getGroupModeration(groupId).warnings || {};
            const entries = Object.entries(warnings).filter(([, count]) => count > 0);
            if (!entries.length) {
                await sock.sendMessage(groupId, { text: 'No warnings in this group.' }, { quoted: msg });
                return;
            }

            let text = '*⚠️ Warning List*\n\n';
            entries.slice(0, 10).forEach(([jid, count], i) => {
                text += `${i + 1}. ${jid.split('@')[0]}: ${count} warning${count > 1 ? 's' : ''}\n`;
            });

            await sock.sendMessage(groupId, { text }, { quoted: msg });

            await statsManager.recordCommand('warnings', groupId, msg.key.participant, 0, 'success');
        }
    }
};
            await sock.sendMessage(groupId, { text: 'No warnings in this group.' }, { quoted: msg });
            return;
        }

        const mentions = entries.map(([jid]) => jid);
        const lines = entries.map(([jid, count]) => `@${jid.split('@')[0]}: ${count}/3`);
        await sock.sendMessage(groupId, {
            text: `*Warnings*\n\n${lines.join('\n')}`,
            mentions
        }, { quoted: msg });
    }
};
