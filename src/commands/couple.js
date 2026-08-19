const { friendlyApiError } = require('../utils/apiClient');

const API_URL =
    'https://omegatech-api.dixonomega.tech/api/random/couple-pp';


async function getCoupleImages() {
    const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Couple API returned HTTP ${response.status}.`
        );
    }

    if (!text.trim()) {
        throw new Error(
            'Couple API returned an empty response.'
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        console.error(
            '[Couple] Invalid API response:',
            text.slice(0, 500)
        );

        throw new Error(
            'Couple API returned invalid JSON.'
        );
    }

    if (
        data?.success !== true ||
        !data?.result?.male ||
        !data?.result?.female
    ) {
        console.error(
            '[Couple] Unexpected API response:',
            JSON.stringify(data)
        );

        throw new Error(
            'Couple API returned invalid image data.'
        );
    }

    return {
        male: data.result.male,
        female: data.result.female
    };
}


module.exports = {
    config: {
        name: 'couple',

        aliases: [
            'couplepp',
            'couplepic',
            'couplepics'
        ],

        version: '1.0.0',

        description:
            'Get random matching couple profile pictures',

        usage:
            'couple',

        examples: [
            'couple',
            'couplepp'
        ],

        permissions: 0,

        cooldown: 5,

        category: 'image'
    },


    onRun: async (sock, msg) => {
        try {
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: '💑 Finding a random couple...'
                },
                { quoted: msg }
            );

            const couple =
                await getCoupleImages();

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: {
                        url: couple.male
                    },
                    caption: '👨 Male'
                },
                { quoted: msg }
            );

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    image: {
                        url: couple.female
                    },
                    caption: '👩 Female'
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error(
                'Couple command error:',
                error
            );

            let message;

            try {
                message = friendlyApiError(
                    error,
                    'Couple API'
                );
            } catch {
                message =
                    error?.message ||
                    'Failed to get couple pictures.';
            }

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `❌ ${message}`
                },
                { quoted: msg }
            );
        }
    }
};