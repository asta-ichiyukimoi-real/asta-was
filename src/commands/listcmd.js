const state = require('../utils/stateManager');

module.exports = {
    config: {
        name: 'listcmd',
        aliases: ['customcmds', 'cmds'],
        version: '1.0.0',
        description: 'Lists custom commands for this chat',
        usage: 'listcmd',
        examples: ['listcmd'],
        permissions: 0,
        cooldown: 2,
        category: 'custom'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const commands = state.getChatCustomCommands(chatId);
        const names = Object.keys(commands).sort();

        if (!names.length) {
            await sock.sendMessage(chatId, {
                text: 'No custom commands saved here yet.\nAdmins can add one with !addcmd rules Be respectful.'
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatId, {
            text: `*Custom Commands*\n\n${names.map(name => `- !${name}`).join('\n')}`
        }, { quoted: msg });
    }
};
