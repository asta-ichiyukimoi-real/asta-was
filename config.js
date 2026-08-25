const owner = '63097851101285@lid';
const admins = [];

module.exports = {
    prefix: '.',
    owner,
    admins,
    botName: 'Asta Bot',
    version: '1.0.0',
    commandCooldown: 3,
    dashboardPort: 3030,

    bot: {
        name: 'Asta Bot',
        version: '1.0.0',
        description: 'WhatsApp assistant with AI, media, moderation, and utility commands',
        timezone: 'Africa/Lagos',
        locale: 'en-US'
    },

    assets: {
        defaultCommandImageUrl: 'https://shz.al/Sfba',
        commandImages: {
            help: 'https://shz.al/Sfba',
            menu: '',
            info: 'https://shz.al/A42x',
            health: 'https://shz.al/x58W',
            ping: 'https://shz.al/XYew',
            prefix: 'https://shz.al/jGQt',
            stats: '',
            analytics: '',
            features: '',
            selftest: ''
        }
    },

    permissions: {
        owner,
        owners: [owner],
        admins,
        debugOwnerCheck: true,
        allowFromMeAsOwner: true
    },

    commands: {
        prefix: '.',
        cooldown: 3,
        maxArgsLength: 1000,
        mentionPrefixEnabled: false,
        disabledGlobally: [],
        categories: ['general', 'utility', 'ai', 'media', 'group', 'moderation', 'admin', 'developer', 'fun']
    },

    media: {
        pinterestMaxImages: 8,
        wallpaperMaxImages: 10,
        mediaDownloadQuality: '360p',
        mediaDownloadTimeoutMs: 60000,
        imageSendDelayMs: 800
    },

    ai: {
        timezone: 'Africa/Lagos',
        maxMemoryMessages: 12,
        contextMessages: 8,
        maxPinterestImages: 8,
        requestTimeoutMs: 45000,
        visionTimeoutMs: 60000,
        researchTimeoutMs: 60000
    },

    apis: {
        omegatechBase: 'https://omegatech-api.dixonomega.tech',
        aiChat: 'https://vision-scrape-2ex8.onrender.com/ai/chat',
        aiResearch: 'https://omegatech-api.dixonomega.tech/api/ai/Ai-research',
        aiVision: 'https://omegatech-api.dixonomega.tech/api/ai/Gpt-4-mini',
        pinterest: 'https://omegatech-api.dixonomega.tech/api/Search/pinterest',
        wallpaper: 'https://omegatech-api.dixonomega.tech/api/tools/wallpaper',
        mediaDownload: 'https://omegatech-api.dixonomega.tech/api/download/play',
        catboxUpload: 'https://catbox.moe/user/api.php'
    },

    dashboard: {
        enabled: true,
        port: 3030,
        host: '127.0.0.1'
    },

    connection: {
        authDir: './auth_info_baileys',
        // Digits only, with country code. Example: '23491564521'
        pairingPhoneNumber: '234xxxxxxxxxx',
        reconnectDelayMs: 2000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        startupMessageGraceSeconds: 300
    },

    logging: {
        ownerPermissionDebug: true,
        commandUsage: true,
        moderation: true,
        maxRecentLogs: 100
    },

    developer: {
        shellEnabled: false,
        evalEnabled: false,
        shellTimeoutMs: 15000,
        evalTimeoutMs: 5000,
        shellMaxOutput: 3500,
        evalMaxOutput: 3500,
        shellCwd: process.cwd(),
        restartCommand: '',
        restartExitCode: 0,
        envAllowList: ['BOT_TIMEZONE', 'PORT', 'NODE_ENV'],
        apiStatusTimeoutMs: 10000,
        blockedShellPatterns: [
            'rm -rf',
            'del /f',
            'format ',
            'shutdown',
            'restart-computer',
            'stop-computer',
            'remove-item -recurse',
            'git reset --hard'
        ],
        logsMaxLines: 30
    },

    moderation: {
        antiLinkDefault: false,
        warningsBeforeAction: 3,
        deleteViolations: true
    },

    features: {
        dashboard: true,
        reminders: true,
        welcome: true,
        farewell: true,
        autoReply: true,
        customCommands: true,
        developerCommands: true
    }
};