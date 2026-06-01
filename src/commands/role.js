const state = require('../utils/stateManager');
const { getTargetJids, formatMentions } = require('../utils/targets');

const VALID_ROLES = new Set(['mod', 'trusted', 'banned']);

module.exports = {
    config: {
        name: 'role',
        aliases: ['roles'],
        version: '1.0.0',
        description: 'Manages bot roles in this group',
        usage: 'role <add|remove|list> <mod|trusted|banned> @user',
        examples: ['role add mod @user', 'role list'],
        permissions: 1,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            await sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        const action = args[0]?.toLowerCase() || 'list';
        const role = args[1]?.toLowerCase();

        if (action === 'list') {
            const roles = state.getChatRoles(groupId);
            const mentions = [...roles.mods, ...roles.trusted, ...roles.banned];
            const format = (items) => items.length ? items.map(jid => `@${jid.split('@')[0]}`).join(', ') : 'none';
            await sock.sendMessage(groupId, {
                text: `*Bot Roles*\n\nMods: ${format(roles.mods)}\nTrusted: ${format(roles.trusted)}\nBanned: ${format(roles.banned)}`,
                mentions
            }, { quoted: msg });
            return;
        }

        if (!['add', 'remove'].includes(action) || !VALID_ROLES.has(role)) {
            await sock.sendMessage(groupId, {
                text: 'Use: !role add mod @user, !role remove trusted @user, or !role list'
            }, { quoted: msg });
            return;
        }

        const targets = getTargetJids(msg);
        if (!targets.length) {
            await sock.sendMessage(groupId, { text: 'Mention someone or reply to their message.' }, { quoted: msg });
            return;
        }

        targets.forEach(target => state.setUserRole(groupId, target, role, action === 'add'));
        await sock.sendMessage(groupId, {
            text: `${action === 'add' ? 'Added' : 'Removed'} ${formatMentions(targets)} ${action === 'add' ? 'as' : 'from'} ${role}.`,
            mentions: targets
        }, { quoted: msg });
    }
};
