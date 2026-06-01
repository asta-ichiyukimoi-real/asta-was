const fs = require('fs');
const path = require('path');

const MODEL = 'qwen/qwen-image-2.0';
const PUTER_API_ORIGIN = process.env.PUTER_API_ORIGIN || 'https://api.puter.com';
const TOKEN_FILE = path.join(__dirname, '../../data/puter-token.txt');

function getAuthToken() {
    const envToken = process.env.PUTER_AUTH_TOKEN || process.env.puterAuthToken || '';
    if (envToken) return envToken.trim();

    if (fs.existsSync(TOKEN_FILE)) {
        return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }

    return '';
}

function requireAuthToken() {
    const token = getAuthToken();
    if (!token) {
        throw new Error('PUTER_AUTH_TOKEN is not set');
    }

    return token;
}

function dataUriToBuffer(dataUri) {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    return {
        mime: match[1],
        buffer: Buffer.from(match[2], 'base64')
    };
}

function isProbablyBase64Image(value) {
    return typeof value === 'string'
        && value.length > 500
        && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function base64ToBuffer(value, mime = 'image/png') {
    return {
        mime,
        buffer: Buffer.from(value, 'base64')
    };
}

function summarizeShape(value, depth = 0) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object') {
        return `${typeof value}${typeof value === 'string' ? `(${value.length})` : ''}`;
    }

    if (Array.isArray(value)) {
        return `array(${value.length})[${value.slice(0, 2).map(item => summarizeShape(item, depth + 1)).join(', ')}]`;
    }

    const keys = Object.keys(value).slice(0, 12);
    if (depth >= 2) return `object{${keys.join(', ')}}`;

    return `object{${keys.map(key => `${key}:${summarizeShape(value[key], depth + 1)}`).join(', ')}}`;
}

function normalizeImageCandidate(value) {
    if (!value) return null;

    if (Buffer.isBuffer(value)) {
        return { buffer: value, mime: 'image/png' };
    }

    if (typeof value === 'string') {
        if (value.startsWith('data:')) {
            return dataUriToBuffer(value);
        }

        if (/^https?:\/\//i.test(value)) {
            return { url: value };
        }

        if (isProbablyBase64Image(value)) {
            return base64ToBuffer(value);
        }
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const image = normalizeImageCandidate(item);
            if (image) return image;
        }
        return null;
    }

    if (typeof value === 'object') {
        if (Array.isArray(value.data) && value.type === 'Buffer') {
            return { buffer: Buffer.from(value.data), mime: value.mime || 'image/png' };
        }

        const preferredKeys = [
            'url',
            'src',
            'image_url',
            'imageUrl',
            'output_url',
            'download_url',
            'signed_url',
            'public_url',
            'data_uri',
            'dataUri',
            'b64_json',
            'base64',
            'image_base64',
            'image',
            'data',
            'result',
            'output',
            'outputs',
            'images'
        ];

        for (const key of preferredKeys) {
            const image = normalizeImageCandidate(value[key]);
            if (image) return image;
        }

        for (const item of Object.values(value)) {
            const image = normalizeImageCandidate(item);
            if (image) return image;
        }
    }

    return null;
}

function getErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.cause?.message) return error.cause.message;
    return String(error);
}

function isNetworkTimeout(error, message) {
    return error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || /timeout|fetch failed|connect/i.test(message);
}

async function generateImage(prompt) {
    const authToken = requireAuthToken();
    const response = await fetch(`${PUTER_API_ORIGIN}/drivers/call`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;actually=json'
        },
        body: JSON.stringify({
            interface: 'puter-image-generation',
            driver: 'ai-image',
            method: 'generate',
            args: {
                prompt,
                model: MODEL
            },
            auth_token: authToken
        }),
        signal: AbortSignal.timeout(60000)
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        const data = await response.json();

        if (!response.ok || data.success === false) {
            throw new Error(data?.error?.message || data?.message || `Puter API returned ${response.status}`);
        }

        const image = normalizeImageCandidate(data.result || data);
        if (image) return image;

        throw new Error(`Puter returned an unreadable image response: ${summarizeShape(data.result || data)}`);
    }

    if (!response.ok) {
        throw new Error(`Puter API returned ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, mime: contentType || 'image/png' };
}

module.exports = {
    config: {
        name: 'qwenimage',
        aliases: ['qwenimg', 'qimg'],
        version: '1.0.0',
        description: 'Generate images with Qwen Image 2.0 through Puter',
        usage: 'qwenimage <prompt>',
        examples: ['qwenimage a retro travel poster for Mars reading Visit Mars'],
        permissions: 0,
        cooldown: 20,
        category: 'ai'
    },
    generateImage,
    getErrorMessage,
    isNetworkTimeout,
    onRun: async (sock, msg, args) => {
        const prompt = args.join(' ').trim();

        if (!prompt) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send an image prompt.\nExample: .qwenimage a retro travel poster for Mars reading Visit Mars'
            }, { quoted: msg });
            return;
        }

        try {
            const image = await generateImage(prompt);
            const imageContent = image.url
                ? { url: image.url }
                : image.mime
                    ? { buffer: image.buffer, mimetype: image.mime }
                    : image.buffer;

            await sock.sendMessage(msg.key.remoteJid, {
                image: imageContent,
                caption: `*Qwen Image 2.0*\n${prompt.slice(0, 500)}`
            }, { quoted: msg });
        } catch (error) {
            console.error('Qwen image command error:', error);

            const errorMessage = getErrorMessage(error);
            const missingToken = errorMessage.includes('PUTER_AUTH_TOKEN');
            const text = missingToken
                ? 'Puter.js needs a one-time login for Node.\nRun: npm run puter:login\nThen restart the bot and try .qwenimage again.'
                : isNetworkTimeout(error, errorMessage)
                    ? 'Qwen Image could not connect to Puter before the network timed out. Please try again in a moment.'
                    : `Qwen image failed: ${errorMessage}`;

            await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
        }
    }
};
