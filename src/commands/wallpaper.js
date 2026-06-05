const WALLPAPER_URL = 'https://omegatech-api.dixonomega.tech/api/tools/wallpaper';
const MAX_WALLPAPERS = 10;

function parseArgs(args) {
    const parts = [...args];
    let count = 1;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const match = String(parts[i]).match(/^-?(\d{1,2})$/);
        if (!match) continue;

        count = Number(match[1]);
        parts.splice(i, 1);
        break;
    }

    if (!Number.isInteger(count) || count < 1) count = 1;
    count = Math.min(count, MAX_WALLPAPERS);

    return {
        query: parts.join(' ').trim(),
        count
    };
}

async function fetchWallpapers(query, count) {
    const url = `${WALLPAPER_URL}?name=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(45000)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.status === false || data?.success === false) {
        throw new Error(data?.message || data?.error || `API responded with status ${response.status}`);
    }

    const results = (Array.isArray(data?.results) ? data.results : [])
        .filter(item => /^https?:\/\//i.test(item?.image || ''))
        .slice(0, count);

    if (!results.length) {
        throw new Error('No wallpapers found for that query.');
    }

    return {
        query: data.query || query,
        results
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    config: {
        name: 'wallpaper',
        aliases: ['wall', 'walls'],
        version: '1.0.0',
        description: 'Search and send wallpapers',
        usage: 'wallpaper <query> [-count]',
        examples: ['wallpaper akaza -4', 'wall goku'],
        permissions: 0,
        cooldown: 6,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const { query, count } = parseArgs(args);

        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send a wallpaper search query.\nExample: .wallpaper akaza -4'
            }, { quoted: msg });
            return;
        }

        try {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Searching wallpapers for *${query}*...`
            }, { quoted: msg });

            const { results } = await fetchWallpapers(query, count);

            for (let i = 0; i < results.length; i += 1) {
                const item = results[i];
                await sock.sendMessage(msg.key.remoteJid, {
                    image: { url: item.image },
                    caption: [
                        `*Wallpaper${results.length > 1 ? ` ${i + 1}/${results.length}` : ''}*`,
                        item.title || query,
                        item.link || ''
                    ].filter(Boolean).join('\n')
                }, { quoted: i === 0 ? msg : undefined });

                if (i < results.length - 1) {
                    await delay(800);
                }
            }
        } catch (error) {
            console.error('Wallpaper command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `Wallpaper failed: ${error.message || error}`
            }, { quoted: msg });
        }
    }
};
