function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
    config: {
        name: 'youtube',
        aliases: ['yt'],
        version: '1.0.0',
        description: 'Search YouTube via the Vision Scrape API',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(msg.key.remoteJid, { text: '📺 Please provide a search term. Example: !youtube asta' }, { quoted: msg });
            return;
        }

        const maxResultsArg = parseInt(args.pop(), 10);
        const maxResults = Number.isInteger(maxResultsArg) && maxResultsArg > 0 && maxResultsArg <= 20 ? maxResultsArg : 5;
        const actualQuery = Number.isInteger(maxResultsArg) && maxResultsArg > 0 && maxResultsArg <= 20 ? args.slice(0, -1).join(' ').trim() : query;
        const endpoint = `https://vision-scrape-2ex8.onrender.com/youtube/search?q=${encodeURIComponent(actualQuery)}&max_results=${maxResults}`;

        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`API responded with status ${response.status}`);
            }

            const data = await response.json();
            const results = data.results || [];

            if (!Array.isArray(results) || results.length === 0) {
                await sock.sendMessage(msg.key.remoteJid, { text: `🔍 No YouTube results found for: ${actualQuery}` }, { quoted: msg });
                return;
            }

            const formatted = results.slice(0, maxResults).map((item, index) => {
                const title = item.title || 'Unknown title';
                const channel = item.channel || 'Unknown channel';
                const duration = typeof item.duration === 'number' ? formatDuration(item.duration) : 'Unknown';
                const views = item.view_count != null ? item.view_count.toLocaleString() : 'Unknown';
                const url = item.url || `https://www.youtube.com/watch?v=${item.id || ''}`;
                return `*${index + 1}. ${title}*
Channel: ${channel}
Duration: ${duration}
Views: ${views}
${url}`;
            }).join('\n\n');

            const reply = `📺 *YouTube Search Results for:* ${actualQuery}\n\n${formatted}`;
            await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
        } catch (error) {
            console.error('YouTube command error:', error);
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ There was an error fetching YouTube results. Please try again later.' }, { quoted: msg });
        }
    }
};
