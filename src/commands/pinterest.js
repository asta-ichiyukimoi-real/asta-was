const config = require('../../config');
const { requestJson, friendlyApiError } = require('../utils/apiClient');

const PINTEREST_URL = config.apis?.pinterest || 'https://omegatech-api.dixonomega.tech/api/Search/pinterest';
const MAX_PINTEREST_IMAGES = config.media?.pinterestMaxImages || 8;
const IMAGE_SEND_DELAY_MS = config.media?.imageSendDelayMs || 800;

function parseArgs(args) {
    const parts = [...args];
    let count = 5;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const match = String(parts[i]).match(/^-?(\d{1,2})$/);
        if (!match) continue;

        count = Number(match[1]);
        parts.splice(i, 1);
        break;
    }

    if (!Number.isInteger(count) || count < 1) count = 1;
    count = Math.min(count, MAX_PINTEREST_IMAGES);

    return {
        query: parts.join(' ').trim(),
        count
    };
}

async function fetchPinterestImages(query, count) {
    const limit = Math.min(Math.max(Number(count) || 1, 1), MAX_PINTEREST_IMAGES);
    const url = `${PINTEREST_URL}?query=${encodeURIComponent(query)}&scope=pins&limit=${limit}`;
    const data = await requestJson(url, { service: 'Pinterest API' });

    const images = (Array.isArray(data?.results) ? data.results : [])
        .map(item => ({
            image: item.image || item.thumb,
            title: item.title || query,
            link: item.link || item.url || ''
        }))
        .filter(item => /^https?:\/\//i.test(item.image || ''))
        .slice(0, limit);

    if (!images.length) {
        throw new Error('No Pinterest images found for that query.');
    }

    return images;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    config: {
        name: 'pinterest',
        aliases: ['pin', 'pinsearch'],
        version: '1.1.0',
        description: 'Search images on Pinterest',
        usage: 'pinterest <query> [-count]',
        examples: ['pinterest anime girl', 'pin akaza -4'],
        permissions: 0,
        cooldown: 6,
        category: 'media'
    },
    onRun: async (sock, msg, args) => {
        const { query, count } = parseArgs(args);

        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please provide a search query.\nExample: .pinterest anime girl -4'
            }, { quoted: msg });
            return;
        }

        try {
            try {
                await sock.sendPresenceUpdate('uploading', msg.key.remoteJid);
            } catch {}

            await sock.sendMessage(msg.key.remoteJid, {
                text: `Searching Pinterest for *${query}*...`
            }, { quoted: msg });

            const images = await fetchPinterestImages(query, count);

            for (let i = 0; i < images.length; i += 1) {
                const item = images[i];
                await sock.sendMessage(msg.key.remoteJid, {
                    image: { url: item.image },
                    caption: [
                        `*Pinterest Image${images.length > 1 ? ` ${i + 1}/${images.length}` : ''}*`,
                        item.title || query,
                        item.link || ''
                    ].filter(Boolean).join('\n')
                }, { quoted: i === 0 ? msg : undefined });

                if (i < images.length - 1) {
                    await delay(IMAGE_SEND_DELAY_MS);
                }
            }
        } catch (error) {
            console.error('Pinterest command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: friendlyApiError(error, 'Pinterest API')
            }, { quoted: msg });
        }
    }
};
