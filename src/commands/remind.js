const reminders = require('../services/reminders');

function parseDuration(value) {
    const match = value.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return amount * multipliers[unit];
}

module.exports = {
    config: {
        name: 'remind',
        aliases: ['reminder'],
        version: '1.1.0',
        description: 'Sets a persistent reminder',
        usage: 'remind <time> <message>',
        examples: ['remind 10m check the food', 'remind 2h join the meeting'],
        permissions: 0,
        category: 'utility'
    },
    onRun: async (sock, msg, args) => {
        const durationArg = args.shift();
        const note = args.join(' ').trim();
        const duration = durationArg ? parseDuration(durationArg) : null;

        if (!duration || !note) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Use: !remind <time> <message>\nExample: !remind 10m check the food\n\nTime units: s, m, h, d'
            }, { quoted: msg });
            return;
        }

        if (duration > 30 * 24 * 60 * 60 * 1000) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Reminder time is too long. Please keep it within 30 days.'
            }, { quoted: msg });
            return;
        }

        const sender = msg.key.participant || msg.key.remoteJid;
        const runAt = new Date(Date.now() + duration).toISOString();
        reminders.createReminder(sock, {
            chatId: msg.key.remoteJid,
            userId: sender,
            text: note,
            runAt
        });

        await sock.sendMessage(msg.key.remoteJid, {
            text: `Reminder set for ${durationArg}. It will survive bot restarts.`
        }, { quoted: msg });
    }
};
