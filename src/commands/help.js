const fs = require('fs');
const path = require('path');
const config = require('../../config');
const state = require('../utils/stateManager');

function loadCommands() {
    return fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.js'))
        .map(file => {
            try {
                return require(path.join(__dirname, file));
            } catch {
                return null;
            }
        })
        .filter(cmd => cmd && cmd.config && cmd.config.name)
        .sort((a, b) => a.config.name.localeCompare(b.config.name));
}

function findCommand(commands, name) {
    return commands.find(command => {
        const aliases = command.config.aliases || [];
        return command.config.name === name || aliases.includes(name);
    });
}

function permissionLabel(level) {
    if (level === 2) return 'Owner only';
    if (level === 1) return 'Admin only';
    return 'Everyone';
}

module.exports = {
    config: {
        name: 'help',
        aliases: ['commands', 'h'],
        version: '1.1.0',
        description: 'Shows available bot commands',
        usage: 'help [command]',
        examples: ['help', 'help sticker', 'help addcmd'],
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const commands = loadCommands();
        const requested = args[0]?.toLowerCase();
        const chatId = msg.key.remoteJid;
        const configHandler = global.configCommandHandler;
        const prefix = state.getChatPrefix(chatId, configHandler?.getPrefix?.() || config.prefix);

        if (requested) {
            const command = findCommand(commands, requested);
            const customCommand = state.getCustomCommand(chatId, requested);

            if (!command && !customCommand) {
                await sock.sendMessage(chatId, {
                    text: `No command named ${prefix}${requested} found.`
                }, { quoted: msg });
                return;
            }

            if (customCommand) {
                await sock.sendMessage(chatId, {
                    text: `*${prefix}${requested}*\n\nCustom command for this chat.\n\nResponse:\n${customCommand.response}`
                }, { quoted: msg });
                return;
            }

            const aliases = command.config.aliases || [];
            const examples = command.config.examples || [];
            const usage = command.config.usage || command.config.name;
            const category = command.config.category || 'other';
            const disabled = state.isCommandDisabled(chatId, command.config.name);
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            const cooldown = configHandler?.getCommandCooldown?.(command.config) ?? command.config.cooldown ?? config.commandCooldown ?? 3;
            const detail = `*${prefix}${command.config.name}*

${command.config.description}

Usage: ${prefix}${usage}
Category: ${category}
Permission: ${permissionLabel(command.config.permissions || 0)}
Cooldown: ${cooldown}s
Status: ${disabled || categoryDisabled ? 'Disabled in this chat' : 'Enabled'}${categoryDisabled ? ` (${category} category off)` : ''}
${aliases.length ? `Aliases: ${aliases.map(alias => `${prefix}${alias}`).join(', ')}` : ''}
${examples.length ? `\nExamples:\n${examples.map(example => `- ${prefix}${example}`).join('\n')}` : ''}`;

            await sock.sendMessage(chatId, { text: detail.trim() }, { quoted: msg });
            return;
        }

        const grouped = commands.reduce((acc, cmd) => {
            const category = cmd.config.category || 'other';
            acc[category] = acc[category] || [];
            acc[category].push(cmd);
            return acc;
        }, {});

        let helpMessage = `*Command Center*

Use ${prefix}<command> to interact with me.
Use ${prefix}help <command> for examples.`;

        Object.keys(grouped).sort().forEach(category => {
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            helpMessage += `\n\n*${category.charAt(0).toUpperCase() + category.slice(1)}${categoryDisabled ? ' (off)' : ''}*`;
            grouped[category].forEach(command => {
                const disabled = state.isCommandDisabled(chatId, command.config.name) || categoryDisabled;
                helpMessage += `\n- ${prefix}${command.config.name}${disabled ? ' (disabled)' : ''} - ${command.config.description}`;
            });
        });

        const customCommands = Object.keys(state.getChatCustomCommands(chatId)).sort();
        if (customCommands.length) {
            helpMessage += `\n\n*Custom*\n${customCommands.map(name => `- ${prefix}${name}`).join('\n')}`;
        }

        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: msg });
    }
};
