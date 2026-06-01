const fs = require('fs');
const path = require('path');

class ReplyCommandHandler {
    constructor() {
        this.replyCommands = new Map();
        this.loadReplyCommands();
    }

    loadReplyCommands() {
        const commandFiles = fs.readdirSync(path.join(__dirname, '../src/commands')).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(path.join(__dirname, '../src/commands', file));
                if (command.config && command.onReply) {
                    this.replyCommands.set(command.config.name, command);
                    console.log(`Loaded reply command: ${command.config.name}`);
                    if (command.config.aliases) {
                        command.config.aliases.forEach(alias => {
                            this.replyCommands.set(alias, command);
                        });
                    }
                }
            } catch (error) {
                console.error(`Error loading reply command ${file}:`, error);
            }
        }
        console.log(`Total reply commands loaded: ${this.replyCommands.size}`);
    }

    async execute(sock, msg, commandName, replyText) {
        const command = this.replyCommands.get(commandName);
        if (!command) {
            console.log(`No reply command found for: ${commandName}`);
            return false;
        }

        console.log(`Executing reply command: ${commandName}`);
        try {
            await command.onReply(sock, msg, replyText);
            console.log(`Reply command ${commandName} executed successfully`);
            return true;
        } catch (error) {
            console.error(`Error executing reply command ${commandName}:`, error);
            return false;
        }
    }
}

module.exports = ReplyCommandHandler;
