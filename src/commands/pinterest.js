const API_URL =
    'https://omegatech-api.dixonomega.tech/api/download/Pinterest';

const MAX_IMAGES = 10;
const DEFAULT_LIMIT = 1;
const REQUEST_TIMEOUT_MS = 60000;

function parseArgs(args) {
    const input = Array.isArray(args) ? [...args] : [];

    let limit = DEFAULT_LIMIT;

    const limitIndex = input.findIndex(arg =>
        /^-\d+$/.test(String(arg))
    );

    if (limitIndex !== -1) {
        limit = Number(
            String(input[limitIndex]).slice(1)
        );

        input.splice(limitIndex, 1);
    }

    if (!Number.isFinite(limit) || limit < 1) {
        limit = DEFAULT_LIMIT;
    }

    limit = Math.min(limit, MAX_IMAGES);

    return {
        query: input.join(' ').trim(),
        limit
    };
}

async function fetchPinterest(query, limit) {
    const url =
        `${API_URL}?action=search` +
        `&query=${encodeURIComponent(query)}` +
        `&limit=${limit}`;

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT_MS
        );

    try {
        const response =
            await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal
            });

        const raw =
            await response.text();

        console.log(
            'Pinterest API status:',
            response.status
        );

        console.log(
            'Pinterest API response:',
            raw.slice(0, 3000)
        );

        if (!response.ok) {
            throw new Error(
                `Pinterest API returned HTTP ${response.status}`
            );
        }

        if (!raw.trim()) {
            throw new Error(
                'Pinterest API returned an empty response.'
            );
        }

        let data;

        try {
            data = JSON.parse(raw);
        } catch (error) {
            throw new Error(
                'Pinterest API returned invalid JSON.'
            );
        }

        if (!data?.success) {
            throw new Error(
                data?.error ||
                data?.message ||
                'Pinterest search failed.'
            );
        }

        const results =
            Array.isArray(data?.results)
                ? data.results
                : Array.isArray(data?.data?.results)
                    ? data.data.results
                    : [];

        if (!results.length) {
            throw new Error(
                `No Pinterest results found for "${query}".`
            );
        }

        return results
            .filter(item => {
                const image =
                    item?.image ||
                    item?.thumbnail ||
                    item?.thumb;

                return Boolean(image);
            })
            .slice(0, limit);

    } catch (error) {
        if (
            error.name ===
            'AbortError'
        ) {
            throw new Error(
                'Pinterest API request timed out.'
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

async function downloadImage(url) {
    const response =
        await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

    if (!response.ok) {
        throw new Error(
            `Image download failed: HTTP ${response.status}`
        );
    }

    const contentType =
        response.headers.get(
            'content-type'
        ) || '';

    const arrayBuffer =
        await response.arrayBuffer();

    const buffer =
        Buffer.from(arrayBuffer);

    if (!buffer.length) {
        throw new Error(
            'Pinterest returned an empty image.'
        );
    }

    return {
        buffer,
        mimetype:
            contentType.startsWith('image/')
                ? contentType
                : 'image/jpeg'
    };
}

function getImageUrl(item) {
    return (
        item?.image ||
        item?.thumbnail ||
        item?.thumb ||
        ''
    );
}

function getTitle(item) {
    return String(
        item?.title ||
        'Pinterest'
    ).trim();
}

async function sendPinterestImages(
    sock,
    msg,
    query,
    results
) {
    const jid =
        msg.key.remoteJid;

    await sock.sendMessage(
        jid,
        {
            text:
                `🔎 *Pinterest:* ${query}\n` +
                `📌 Sending ${results.length} image${results.length === 1 ? '' : 's'}...`
        },
        {
            quoted: msg
        }
    );

    let sent = 0;

    for (
        let index = 0;
        index < results.length;
        index++
    ) {
        const item =
            results[index];

        const imageUrl =
            getImageUrl(item);

        if (!imageUrl) {
            continue;
        }

        try {
            const image =
                await downloadImage(
                    imageUrl
                );

            await sock.sendMessage(
                jid,
                {
                    image: image.buffer,
                    mimetype: image.mimetype,
                    caption:
                        getTitle(item)
                },
                {
                    quoted: msg
                }
            );

            sent++;

        } catch (error) {
            console.error(
                `Pinterest image ${index + 1} failed:`,
                error.message
            );
        }
    }

    if (!sent) {
        throw new Error(
            'All Pinterest images failed to download.'
        );
    }

    if (sent < results.length) {
        await sock.sendMessage(
            jid,
            {
                text:
                    `⚠️ ${sent}/${results.length} images were sent successfully.`
            },
            {
                quoted: msg
            }
        );
    }
}

module.exports = {
    config: {
        name: 'pin',

        aliases: [
            'pinterest',
            'pinterestsearch'
        ],

        version: '1.1.0',

        description:
            'Search Pinterest and send images',

        usage:
            'pin <query> [-number]',

        examples: [
            'pin asta',
            'pin asta -3',
            'pin asta and yuno -5',
            'pin cute anime -10'
        ],

        permissions: 0,

        cooldown: 10,

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
        } = parseArgs(args);

        if (!query) {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: [
                        '📌 *Pinterest Search*',
                        '',
                        'Usage:',
                        '.pin <search> [-number]',
                        '',
                        'Examples:',
                        '.pin asta',
                        '.pin asta -3',
                        '.pin asta and yuno -5',
                        '.pin cute anime -10',
                        '',
                        `Maximum: ${MAX_IMAGES} images`
                    ].join('\n')
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        try {
            const results =
                await fetchPinterest(
                    query,
                    limit
                );

            await sendPinterestImages(
                sock,
                msg,
                query,
                results
            );

        } catch (error) {
            console.error(
                'Pinterest command error:',
                error
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text:
                        `❌ Pinterest error: ${error.message}`
                },
                {
                    quoted: msg
                }
            );
        }
    }
};