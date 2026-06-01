module.exports = {
    config: {
        name: 'reload',
        aliases: ['reloadcmds'],
        version: '1.0.0',
        description: 'Reloads command files without restarting the bot',
        usage: 'reload',
        examples: ['reload'],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        Object.keys(require.cache).forEach((key) => {
            if (key.includes('\\src\\commands\\') || key.includes('/src/commands/')) {
                delete require.cache[key];
            }
        });

        const commandHandler = global.commandHandler;
        const chatCommandHandler = global.chatCommandHandler;
        const replyCommandHandler = global.replyCommandHandler;

        if (commandHandler?.loadCommands) {
            commandHandler.commands.clear();
            commandHandler.loadCommands();
        }
        if (chatCommandHandler?.loadChatCommands) {
            chatCommandHandler.chatCommands.clear();
            chatCommandHandler.loadChatCommands();
        }
        if (replyCommandHandler?.loadReplyCommands) {
            replyCommandHandler.replyCommands.clear();
            replyCommandHandler.loadReplyCommands();
        }

        await sock.sendMessage(msg.key.remoteJid, { text: 'Commands reloaded.' }, { quoted: msg });
    }
};
