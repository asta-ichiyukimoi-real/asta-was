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
                { text: 'This command only works in groups.' },
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

            console.log('\n========== MUTE DEBUG ==========');
            console.log('Group ID:', groupId);

            console.log('\n--- sock.user ---');
            console.log(JSON.stringify(sock.user, null, 2));

            console.log('\n--- Bot IDs ---');
            console.log(botIds);

            console.log('\n--- Group participants ---');

            for (const participant of groupMetadata.participants || []) {
                console.log(JSON.stringify({
                    id: participant.id,
                    lid: participant.lid,
                    jid: participant.jid,
                    phoneNumber: participant.phoneNumber,
                    admin: participant.admin
                }, null, 2));
            }

            const botParticipant = (groupMetadata.participants || []).find(participant => {
                const participantIds = [
                    participant.id,
                    participant.lid,
                    participant.jid,
                    participant.phoneNumber
                ].filter(Boolean);

                return participantIds.some(id => botIds.includes(id));
            });

            console.log('\n--- Matched Bot Participant ---');
            console.log(JSON.stringify(botParticipant || null, null, 2));

            const isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin';

            console.log('\n--- Admin Check ---');
            console.log('Bot IDs:', botIds);
            console.log('Matched:', Boolean(botParticipant));
            console.log('Role:', botParticipant?.admin || 'none');
            console.log('Is Bot Admin:', isBotAdmin);
            console.log('================================\n');

            if (!botParticipant) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: '❌ I could not find my account in the group participant list.'
                    },
                    { quoted: msg }
                );
                return;
            }

            if (!isBotAdmin) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: `❌ I need to be a group admin to mute this group.\n\nDetected role: ${botParticipant.admin || 'member'}`
                    },
                    { quoted: msg }
                );
                return;
            }

            await sock.groupSettingUpdate(groupId, 'announcement');

            await sock.sendMessage(
                groupId,
                {
                    text: '🔇 *Group muted*\n\nOnly admins can send messages now.'
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
                    text: `❌ Failed to mute the group:\n${String(error.message || error).slice(0, 1000)}`
                },
                { quoted: msg }
            );
        }
    }
};