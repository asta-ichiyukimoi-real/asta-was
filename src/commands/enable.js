const state = require('../utils/stateManager');
const fs = require('fs');
const path = require('path');

function resolveCommandName(input) {
    const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const command = require(path.join(__dirname, file));
            const aliases = command.config?.aliases || [];
            if (command.config?.name === input || aliases.includes(input)) {
                return command.config.name;
            }
        } catch {
            // Ignore broken command files; the main loader will report them.
        }
    }
    return input;
}

module.exports = {
    config: {
        name: 'enable',
        aliases: ['enablecmd'],
        version: '1.0.0',
        description: 'Enables a disabled command in this chat',
        usage: 'enable <command>',
        examples: ['enable sticker'],
        permissions: 1,
        cooldown: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const commandName = args[0]?.toLowerCase();

        if (!commandName) {
            await sock.sendMessage(chatId, { text: 'Use: !enable <command>' }, { quoted: msg });
            return;
        }

        const resolvedName = resolveCommandName(commandName);
        state.setCommandDisabled(chatId, resolvedName, false);
        await sock.sendMessage(chatId, { text: `Enabled !${resolvedName} in this chat.` }, { quoted: msg });
    }
};
