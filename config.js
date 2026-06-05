const owner = '2349139977668@s.whatsapp.net';
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
        categories: ['general', 'utility', 'ai', 'media', 'group', 'moderation', 'admin', 'fun']
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
        aiChat: 'https://omegatech-api.dixonomega.tech/api/ai/Qwen-Claude-Haiku',
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
        customCommands: true
    }
};
