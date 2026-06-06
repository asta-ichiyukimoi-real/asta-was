const config = require('../../config');
const { requestJson, getErrorMessage } = require('../utils/apiClient');

function devConfig(path, fallback) {
    return global.configCommandHandler?.get?.(path, fallback) ?? fallback;
}

function endpointConfig() {
    const apis = global.configCommandHandler?.get?.('apis', config.apis) || config.apis || {};
    return [
        {
            name: 'AI Chat',
            url: `${apis.aiChat}?message=${encodeURIComponent('ping')}&model=qwen&sessionId=apistatus`
        },
        {
            name: 'AI Research',
            url: `${apis.aiResearch}?message=${encodeURIComponent('ping')}`
        },
        {
            name: 'Vision',
            url: `${apis.aiVision}?message=${encodeURIComponent('what is here')}&imageUrl=${encodeURIComponent('https://i.pinimg.com/236x/f5/6a/87/f56a87d1d56b3e44233eae545a5f8651.jpg')}&model=1&sessionId=apistatus`
        },
        {
            name: 'Pinterest',
            url: `${apis.pinterest}?query=akaza&scope=pins&limit=1`
        },
        {
            name: 'Wallpaper',
            url: `${apis.wallpaper}?name=akaza`
        },
        {
            name: 'Media',
            url: `${apis.mediaDownload}?query=faded&format=mp3&quality=360p`
        }
    ].filter(item => item.url && !item.url.startsWith('undefined'));
}

module.exports = {
    config: {
        name: 'apistatus',
        aliases: ['apis', 'checkapi'],
        version: '1.0.0',
        description: 'Checks configured API endpoints',
        usage: 'apistatus',
        examples: ['apistatus'],
        permissions: 2,
        cooldown: 15,
        category: 'developer'
    },
    onRun: async (sock, msg) => {
        const timeoutMs = devConfig('developer.apiStatusTimeoutMs', config.developer?.apiStatusTimeoutMs || 10000);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Checking APIs...' }, { quoted: msg });

        const checks = await Promise.all(endpointConfig().map(async (endpoint) => {
            const started = Date.now();
            try {
                await requestJson(endpoint.url, {
                    timeoutMs,
                    service: endpoint.name,
                    retries: 0
                });
                return {
                    name: endpoint.name,
                    ok: true,
                    ms: Date.now() - started
                };
            } catch (error) {
                return {
                    name: endpoint.name,
                    ok: false,
                    ms: Date.now() - started,
                    error: getErrorMessage(error)
                };
            }
        }));

        const lines = checks.map(item => item.ok
            ? `${item.name}: OK (${item.ms}ms)`
            : `${item.name}: FAIL (${item.ms}ms) - ${item.error.slice(0, 120)}`);

        await sock.sendMessage(msg.key.remoteJid, {
            text: `*API Status*\n${lines.join('\n')}`
        }, { quoted: msg });
    }
};
