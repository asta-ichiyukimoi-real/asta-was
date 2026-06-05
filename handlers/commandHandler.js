const fs = require('fs');
const path = require('path');
const config = require('../config');
const state = require('../src/utils/stateManager');
const logger = require('../src/utils/logger');

class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.cooldowns = new Map();
        this.loadCommands();
    }

    async safeSendMessage(sock, jid, content, options, logType = 'command_send_error') {
        try {
            await sock.sendMessage(jid, content, options);
            return true;
        } catch (error) {
            logger.log(logType, {
                chatId: jid,
                error: error.message,
                code: error.data || error.output?.statusCode
            });
            return false;
        }
    }

    loadCommands() {
        const commandFiles = fs.readdirSync(path.join(__dirname, '../src/commands')).filter(file => file.endsWith('.js'));
        let uniqueCommands = 0;
        for (const file of commandFiles) {
            try {
                const command = require(path.join(__dirname, '../src/commands', file));
                if (command.config && command.onRun) {
                    this.commands.set(command.config.name, command);
                    uniqueCommands++;
                    if (command.config.aliases) {
                        command.config.aliases.forEach(alias => {
                            this.commands.set(alias, command);
                        });
                    }
                } else {
                    console.warn(`Command ${file} is missing config or onRun.`);
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }
        console.log(`Loaded ${uniqueCommands} unique commands with ${this.commands.size} total entries (including aliases).`);
    }

    async execute(sock, msg, commandName, args) {
        const command = this.commands.get(commandName);
        const chatId = msg.key.remoteJid;

        if (!command) {
            const customCommand = state.getCustomCommand(chatId, commandName);
            if (!customCommand) return;

            state.incrementCommandUsage(`custom:${commandName}`);
            logger.log('custom_command', {
                chatId,
                userId: msg.key.participant || msg.key.remoteJid,
                command: commandName
            });
            await this.safeSendMessage(sock, chatId, { text: customCommand.response }, { quoted: msg });
            return;
        }

        // Permission check
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner = sender === config.owner;
        const isAdmin = config.admins.includes(sender);
        const isMod = state.hasRole(chatId, sender, 'mod');
        const isBanned = state.hasRole(chatId, sender, 'banned');
        const cooldownSeconds = command.config.cooldown ?? config.commandCooldown ?? 3;
        const cooldownKey = `${sender}:${command.config.name}`;

        if (isBanned && !isOwner) {
            await this.safeSendMessage(sock, chatId, { text: 'You are banned from using this bot here.' }, { quoted: msg });
            return;
        }

        // For group chats, check if sender is group admin
        let isGroupAdmin = false;
        if (msg.key.remoteJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                const participant = groupMetadata.participants.find(p => p.id === sender);
                isGroupAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
            } catch (error) {
                console.error('Error checking group admin:', error);
            }
        }

        const permLevel = command.config.permissions || 0;
        if (permLevel === 2) {
            const ownerDebug = {
                chatId,
                command: command.config.name,
                expectedOwner: config.owner,
                gotSender: sender,
                remoteJid: msg.key.remoteJid,
                participant: msg.key.participant || null,
                fromMe: Boolean(msg.key.fromMe),
                isOwner
            };

            console.log('Owner permission debug:', ownerDebug);
            logger.log('owner_permission_debug', ownerDebug);
        }

        if (permLevel === 2 && !isOwner) {
            await this.safeSendMessage(sock, msg.key.remoteJid, {
                text: [
                    'This command is only for the owner.',
                    '',
                    '*Owner permission debug*',
                    `Expected: ${config.owner}`,
                    `Got: ${sender}`,
                    `Chat: ${msg.key.remoteJid}`,
                    `Participant: ${msg.key.participant || 'none'}`
                ].join('\n')
            }, { quoted: msg });
            return;
        }
        if (permLevel === 1 && !isOwner && !isAdmin && !isGroupAdmin && !isMod) {
            await this.safeSendMessage(sock, msg.key.remoteJid, { text: 'This command is only for admins.' });
            return;
        }

        if (!isOwner && state.isCommandDisabled(chatId, command.config.name)) {
            const prefix = state.getChatPrefix(chatId, config.prefix);
            await this.safeSendMessage(sock, chatId, {
                text: `The ${prefix}${command.config.name} command is disabled in this chat.`
            }, { quoted: msg });
            return;
        }

        if (!isOwner && cooldownSeconds > 0) {
            const now = Date.now();
            const availableAt = this.cooldowns.get(cooldownKey) || 0;
            if (availableAt > now) {
                const secondsLeft = Math.ceil((availableAt - now) / 1000);
                await this.safeSendMessage(sock, msg.key.remoteJid, {
                    text: `Slow down a little. Try again in ${secondsLeft}s.`
                }, { quoted: msg });
                return;
            }
            this.cooldowns.set(cooldownKey, now + cooldownSeconds * 1000);
        }

        try {
            state.incrementCommandUsage(command.config.name);
            state.updateHealth({ commandsRun: (state.getState().health.commandsRun || 0) + 1 });
            logger.log('command', {
                chatId,
                userId: sender,
                command: command.config.name,
                args: args.join(' ').slice(0, 250)
            });
            await command.onRun(sock, msg, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            state.updateHealth({ lastError: error.message });
            logger.log('command_error', {
                chatId,
                userId: sender,
                command: command.config.name,
                error: error.message
            });
            await this.safeSendMessage(sock, msg.key.remoteJid, { text: 'There was an error executing that command.' });
        }
    }
}

module.exports = CommandHandler;
