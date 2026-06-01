module.exports = {
    config: {
        name: 'tagall',
        aliases: ['everyone', 'all'],
        version: '1.0.0',
        description: 'Mentions every member in a group',
        permissions: 1,
        category: 'group'
    },
    onRun: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@g.us')) {
            await sock.sendMessage(jid, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        const metadata = await sock.groupMetadata(jid);
        const participants = metadata.participants.map(participant => participant.id);
        const message = args.join(' ') || 'Group announcement';
        const mentions = participants.map(id => `@${id.split('@')[0]}`).join('\n');

        await sock.sendMessage(jid, {
            text: `*${message}*\n\n${mentions}`,
            mentions: participants
        }, { quoted: msg });
    }
};
