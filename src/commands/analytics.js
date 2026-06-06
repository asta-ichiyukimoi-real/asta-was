const state = require('../utils/stateManager');
const commandQueue = require('../utils/commandQueue');

function topEntries(object, limit = 8) {
    return Object.entries(object || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
}

module.exports = {
    config: {
        name: 'analytics',
        aliases: ['metrics', 'botstats'],
        version: '1.0.0',
        description: 'Shows bot usage, errors, and runtime metrics',
        usage: 'analytics',
        examples: ['analytics'],
        permissions: 2,
        category: 'developer'
    },
    onRun: async (sock, msg) => {
        const snapshot = state.getState();
        const usage = snapshot.usage || {};
        const recentLogs = snapshot.logs?.recent || [];
        const errorLogs = recentLogs.filter(entry => /error|fail/i.test(entry.type || ''));
        const apiErrors = recentLogs.filter(entry => entry.type === 'api_error');
        const topCommands = topEntries(usage.commands, 8);
        const commandCount = global.commandHandler?.commands?.size || 0;
        const replyCount = global.replyCommandHandler?.replyCommands?.size || 0;
        const chatCount = global.chatCommandHandler?.chatCommands?.size || 0;

        const text = [
            '*Bot Analytics*',
            `Total commands: ${usage.totalCommands || 0}`,
            `Command entries: ${commandCount}`,
            `Reply entries: ${replyCount}`,
            `Chat triggers: ${chatCount}`,
            `Queue size: ${commandQueue.size()}`,
            `Recent errors: ${errorLogs.length}`,
            `Recent API errors: ${apiErrors.length}`,
            `Custom command chats: ${Object.keys(snapshot.customCommands?.chats || {}).length}`,
            `Role chats: ${Object.keys(snapshot.roles?.chats || {}).length}`,
            '',
            '*Top Commands*',
            topCommands.length
                ? topCommands.map(([name, count], index) => `${index + 1}. ${name}: ${count}`).join('\n')
                : 'none',
            '',
            '*Last Error*',
            errorLogs[0] ? `${errorLogs[0].type}: ${errorLogs[0].error || errorLogs[0].message || 'see logs'}` : 'none'
        ].join('\n');

        await sock.sendMessage(msg.key.remoteJid, { text: text.slice(0, 3500) }, { quoted: msg });
    }
};
