module.exports = {
    config: {
        name: 'search',
        aliases: ['web', 'google'],
        version: '1.0.0',
        description: 'Search the web using the Vision Scrape search API',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, { text: '🔎 Please provide a search query. Example: !search boy' }, { quoted: msg });
            return;
        }

        const endpoint = `https://vision-scrape-2ex8.onrender.com/search/?q=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`API responded with status ${response.status}`);
            }

            const data = await response.json();
            const results = data.results || [];
            if (!Array.isArray(results) || results.length === 0) {
                await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ No results found for: ${query}` }, { quoted: msg });
                return;
            }

            const formatted = results.slice(0, 6).map((item, index) => {
                const title = item.title || 'No title';
                const snippet = item.snippet ? item.snippet.replace(/\n/g, ' ').trim() : 'No snippet available.';
                const url = item.url || 'No URL available.';
                return `*${index + 1}. ${title}*
${snippet}
${url}`;
            }).join('\n\n');

            const reply = `🌐 *Web Search Results for:* ${query}\n\n${formatted}`;
            await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
        } catch (error) {
            console.error('Search command error:', error);
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ There was an error fetching search results. Please try again later.' }, { quoted: msg });
        }
    }
};
