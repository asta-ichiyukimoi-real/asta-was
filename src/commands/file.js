const fs = require('fs');
const path = require('path');

const WORKSPACE = process.cwd();
const MAX_READ_CHARS = 3500;
const MAX_SEND_BYTES = 25 * 1024 * 1024;

function resolveWorkspacePath(inputPath = '.') {
    const target = path.resolve(WORKSPACE, inputPath);
    const relative = path.relative(WORKSPACE, target);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Path is outside the bot workspace.');
    }

    return target;
}

function relativePath(target) {
    return path.relative(WORKSPACE, target) || '.';
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function listPath(target) {
    const entries = fs.readdirSync(target, { withFileTypes: true })
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .slice(0, 60);

    return entries.map((entry) => {
        const fullPath = path.join(target, entry.name);
        const stat = fs.statSync(fullPath);
        const marker = entry.isDirectory() ? '/' : '';
        return `${entry.name}${marker} - ${formatBytes(stat.size)}`;
    }).join('\n');
}

module.exports = {
    config: {
        name: 'file',
        aliases: ['files', 'fs'],
        version: '1.0.0',
        description: 'Read, list, or send workspace files',
        usage: 'file <list|read|send|stat> [path]',
        examples: ['file list src/commands', 'file read config.js', 'file send bot-state.json'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const action = args[0]?.toLowerCase();
        const inputPath = args.slice(1).join(' ') || '.';

        if (!action || !['list', 'ls', 'read', 'cat', 'send', 'stat'].includes(action)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    '*File Command*',
                    '.file list <path>',
                    '.file read <path>',
                    '.file send <path>',
                    '.file stat <path>'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        try {
            const target = resolveWorkspacePath(inputPath);
            if (!fs.existsSync(target)) {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Path not found.' }, { quoted: msg });
                return;
            }

            const stat = fs.statSync(target);

            if (['list', 'ls'].includes(action)) {
                if (!stat.isDirectory()) {
                    await sock.sendMessage(msg.key.remoteJid, { text: 'That path is not a directory.' }, { quoted: msg });
                    return;
                }

                const listing = listPath(target);
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `*${relativePath(target)}*\n${listing || 'empty'}`
                }, { quoted: msg });
                return;
            }

            if (action === 'stat') {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: [
                        `Path: ${relativePath(target)}`,
                        `Type: ${stat.isDirectory() ? 'directory' : 'file'}`,
                        `Size: ${formatBytes(stat.size)}`,
                        `Modified: ${stat.mtime.toISOString()}`
                    ].join('\n')
                }, { quoted: msg });
                return;
            }

            if (stat.isDirectory()) {
                await sock.sendMessage(msg.key.remoteJid, { text: 'That path is a directory. Use .file list instead.' }, { quoted: msg });
                return;
            }

            if (['read', 'cat'].includes(action)) {
                const text = fs.readFileSync(target, 'utf8');
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `*${relativePath(target)}*\n${text.slice(0, MAX_READ_CHARS)}${text.length > MAX_READ_CHARS ? '\n...file trimmed' : ''}`
                }, { quoted: msg });
                return;
            }

            if (action === 'send') {
                if (stat.size > MAX_SEND_BYTES) {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `File is too large to send (${formatBytes(stat.size)}). Limit is ${formatBytes(MAX_SEND_BYTES)}.`
                    }, { quoted: msg });
                    return;
                }

                await sock.sendMessage(msg.key.remoteJid, {
                    document: fs.readFileSync(target),
                    fileName: path.basename(target),
                    mimetype: 'application/octet-stream',
                    caption: relativePath(target)
                }, { quoted: msg });
            }
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `File command failed: ${error.message || error}`
            }, { quoted: msg });
        }
    }
};
