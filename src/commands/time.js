module.exports = {
    config: {
        name: 'time',
        aliases: ['date', 'now'],
        version: '1.0.0',
        description: 'Shows the current date and time',
        usage: 'time [timezone]',
        examples: ['time', 'time Africa/Lagos', 'time America/New_York'],
        permissions: 0,
        category: 'utility'
    },
    onRun: async (sock, msg, args) => {
        const now = new Date();
        const timeZone = args.join(' ') || 'Africa/Lagos';

        try {
            const formatted = new Intl.DateTimeFormat('en-US', {
                timeZone,
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            }).format(now);

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*Current Time*\n\n${formatted}\n\n_Timezone: ${timeZone}_`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Invalid timezone. Try something like: !time Africa/Lagos'
            }, { quoted: msg });
        }
    }
};
