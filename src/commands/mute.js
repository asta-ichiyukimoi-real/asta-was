module.exports = {
    config: {
        name: 'mute',
        aliases: ['close'],
        version: '1.1.0',
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

            const botIds = [
    sock.user?.id,
    sock.user?.lid,
    sock.user?.jid
].filter(Boolean);

const botParticipant = (groupMetadata.participants || []).find(participant => {
    const participantIds = [
        participant.id,
        participant.lid,
        participant.jid,
        participant.phoneNumber
    ].filter(Boolean);

    return participantIds.some(id => botIds.includes(id));
});

const isBotAdmin =
    botParticipant?.admin === 'admin' ||
    botParticipant?.admin === 'superadmin';

console.log('Bot IDs:', botIds);
console.log('Matched bot participant:', botParticipant);
console.log('Bot admin:', isBotAdmin);
console.log('Bot role:', botParticipant?.admin);

            if (!botParticipant) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: 'I could not identify myself in the group participants. Check the bot ID logs.'
                    },
                    { quoted: msg }
                );
                return;
            }

            if (!isBotAdmin) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: `I found myself in the group, but WhatsApp says my role is: ${botParticipant.admin || 'member'}`
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
            console.error('\n========== MUTE ERROR ==========');
            console.error(error);
            console.error('================================\n');

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