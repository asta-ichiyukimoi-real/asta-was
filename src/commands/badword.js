const state = require('../utils/stateManager');
const { chooseReply } = require('../utils/replyCopy');

module.exports = {
    config: {
        name: 'badword',
        aliases: ['badwords'],
        version: '1.0.0',
        description: 'Manages filtered words for a group',
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

        const action = args.shift()?.toLowerCase();
        const word = args.join(' ').trim().toLowerCase();
        const moderation = state.getGroupModeration(groupId);
        const badWords = moderation.badWords || [];

        if (!action || action === 'list') {
            await sock.sendMessage(groupId, {
                text: badWords.length
                    ? `Filtered words:\n${badWords.map(item => `- ${item}`).join('\n')}`
                    : 'There are no filtered words yet.\nUse: !badword add <word>'
            }, { quoted: msg });
            return;
        }

        if (!['add', 'remove', 'clear'].includes(action)) {
            await sock.sendMessage(groupId, {
                text: 'Use: !badword add <word>, !badword remove <word>, !badword list, or !badword clear'
            }, { quoted: msg });
            return;
        }

        if (action === 'clear') {
            state.setGroupModeration(groupId, { badWords: [] });
            await sock.sendMessage(groupId, {
                text: chooseReply([
                    'The filtered word list has been cleared.',
                    'All filtered words have been removed.'
                ])
            }, { quoted: msg });
            return;
        }

        if (!word) {
            await sock.sendMessage(groupId, { text: `Use: !badword ${action} <word>` }, { quoted: msg });
            return;
        }

        if (action === 'add') {
            const next = Array.from(new Set([...badWords, word]));
            state.setGroupModeration(groupId, { badWords: next });
            await sock.sendMessage(groupId, {
                text: chooseReply([
                    `"${word}" has been added to the filtered word list.`,
                    `Added "${word}" to the list of filtered words.`
                ])
            }, { quoted: msg });
            return;
        }

        const next = badWords.filter(item => item !== word);
        state.setGroupModeration(groupId, { badWords: next });
        await sock.sendMessage(groupId, {
            text: chooseReply([
                `"${word}" has been removed from the filtered word list.`,
                `Removed "${word}" from the list of filtered words.`
            ])
        }, { quoted: msg });
    }
};
