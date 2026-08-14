const logger = require('./logger');
const state = require('./stateManager');

function getErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.cause?.message) return error.cause.message;
    return String(error);
}

function isTimeout(error) {
    const message = getErrorMessage(error);
    return error?.name === 'AbortError'
        || error?.name === 'TimeoutError'
        || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
        || /timeout|fetch failed|connect/i.test(message);
}

function friendlyApiError(error, service = 'API') {
    const message = getErrorMessage(error);

    if (isTimeout(error)) {
        return `${service} did not respond in time. Please try again soon.`;
    }

    if (/quota|login|401|unauthor/i.test(message)) {
        return `${service} rejected the request. Check the API/session config or try again later.`;
    }

    if (/not found|no .*found|empty/i.test(message)) {
        return message;
    }

    return `${service} is not responding properly right now. Please try again soon.`;
}

async function requestJson(url, options = {}) {
    const {
        timeoutMs = 45000,
        service = 'API',
        retries = 0,
        headers = {},
        ...fetchOptions
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                headers: {
                    'User-Agent': 'AstaBot/1.0 (WhatsApp bot)',
                    ...headers
                },
                signal: AbortSignal.timeout(timeoutMs)
            });
            const data = await response.json().catch(() => null);

            if (!data) {
                throw new Error(`API returned an empty or invalid JSON response with status ${response.status}`);
            }

            if (!response.ok || data?.success === false || data?.status === false) {
                throw new Error(data?.message || data?.error || `API responded with status ${response.status}`);
            }

            return data;
        } catch (error) {
            lastError = error;
            if (attempt >= retries || !isTimeout(error)) break;
        }
    }

    const message = getErrorMessage(lastError);
    logger.log('api_error', { service, url: String(url).slice(0, 500), error: message });
    state.updateHealth({ lastApiError: `${service}: ${message}`, lastError: message });
    throw lastError;
}

module.exports = {
    requestJson,
    friendlyApiError,
    getErrorMessage,
    isTimeout
};
