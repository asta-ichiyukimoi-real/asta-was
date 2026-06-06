const { requestJson, friendlyApiError } = require('../utils/apiClient');

module.exports = {
    config: {
        name: 'search',
        aliases: ['web', 'google'],
        version: '1.1.0',
        description: 'Search the web using the Vision Scrape search API',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please provide a search query. Example: .search boy'
            }, { quoted: msg });
            return;
        }

        const endpoint = `https://vision-scrape-2ex8.onrender.com/search/?q=${encodeURIComponent(query)}`;
        try {
            const data = await requestJson(endpoint, { service: 'Web Search API' });
            const results = data.results || [];
            if (!Array.isArray(results) || results.length === 0) {
                await sock.sendMessage(msg.key.remoteJid, { text: `No results found for: ${query}` }, { quoted: msg });
                return;
            }

            const formatted = results.slice(0, 6).map((item, index) => {
                const title = item.title || 'No title';
                const snippet = item.snippet ? item.snippet.replace(/\n/g, ' ').trim() : 'No snippet available.';
                const url = item.url || 'No URL available.';
                return `*${index + 1}. ${title}*\n${snippet}\n${url}`;
            }).join('\n\n');

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Web Search Results for:* ${query}\n\n${formatted}`
            }, { quoted: msg });
        } catch (error) {
            console.error('Search command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: friendlyApiError(error, 'Web Search API')
            }, { quoted: msg });
        }
    }
};
