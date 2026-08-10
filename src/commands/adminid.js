function normalizeId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw.toLowerCase();

    const digits = raw.replace(/[^\d]/g, '');
    return digits ? `${digits}@lid` : raw.toLowerCase();
}

function targetFromMessage(msg, args) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned[0]) return mentioned[0];

    const participant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (participant) return participant;

    return args[1] || '';
}

function refreshConfigHandler() {
    if (global.configCommandHandler?.reload) {
        global.configCommandHandler.reload();
    }
}

function getCurrentAdmins() {
    return global.configCommandHandler?.getAdminIds?.() || [];
}

function saveAdmins(admins) {
    const unique = [...new Set(admins.map(normalizeId).filter(Boolean))].sort();
    const state = require('../utils/stateManager');
    state.setRuntimeConfig('permissions.admins', unique);
    state.setRuntimeConfig('admins', unique);
    refreshConfigHandler();
    return unique;
}

module.exports = {
    config: {
        name: 'adminid',
        aliases: ['addlid', 'adminlid', 'botadmin', 'setadmin'],
        version: '1.0.0',
        description: 'Add or remove bot admin LID/JID values',
        usage: 'adminid <add|remove|list> [lid/jid]',
        examples: ['adminid add 123456@lid', 'adminid add 123456', 'adminid remove 123456@lid', 'adminid list'],
        permissions: 2,
        cooldown: 0,
        category: 'admin'
    },

    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const action = args[0]?.toLowerCase();

        if (!action || action === 'help') {
            await sock.sendMessage(chatId, {
                text: [
                    '*Admin ID*',
                    '.adminid add <lid/jid>',
                    '.adminid remove <lid/jid>',
                    '.adminid list',
                    '',
                    'Tip: reply to someone with .adminid add to use their WhatsApp id.'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        if (action === 'list') {
            const admins = getCurrentAdmins();
            await sock.sendMessage(chatId, {
                text: `*Bot Admins*\n${admins.length ? admins.join('\n') : 'none'}`
            }, { quoted: msg });
            return;
        }

        if (!['add', 'remove', 'del', 'delete'].includes(action)) {
            await sock.sendMessage(chatId, { text: 'Use: .adminid add/remove/list' }, { quoted: msg });
            return;
        }

        const target = normalizeId(targetFromMessage(msg, args));
        if (!target) {
            await sock.sendMessage(chatId, {
                text: 'Give me a LID/JID, mention someone, or reply to their message.'
            }, { quoted: msg });
            return;
        }

        const current = getCurrentAdmins();
        const admins = new Set(current);

        if (action === 'add') {
            admins.add(target);
        } else {
            admins.delete(target);
        }

        const saved = saveAdmins([...admins]);

        await sock.sendMessage(chatId, {
            text: [
                action === 'add' ? `Added bot admin: ${target}` : `Removed bot admin: ${target}`,
                '',
                `Admins now: ${saved.length ? saved.join(', ') : 'none'}`
            ].join('\n')
        }, { quoted: msg });
    }
};
