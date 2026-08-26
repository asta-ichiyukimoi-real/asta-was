const vm = require('vm');
const util = require('util');
const config = require('../../config');
const logger = require('../utils/logger');

function getDevConfig() {
    const handler = global.configCommandHandler;
    return {
        enabled: handler?.get?.('developer.evalEnabled', config.developer?.evalEnabled) ?? false,
        timeoutMs: handler?.get?.('developer.evalTimeoutMs', config.developer?.evalTimeoutMs) || 5000,
        maxOutput: handler?.get?.('developer.evalMaxOutput', config.developer?.evalMaxOutput) || 3500
    };
}

function formatValue(value, maxOutput) {
    const output = typeof value === 'string'
        ? value
        : util.inspect(value, { depth: 3, breakLength: 120 });

    return output.length > maxOutput ? `${output.slice(0, maxOutput)}\n...output trimmed` : output;
}

module.exports = {
    config: {
        name: 'eval',
        aliases: ['js'],
        version: '1.0.0',
        description: 'Evaluate JavaScript inside a limited VM context',
        usage: 'eval <javascript>',
        examples: ['eval Object.keys(commands).length'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const code = args.join(' ').trim();
        const devConfig = getDevConfig();

        if (!devConfig.enabled) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    'Eval command is disabled.',
                    'Enable it with:',
                    '.config set developer.evalEnabled true'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        if (!code) {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Use: .eval <javascript>' }, { quoted: msg });
            return;
        }

        logger.log('eval_command', {
            userId: msg.key.participant || msg.key.remoteJid,
            chatId: msg.key.remoteJid,
            code: code.slice(0, 500)
        });

        try {
            const context = {
                sock,
                msg,
                config,
                commands: global.commandHandler?.commands,
                chatCommands: global.chatCommandHandler?.chatCommands,
                replyCommands: global.replyCommandHandler?.replyCommands,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                Math,
                Date,
                JSON
};
            const result = vm.runInNewContext(code, context, { timeout: devConfig.timeoutMs });

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Eval Result*\n${formatValue(result, devConfig.maxOutput)}`
            }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Eval failed: ${error.message || error}`
            }, { quoted: msg });
        }
    }
};
