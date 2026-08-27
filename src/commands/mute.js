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

            const botUser = sock.user || {};
            const botId = botUser.id || '';
            const botLid = botUser.lid || '';
            const botJid = botUser.jid || '';

            console.log('\n========== MUTE DEBUG ==========');
            console.log('Group ID:', groupId);

            console.log('\n--- sock.user ---');
            console.log(JSON.stringify(botUser, null, 2));

            console.log('\n--- Bot identity ---');
            console.log('botUser.id:', botId);
            console.log('botUser.lid:', botLid);
            console.log('botUser.jid:', botJid);

            console.log('\n--- Bot ID types ---');
            console.log('id type:', botId.includes('@lid') ? 'LID' : botId.includes('@s.whatsapp.net') ? 'JID' : 'UNKNOWN');
            console.log('lid type:', botLid.includes('@lid') ? 'LID' : botLid.includes('@s.whatsapp.net') ? 'JID' : 'UNKNOWN');
            console.log('jid type:', botJid.includes('@lid') ? 'LID' : botJid.includes('@s.whatsapp.net') ? 'JID' : 'UNKNOWN');

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

            console.log('\n================================\n');

            const botParticipant = (groupMetadata.participants || []).find(
                participant => {
                    return (
                        participant.id === botId ||
                        participant.id === botLid ||
                        participant.id === botJid ||
                        participant.lid === botId ||
                        participant.lid === botLid ||
                        participant.lid === botJid ||
                        participant.jid === botId ||
                        participant.jid === botLid ||
                        participant.jid === botJid
                    );
                }
            );

            console.log('Matched bot participant:');
            console.log(JSON.stringify(botParticipant || null, null, 2));

            const isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin';

            console.log('Bot admin:', isBotAdmin);
            console.log('Bot admin role:', botParticipant?.admin || 'NOT FOUND');

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