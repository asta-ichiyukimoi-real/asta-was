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
        const started = Date.now();
        Object.keys(require.cache).forEach((key) => {
            if (
                key.includes('\\src\\commands\\')
                || key.includes('/src/commands/')
                || key.includes('\\src\\utils\\messageStyle.js')
                || key.includes('/src/utils/messageStyle.js')
                || key.endsWith('\\config.js')
                || key.endsWith('/config.js')
            ) {
                delete require.cache[key];
            }
        });

        const commandHandler = global.commandHandler;
        const chatCommandHandler = global.chatCommandHandler;
        const replyCommandHandler = global.replyCommandHandler;

        try {
            const ConfigCommandHandler = require('../../handlers/configCommandHandler');
            const freshConfig = require('../../config');
            const configCommandHandler = new ConfigCommandHandler(freshConfig);
            global.configCommandHandler = configCommandHandler;
            if (commandHandler) {
                commandHandler.configCommandHandler = configCommandHandler;
            }
        } catch (error) {
            console.error('Config reload error:', error);
        }

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

        try {
            const { installMessageFont } = require('../utils/messageStyle');
            installMessageFont(sock);
        } catch (error) {
            console.error('Message font reload error:', error);
        }

        const uniqueCommands = commandHandler?.commands
            ? new Set(commandHandler.commands.values()).size
            : 0;
        const aliases = commandHandler?.commands?.size || 0;
        const replyCommands = replyCommandHandler?.replyCommands?.size || 0;
        const chatCommands = chatCommandHandler?.chatCommands?.size || 0;

        await sock.sendMessage(msg.key.remoteJid, {
            text: [
                '*Reload complete*',
                `Commands: ${uniqueCommands}`,
                `Command entries: ${aliases}`,
                `Reply entries: ${replyCommands}`,
                `Chat triggers: ${chatCommands}`,
                `Config: reloaded`,
                `Time: ${Date.now() - started}ms`
            ].join('\n')
        }, { quoted: msg });
    }
};
