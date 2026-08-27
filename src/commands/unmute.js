module.exports = {
    config: {
        name: 'unmute',
        aliases: ['open'],
        version: '1.0.0',
        description: 'Allows everyone to send messages in the group',
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },

    onRun: async (sock, msg) => {
        const groupId = msg.key.remoteJid;

        if (!groupId || !groupId.endsWith('@g.us')) {
            await sock.sendMessage(
                groupId,
                {
                    text: 'This command only works in groups.'
                },
                { quoted: msg }
            );
            return;
        }

        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const botJid = sock.user?.id;

            const botParticipant = groupMetadata.participants.find(
                participant =>
                    participant.id === botJid ||
                    participant.id?.split(':')[0] === botJid?.split(':')[0]
            );

            const isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin';

            if (!isBotAdmin) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: 'I need to be a group admin to unmute this group.'
                    },
                    { quoted: msg }
                );
                return;
            }

            await sock.groupSettingUpdate(
                groupId,
                'not_announcement'
            );

            await sock.sendMessage(
                groupId,
                {
                    text: '🔊 Group unmuted.\n\nEveryone can send messages again.'
                },
                { quoted: msg }
            );
        } catch (error) {
            console.error('Unmute command error:', error);

            await sock.sendMessage(
                groupId,
                {
                    text: `Failed to unmute the group:\n${String(error.message || error).slice(0, 1000)}`
                },
                { quoted: msg }
            );
        }
    }
};