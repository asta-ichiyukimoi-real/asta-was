const config = require('../../config');
const { requestJson, friendlyApiError } = require('../utils/apiClient');

const API_BASE =
    config.apis?.pinterestSearch ||
    'https://omegatech-api.dixonomega.tech/api/Search/pinterest';

const REQUEST_TIMEOUT_MS = 60000;

function parseQuery(args) {
    const input = args.join(' ').trim();

    if (!input) {
        return {
            query: '',
            limit: 1
        };
    }

    const match = input.match(/\s+-([0-9]+)\s*$/);

    if (!match) {
        return {
            query: input,
            limit: 1
        };
    }

    const requestedLimit = Number(match[1]);

    const query = input
        .slice(0, match.index)
        .trim();

    const limit = Math.min(
        Math.max(requestedLimit, 1),
        10
    );

    return {
        query,
        limit
    };
}

async function searchPinterest(query, limit) {
    const url =
        `${API_BASE}?query=${encodeURIComponent(query)}` +
        `&scope=pins` +
        `&limit=${limit}`;

    const response = await requestJson(
        url,
        {
            timeoutMs: REQUEST_TIMEOUT_MS,
            service: 'Pinterest API'
        }
    );

    if (!response?.success) {
        throw new Error(
            'Pinterest API returned an unsuccessful response.'
        );
    }

    if (!Array.isArray(response.results)) {
        throw new Error(
            'Pinterest API returned no results.'
        );
    }

    return response.results;
}

function cleanCaption(result, index, total) {
    const parts = [];

    parts.push(
        `📌 *Pinterest ${index}/${total}*`
    );

    if (result.title) {
        parts.push(
            `✨ ${result.title}`
        );
    }

    if (result.fullName) {
        parts.push(
            `👤 ${result.fullName}`
        );
    }

    if (result.pinUrl) {
        parts.push(
            `🔗 ${result.pinUrl}`
        );
    }

    return parts.join('\n');
}

async function sendPinterestResults(
    sock,
    msg,
    query,
    results
) {
    const jid = msg.key.remoteJid;

    const usableResults = results.filter(
        result =>
            result &&
            (
                result.image ||
                result.thumb
            )
    );

    if (!usableResults.length) {
        throw new Error(
            `No usable images were found for "${query}".`
        );
    }

    const total = usableResults.length;

    try {
        await sock.sendPresenceUpdate(
            'uploading',
            jid
        );
    } catch {}

    for (
        let index = 0;
        index < total;
        index++
    ) {
        const result =
            usableResults[index];

        const imageUrl =
            result.image ||
            result.thumb;

        const caption =
            cleanCaption(
                result,
                index + 1,
                total
            );

        try {
            await sock.sendMessage(
                jid,
                {
                    image: {
                        url: imageUrl
                    },
                    caption
                },
                {
                    quoted:
                        index === 0
                            ? msg
                            : undefined
                }
            );
        } catch (error) {
            console.error(
                `Pinterest image ${index + 1} failed:`,
                error
            );
        }
    }
}

async function handlePinterestError(
    sock,
    msg,
    error
) {
    console.error(
        'Pinterest command error:',
        error
    );

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: friendlyApiError(
                error,
                'Pinterest API'
            )
        },
        {
            quoted: msg
        }
    );
}

module.exports = {
    config: {
        name: 'pin',

        aliases: [
            'pinterest'
        ],

        version: '1.0.0',

        description:
            'Search and send Pinterest images',

        usage:
            'pin <query> [-number]',

        examples: [
            'pin asta',
            'pin asta -5',
            'pin asta and yuno -10'
        ],

        permissions: 0,

        cooldown: 8,

        category: 'media'
    },

    onRun: async (
        sock,
        msg,
        args
    ) => {
        const {
            query,
            limit
        } = parseQuery(args);

        if (!query) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: [
                        '📌 *Pinterest Search*',
                        '',
                        'Usage:',
                        '.pin <query>',
                        '.pin <query> -<number>',
                        '',
                        'Examples:',
                        '.pin asta',
                        '.pin asta -5',
                        '.pin asta and yuno -10',
                        '',
                        'Maximum: 10 images'
                    ].join('\n')
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        try {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        `🔎 Searching Pinterest for *${query}*...`
                },
                {
                    quoted: msg
                }
            );

            const results =
                await searchPinterest(
                    query,
                    limit
                );

            if (!results.length) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text:
                            `❌ No Pinterest results found for *${query}*.`
                    },
                    {
                        quoted: msg
                    }
                );

                return;
            }

            await sendPinterestResults(
                sock,
                msg,
                query,
                results
            );
        } catch (error) {
            await handlePinterestError(
                sock,
                msg,
                error
            );
        }
    }
};