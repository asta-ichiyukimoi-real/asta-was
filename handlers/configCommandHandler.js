const rawConfig = require('../config');

const DEFAULT_CONFIG = {
    prefix: '.',
    owner: '',
    admins: [],
    botName: 'Asta Bot',
    version: '1.0.0',
    commandCooldown: 3,
    dashboardPort: 3030,
    permissions: {
        owner: '',
        owners: [],
        admins: [],
        debugOwnerCheck: false,
        allowFromMeAsOwner: true
    },
    commands: {
        prefix: '.',
        cooldown: 3,
        disabledGlobally: []
    },
    dashboard: {
        enabled: true,
        port: 3030,
        host: '127.0.0.1'
    },
    logging: {
        ownerPermissionDebug: false,
        commandUsage: true
    },
    connection: {
        authDir: './auth_info_baileys',
        reconnectDelayMs: 2000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        startupMessageGraceSeconds: 300
    }
};

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfig(defaults, source) {
    const output = { ...defaults };

    Object.keys(source || {}).forEach((key) => {
        if (isPlainObject(defaults[key]) && isPlainObject(source[key])) {
            output[key] = mergeConfig(defaults[key], source[key]);
            return;
        }

        output[key] = source[key];
    });

    return output;
}

function normalizeJid(value) {
    return String(value || '').trim().toLowerCase();
}

class ConfigCommandHandler {
    constructor(config = rawConfig) {
        this.config = this.normalize(config);
    }

    normalize(config) {
        const merged = mergeConfig(DEFAULT_CONFIG, config || {});

        merged.prefix = merged.prefix || merged.commands.prefix || '.';
        merged.commands.prefix = merged.commands.prefix || merged.prefix;
        merged.owner = merged.owner || merged.permissions.owner || '';
        merged.admins = Array.isArray(merged.admins) ? merged.admins : [];
        merged.commandCooldown = merged.commandCooldown ?? merged.commands.cooldown ?? 3;
        merged.dashboardPort = merged.dashboardPort || merged.dashboard.port || 3030;

        const owners = [
            merged.owner,
            merged.permissions.owner,
            ...(Array.isArray(merged.permissions.owners) ? merged.permissions.owners : [])
        ].filter(Boolean);

        merged.permissions.owner = merged.permissions.owner || merged.owner;
        merged.permissions.owners = [...new Set(owners)];
        merged.permissions.admins = [
            ...new Set([
                ...merged.admins,
                ...(Array.isArray(merged.permissions.admins) ? merged.permissions.admins : [])
            ])
        ];

        return merged;
    }

    get(path, fallback) {
        const value = String(path || '')
            .split('.')
            .filter(Boolean)
            .reduce((current, key) => current?.[key], this.config);

        return value === undefined ? fallback : value;
    }

    getPrefix() {
        return this.get('commands.prefix', this.config.prefix || '.');
    }

    getDashboardPort() {
        return this.get('dashboard.port', this.config.dashboardPort || 3030);
    }

    getCommandCooldown(commandConfig = {}) {
        return commandConfig.cooldown ?? this.get('commands.cooldown', this.config.commandCooldown || 3);
    }

    getOwnerIds() {
        return this.get('permissions.owners', []).map(normalizeJid).filter(Boolean);
    }

    getAdminIds() {
        return this.get('permissions.admins', []).map(normalizeJid).filter(Boolean);
    }

    isOwner(sender, msg = {}) {
        if (this.get('permissions.allowFromMeAsOwner', true) && msg.key?.fromMe) {
            return true;
        }

        return this.getOwnerIds().includes(normalizeJid(sender));
    }

    isAdmin(sender) {
        return this.getAdminIds().includes(normalizeJid(sender));
    }

    isCommandDisabledGlobally(commandName) {
        const disabled = this.get('commands.disabledGlobally', []);
        return disabled.map(name => String(name).toLowerCase()).includes(String(commandName || '').toLowerCase());
    }

    shouldDebugOwnerPermission() {
        return Boolean(this.get('permissions.debugOwnerCheck', this.get('logging.ownerPermissionDebug', false)));
    }

    permissionDebug(sender, msg, commandName, isOwner) {
        return {
            command: commandName,
            expectedOwner: this.get('permissions.owner', this.config.owner),
            expectedOwners: this.get('permissions.owners', []),
            gotSender: sender,
            normalizedSender: normalizeJid(sender),
            remoteJid: msg.key?.remoteJid,
            participant: msg.key?.participant || null,
            fromMe: Boolean(msg.key?.fromMe),
            isOwner
        };
    }
}

module.exports = ConfigCommandHandler;
