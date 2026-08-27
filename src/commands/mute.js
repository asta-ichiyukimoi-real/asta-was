module.exports = {
    config: {
        name: 'mute',
        aliases: ['close'],
        version: '1.0.0',
        description: 'Locks the group so only admins can send messages',
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
                        text: 'I need to be a group admin to mute this group.'
                    },
                    { quoted: msg }
                );
                return;
            }

            await sock.groupSettingUpdate(
                groupId,
                'announcement'
            );

            await sock.sendMessage(
                groupId,
                {
                    text: '🔇 Group muted.\n\nOnly admins can send messages now.'
                },
                { quoted: msg }
            );
        } catch (error) {
            console.error('Mute command error:', error);

            await sock.sendMessage(
                groupId,
                {
                    text: `Failed to mute the group:\n${String(error.message || error).slice(0, 1000)}`
                },
                { quoted: msg }
            );
        }
    }
};