const fs = require('fs');
const path = require('path');
const config = require('../../config');
const state = require('../utils/stateManager');

const LOG_DIR = path.join(__dirname, '../../logs');

function todayLogPath() {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(LOG_DIR, `bot-${day}.log`);
}

function tailLines(filePath, count) {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-count);
}

function formatLogLine(line) {
    try {
        const entry = JSON.parse(line);
        const detail = { ...entry };
        delete detail.type;
        delete detail.at;
        return `[${entry.at || 'unknown'}] ${entry.type || 'log'} ${JSON.stringify(detail)}`;
    } catch {
        return line;
    }
}

module.exports = {
    config: {
        name: 'logs',
        aliases: ['logtail', 'tail'],
        version: '1.0.0',
        description: 'Show recent bot logs',
        usage: 'logs [lines]',
        examples: ['logs', 'logs 20'],
        permissions: 2,
        cooldown: 0,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const handler = global.configCommandHandler;
        const maxLines = handler?.get?.('developer.logsMaxLines', config.developer?.logsMaxLines) || 30;
        const requested = Number(args[0]) || 10;
        const count = Math.min(Math.max(requested, 1), maxLines);
        const recentStateLogs = (state.getState().logs.recent || []).slice(0, count);
        let lines = tailLines(todayLogPath(), count).map(formatLogLine);

        if (!lines.length && recentStateLogs.length) {
            lines = recentStateLogs.map(entry => `[${entry.at || 'unknown'}] ${entry.type || 'log'} ${JSON.stringify(entry)}`);
        }

        await sock.sendMessage(msg.key.remoteJid, {
            text: lines.length
                ? `*Recent Logs (${lines.length})*\n${lines.join('\n').slice(0, 3500)}`
                : 'No logs found yet.'
        }, { quoted: msg });
    }
};
