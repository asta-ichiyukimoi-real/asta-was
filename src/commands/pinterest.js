const config = require('../../config');
const { friendlyApiError } = require('../utils/apiClient');

const API_BASE =
    config.apis?.pinterestSearch ||
    'https://omegatech-api.dixonomega.tech/api/Search/pinterest';

const REQUEST_TIMEOUT_MS = 60000;

/**
 * Parse:
 *
 * .pin asta
 * .pin asta -5
 * .pin asta and yuno -10
 */
function parseQuery(args) {
    const input = args.join(' ').trim();

    if (!input) {
        return {
            query: '',
            limit: 1
        };
    }

    // Number must be at the end.
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

    return {
        query,
        limit: Math.min(
            Math.max(requestedLimit, 1),
            10
        )
    };
}

/**
 * Fetch Pinterest results.
 *
 * We intentionally do NOT use requestJson()
 * because the Pinterest endpoint has been returning
 * a valid 200 response that requestJson() is rejecting.
 */
async function fetchPinterestImages(query, limit) {
    const url =
        `${API_BASE}?query=${encodeURIComponent(query)}` +
        `&scope=pins` +
        `&limit=${limit}`;

    console.log('Pinterest API URL:', url);

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal
        });

        const raw = await response.text();

        console.log(
            `Pinterest API status: ${response.status}`
        );

        console.log(
            `Pinterest API response length: ${raw.length}`
        );

        if (!response.ok) {
            throw new Error(
                `Pinterest API returned HTTP ${response.status}`
            );
        }

        if (!raw || !raw.trim()) {
            throw new Error(
                'Pinterest API returned an empty response.'
            );
        }

        let data;

        try {
            data = JSON.parse(raw);
        } catch (error) {
            console.error(
                'Pinterest API invalid JSON:',
                raw.slice(0, 2000)
            );

            throw new Error(
                'Pinterest API returned invalid JSON.'
            );
        }

        console.log(
            'Pinterest API parsed successfully:',
            JSON.stringify(data).slice(0, 1000)
        );

        if (!data?.success) {
            throw new Error(
                data?.message ||
                'Pinterest API returned an unsuccessful response.'
            );
        }

        if (!Array.isArray(data.results)) {
            throw new Error(
                'Pinterest API did not return a results array.'
            );
        }

        return data.results;

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(
                'Pinterest API request timed out.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Create a caption for each Pinterest image.
 */
function createCaption(result, index, total) {
    const lines = [
        `📌 *Pinterest ${index}/${total}*`
    ];

    if (result.title) {
        lines.push(
            `✨ ${result.title}`
        );
    }

    if (result.fullName) {
        lines.push(
            `👤 ${result.fullName}`
        );
    } else if (result.username) {
        lines.push(
            `👤 @${result.username}`
        );
    }

    if (result.pinUrl) {
        lines.push(
            `🔗 ${result.pinUrl}`
        );
    }

    return lines.join('\n');
}

/**
 * Send Pinterest images to WhatsApp.
 */
async function sendPinterestImages(
    sock,
    msg,
    query,
    results
) {
    const jid = msg.key.remoteJid;

    /*
     * Only keep results that actually have an image.
     */
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

    /*
     * Send them one by one.
     *
     * This is more reliable than sending all
     * images in one operation.
     */
    for (
        let index = 0;
        index < total;
        index++
    ) {
        const result =
            usableResults[index];

        /*
         * Prefer the original image.
         * Fall back to thumbnail if necessary.
         */
        const imageUrl =
            result.image ||
            result.thumb;

        const caption =
            createCaption(
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

            /*
             * Small delay between images.
             *
             * Helps avoid hammering WhatsApp
             * when requesting 10 images.
             */
            if (index < total - 1) {
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            500
                        )
                );
            }

        } catch (error) {
            console.error(
                `Failed to send Pinterest image ${index + 1}:`,
                error
            );
        }
    }
}

/**
 * Send errors in a user-friendly way.
 */
async function handlePinterestError(
    sock,
    msg,
    error
) {
    console.error(
        'Pinterest command error:',
        error
    );

    let message;

    try {
        message = friendlyApiError(
            error,
            'Pinterest API'
        );
    } catch {
        message =
            error?.message ||
            'Something went wrong while searching Pinterest.';
    }

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: `❌ ${message}`
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

        version: '1.1.0',

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

        /*
         * No query.
         */
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

        /*
         * Tell the user we're searching.
         */
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

        try {
            /*
             * Search Pinterest.
             */
            const results =
                await fetchPinterestImages(
                    query,
                    limit
                );

            /*
             * No results.
             */
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

            /*
             * Send images.
             */
            await sendPinterestImages(
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