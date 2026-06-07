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
    if (level === 2) return '👑 Owner only';
    if (level === 1) return '🔐 Admin only';
    return '👥 Everyone';
}

function getCategoryEmoji(category) {
    const emojiMap = {
        'general': '📋',
        'admin': '⚙️',
        'media': '🖼️',
        'utility': '🛠️',
        'fun': '🎮',
        'owner': '👑',
        'search': '🔍',
        'ai': '🤖',
        'other': '📚'
    };
    return emojiMap[category] || '📦';
}

module.exports = {
    config: {
        name: 'help',
        aliases: ['commands', 'h', 'menu'],
        version: '2.0.0',
        description: 'Shows available bot commands with detailed information',
        usage: 'help [command_name]',
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

        // DETAILED COMMAND VIEW
        if (requested) {
            const command = findCommand(commands, requested);
            const customCommand = state.getCustomCommand(chatId, requested);

            if (!command && !customCommand) {
                const errorMsg = `❌ Command Not Found

"${requested}" doesn't exist in my database.

💡 Try ${prefix}help to see all commands.`;
                await sock.sendMessage(chatId, { text: errorMsg }, { quoted: msg });
                return;
            }

            if (customCommand) {
                const customMsg = `⚙️ Custom Command

${prefix}${requested}

📝 This is a custom command for this chat.

*Response:*
${customCommand.response}`;
                await sock.sendMessage(chatId, { text: customMsg }, { quoted: msg });
                return;
            }

            const aliases = command.config.aliases || [];
            const examples = command.config.examples || [];
            const usage = command.config.usage || command.config.name;
            const category = command.config.category || 'other';
            const disabled = state.isCommandDisabled(chatId, command.config.name);
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            const cooldown = configHandler?.getCommandCooldown?.(command.config) ?? command.config.cooldown ?? config.commandCooldown ?? 3;
            
            let statusEmoji = '✅';
            if (disabled || categoryDisabled) {
                statusEmoji = '❌';
            }

            let detail = `${getCategoryEmoji(category)} *${command.config.name.toUpperCase()}*

${command.config.description}

━━━━━━━━━━━━━━━━━━━━━━━━

📚 *Usage:*
${prefix}${usage}

*Category:* ${getCategoryEmoji(category)} ${category}
*Permission:* ${permissionLabel(command.config.permissions || 0)}
*Cooldown:* ⏱️ ${cooldown}s
*Status:* ${statusEmoji} ${disabled || categoryDisabled ? 'Disabled' : 'Enabled'}`;

            if (aliases.length) {
                detail += `\n*Aliases:* ${aliases.map(a => prefix + a).join(', ')}`;
            }

            if (examples.length) {
                detail += `\n\n*Examples:*`;
                examples.forEach(ex => {
                    detail += `\n• ${prefix}${ex}`;
                });
            }

            await sock.sendMessage(chatId, { text: detail }, { quoted: msg });
            return;
        }

        // MAIN HELP MENU
        const grouped = commands.reduce((acc, cmd) => {
            const category = cmd.config.category || 'other';
            acc[category] = acc[category] || [];
            acc[category].push(cmd);
            return acc;
        }, {});

        const customCommands = Object.keys(state.getChatCustomCommands(chatId)).sort();
        const totalCommands = commands.length + customCommands.length;

        let helpMessage = `🤖 *ASTA BOT - COMMAND LIST*

_Total: ${totalCommands} commands (${commands.length} built-in + ${customCommands.length} custom)_

━━━━━━━━━━━━━━━━━━━━━━━━

📖 Type: ${prefix}help <command> for detailed info

━━━━━━━━━━━━━━━━━━━━━━━━
`;

        // List categories with emoji
        const categories = Object.keys(grouped).sort();
        categories.forEach(category => {
            const categoryDisabled = state.isCategoryDisabled(chatId, category);
            const emoji = getCategoryEmoji(category);
            const count = grouped[category].length;
            const status = categoryDisabled ? ' ⛔' : '';
            
            helpMessage += `\n${emoji} *${category.toUpperCase()}* (${count})${status}\n`;
            
            grouped[category].forEach(command => {
                const disabled = state.isCommandDisabled(chatId, command.config.name) || categoryDisabled;
                const cmdEmoji = disabled ? '🚫' : '';
                const desc = command.config.description ? ` - ${command.config.description}` : '';
                helpMessage += `   ${cmdEmoji} ${prefix}${command.config.name}${desc}\n`;
            });
        });

        // Custom commands section
        if (customCommands.length) {
            helpMessage += `\n⚙️ *CUSTOM COMMANDS* (${customCommands.length})\n`;
            customCommands.forEach(name => {
                helpMessage += `   ⚡ ${prefix}${name}\n`;
            });
        }

        helpMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Tips:*
• Use ${prefix}help <command> for details
• Commands with 🚫 are disabled in this chat
• Type ${prefix}settings to manage commands`;

        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: msg });
    }
};
