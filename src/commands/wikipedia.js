async function searchWikipedia(query) {
    const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=4`;
    const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'AstaBot/1.0 (WhatsApp bot)' },
        signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
        throw new Error(`Wikipedia responded with status ${response.status}`);
    }

    const data = await response.json();
    return data.pages || [];
}

module.exports = {
    config: {
        name: 'wikipedia',
        aliases: ['wiki', 'wikipidia'],
        version: '1.1.0',
        description: 'Search Wikipedia and return top results',
        permissions: 0,
        category: 'general'
    },
    searchWikipedia,
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Please provide a search query. Example: .wikipedia Asta'
            }, { quoted: msg });
            return;
        }

        try {
            const results = await searchWikipedia(query);

            if (!Array.isArray(results) || results.length === 0) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `No Wikipedia results found for: ${query}`
                }, { quoted: msg });
                return;
            }

            const formatted = results.map((item, index) => {
                const title = item.title || 'Unknown title';
                const snippet = item.excerpt
                    ? item.excerpt.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim()
                    : 'No description available.';
                const url = item.key
                    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(item.key)}`
                    : 'No URL available.';

                return `*${index + 1}. ${title}*\n${snippet}\n${url}`;
            }).join('\n\n');

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Wikipedia Search Results for:* ${query}\n\n${formatted}`
            }, { quoted: msg });
        } catch (error) {
            console.error('Wikipedia command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'There was an error fetching Wikipedia results. Please try again later.'
            }, { quoted: msg });
        }
    }
};
