const fs = require('fs');
const path = require('path');
const config = require('../../config');
const state = require('../utils/stateManager');
const { requestJson, getErrorMessage } = require('../utils/apiClient');

function check(name, ok, detail = '') {
    return { name, ok: Boolean(ok), detail };
}

async function apiChecks(timeoutMs) {
    const apis = global.configCommandHandler?.get?.('apis', config.apis) || config.apis || {};
    const endpoints = [
        ['AI Chat', `${apis.aiChat}?message=ping&session_id=selftest`],
        ['Pinterest', `${apis.pinterest}?query=akaza&scope=pins&limit=1`],
        ['Wallpaper', `${apis.wallpaper}?name=akaza`]
    ];

    return Promise.all(endpoints.map(async ([name, url]) => {
        try {
            await requestJson(url, { service: name, timeoutMs });
            return check(name, true, 'OK');
        } catch (error) {
            return check(name, false, getErrorMessage(error).slice(0, 120));
        }
    }));
}

module.exports = {
    config: {
        name: 'selftest',
        aliases: ['testbot', 'diagnose'],
        version: '1.0.0',
        description: 'Runs bot diagnostics',
        usage: 'selftest [api]',
        examples: ['selftest', 'selftest api'],
        permissions: 2,
        category: 'developer'
    },
    onRun: async (sock, msg, args) => {
        const includeApi = args[0]?.toLowerCase() === 'api';
        const results = [];
        const commandHandler = global.commandHandler;
        const configHandler = global.configCommandHandler;

        results.push(check('config.js', Boolean(config.prefix && config.owner), `prefix=${config.prefix}`));
        results.push(check('config handler', Boolean(configHandler?.getPrefix), configHandler?.getPrefix?.() || 'missing'));

        try {
            JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bot-state.json'), 'utf8'));
            results.push(check('bot-state.json', true, 'valid JSON'));
        } catch (error) {
            results.push(check('bot-state.json', false, error.message));
        }

        const commandsSize = commandHandler?.commands?.size || 0;
        const uniqueCommands = commandHandler?.commands ? new Set(commandHandler.commands.values()).size : 0;
        results.push(check('commands loaded', commandsSize > 0, `${uniqueCommands} commands / ${commandsSize} entries`));
        results.push(check('owner configured', (configHandler?.getOwnerIds?.() || []).length > 0, (configHandler?.getOwnerIds?.() || []).join(', ') || 'none'));

        const runtimeConfig = state.getRuntimeConfig();
        results.push(check('runtime config', true, `${Object.keys(runtimeConfig).length} override(s)`));
        results.push(check('logs state', Array.isArray(state.getState().logs?.recent), 'recent log buffer'));

        if (includeApi) {
            results.push(...await apiChecks(configHandler?.get?.('developer.apiStatusTimeoutMs', 10000) || 10000));
        }

        const lines = results.map(item => `${item.ok ? 'OK' : 'FAIL'} ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
        const failed = results.filter(item => !item.ok).length;

        await sock.sendMessage(msg.key.remoteJid, {
            text: `*Self Test*\n${lines.join('\n')}\n\nResult: ${failed ? `${failed} issue(s)` : 'all good'}`
        }, { quoted: msg });
    }
};
