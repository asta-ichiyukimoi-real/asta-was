const { exec } = require('child_process');
const config = require('../../config');
const logger = require('../utils/logger');

function getDevConfig() {
    const handler = global.configCommandHandler;
    return {
        enabled: handler?.get?.('developer.shellEnabled', config.developer?.shellEnabled) ?? false,
        timeoutMs: handler?.get?.('developer.shellTimeoutMs', config.developer?.shellTimeoutMs) || 15000,
        maxOutput: handler?.get?.('developer.shellMaxOutput', config.developer?.shellMaxOutput) || 3500,
        cwd: handler?.get?.('developer.shellCwd', config.developer?.shellCwd) || process.cwd(),
        blockedPatterns: handler?.get?.('developer.blockedShellPatterns', config.developer?.blockedShellPatterns) || []
    };
}

function isBlocked(command, blockedPatterns) {
    const normalized = String(command || '').toLowerCase();
    return blockedPatterns.some(pattern => normalized.includes(String(pattern).toLowerCase()));
}

function runShell(command, options) {
    return new Promise((resolve) => {
        exec(command, {
            cwd: options.cwd,
            timeout: options.timeoutMs,
            windowsHide: true,
            maxBuffer: 1024 * 1024
        }, (error, stdout, stderr) => {
            resolve({
                code: error?.code ?? 0,
                signal: error?.signal || null,
                timedOut: error?.killed && error?.signal === 'SIGTERM',
                stdout: stdout || '',
                stderr: stderr || '',
                error: error?.message || ''
            });
        });
    });
}

function trimOutput(value, maxOutput) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > maxOutput ? `${text.slice(0, maxOutput)}\n...output trimmed` : text;
}

module.exports = {
    config: {
        name: 'shell',
        aliases: ['sh', 'exec'],
        version: '1.0.0',
        description: 'Run a shell command on the bot host',
        usage: 'shell <command>',
        examples: ['shell git status --short', 'shell dir'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const command = args.join(' ').trim();
        const devConfig = getDevConfig();

        if (!devConfig.enabled) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    'Shell command is disabled.',
                    'Enable it with:',
                    '.config set developer.shellEnabled true'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        if (!command) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Use: .shell <command>'
            }, { quoted: msg });
            return;
        }

        if (isBlocked(command, devConfig.blockedPatterns)) {
            logger.log('shell_blocked', {
                userId: msg.key.participant || msg.key.remoteJid,
                command
            });
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'That shell command matched a blocked pattern.'
            }, { quoted: msg });
            return;
        }

        logger.log('shell_command', {
            userId: msg.key.participant || msg.key.remoteJid,
            chatId: msg.key.remoteJid,
            command: command.slice(0, 500)
        });

        await sock.sendMessage(msg.key.remoteJid, {
            text: `Running:\n${command}`
        }, { quoted: msg });

        const result = await runShell(command, devConfig);
        const stdout = trimOutput(result.stdout, devConfig.maxOutput);
        const stderr = trimOutput(result.stderr || result.error, devConfig.maxOutput);
        const output = [
            `*Shell Result*`,
            `Code: ${result.code}`,
            result.signal ? `Signal: ${result.signal}` : '',
            result.timedOut ? 'Timed out: true' : '',
            stdout ? `\n*stdout*\n${stdout}` : '',
            stderr ? `\n*stderr*\n${stderr}` : ''
        ].filter(Boolean).join('\n');

        await sock.sendMessage(msg.key.remoteJid, {
            text: output.slice(0, devConfig.maxOutput + 500) || 'Command finished with no output.'
        }, { quoted: msg });
    }
};
