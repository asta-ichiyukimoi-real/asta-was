module.exports = {
    config: {
        name: 'groupinfo',
        aliases: ['ginfo'],
        version: '1.0.0',
        description: 'Shows information about the current group',
        permissions: 0,
        category: 'group'
    },
    onRun: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@g.us')) {
            await sock.sendMessage(jid, { text: 'This command only works in groups.' }, { quoted: msg });
            return;
        }

        const metadata = await sock.groupMetadata(jid);
        const admins = metadata.participants.filter(participant => participant.admin).length;
        const created = metadata.creation
            ? new Date(metadata.creation * 1000).toLocaleString('en-US')
            : 'Unknown';
        const description = metadata.desc || 'No description set.';

        const text = `*Group Info*

*Name:* ${metadata.subject}
*Members:* ${metadata.participants.length}
*Admins:* ${admins}
*Created:* ${created}

*Description:*
${description}`;

        await sock.sendMessage(jid, { text }, { quoted: msg });
    }
};
