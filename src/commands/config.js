const baseConfig = require('../../config');
const state = require('../utils/stateManager');

function parseValue(raw) {
    const value = String(raw || '').trim();
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function getDeepValue(source, path) {
    return String(path || '')
        .split('.')
        .filter(Boolean)
        .reduce((current, key) => current?.[key], source);
}

function refreshConfigHandler() {
    if (global.configCommandHandler?.reload) {
        global.configCommandHandler.reload();
    }
}

function formatValue(value) {
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
}

module.exports = {
    config: {
        name: 'config',
        aliases: ['cfg', 'runtimeconfig'],
        version: '1.0.0',
        description: 'View and change runtime config overrides',
        usage: 'config <get|set|delete|list|category>',
        examples: [
            'config get media.wallpaperMaxImages',
            'config set media.wallpaperMaxImages 15',
            'config delete media.wallpaperMaxImages',
            'config category media off'
        ],
        permissions: 2,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const action = args[0]?.toLowerCase();

        if (!action) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    '*Config Command*',
                    '.config get <path>',
                    '.config set <path> <value>',
                    '.config delete <path>',
                    '.config list',
                    '.config category <category> on/off'
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        if (action === 'list') {
            const overrides = state.getRuntimeConfig();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Runtime Config Overrides*\n${Object.keys(overrides).length ? JSON.stringify(overrides, null, 2) : 'none'}`
            }, { quoted: msg });
            return;
        }

        if (action === 'get') {
            const path = args[1];
            const runtime = state.getRuntimeConfig();
            const runtimeValue = runtime[path];
            const currentValue = global.configCommandHandler?.get?.(path, getDeepValue(baseConfig, path));
            await sock.sendMessage(msg.key.remoteJid, {
                text: [
                    `*${path || 'config'}*`,
                    `Current: ${formatValue(currentValue)}`,
                    `Runtime override: ${formatValue(runtimeValue)}`
                ].join('\n')
            }, { quoted: msg });
            return;
        }

        if (action === 'set') {
            const path = args[1];
            const rawValue = args.slice(2).join(' ');
            if (!path || !rawValue) {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Use: .config set <path> <value>' }, { quoted: msg });
                return;
            }

            const value = parseValue(rawValue);
            state.setRuntimeConfig(path, value);
            refreshConfigHandler();
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Set ${path} = ${formatValue(value)}`
            }, { quoted: msg });
            return;
        }

        if (['delete', 'del', 'reset'].includes(action)) {
            const path = args[1];
            if (!path) {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Use: .config delete <path>' }, { quoted: msg });
                return;
            }

            state.deleteRuntimeConfig(path);
            refreshConfigHandler();
            await sock.sendMessage(msg.key.remoteJid, { text: `Deleted runtime override: ${path}` }, { quoted: msg });
            return;
        }

        if (action === 'category') {
            const category = args[1]?.toLowerCase();
            const value = args[2]?.toLowerCase();
            if (!category || !['on', 'off'].includes(value)) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: 'Use: .config category <category> on/off'
                }, { quoted: msg });
                return;
            }

            const disabled = value === 'off';
            const disabledCategories = state.setCategoryDisabled(msg.key.remoteJid, category, disabled);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `${category} category ${disabled ? 'disabled' : 'enabled'} here.\nDisabled categories: ${disabledCategories.join(', ') || 'none'}`
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(msg.key.remoteJid, { text: 'Unknown config action.' }, { quoted: msg });
    }
};
