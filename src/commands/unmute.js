function normalizeId(id) {
    if (!id) return '';

    return String(id)
        .trim()
        .replace(/:\d+(?=@)/, '')
        .toLowerCase();
}

function getIdVariants(id) {
    if (!id) return [];

    const normalized = normalizeId(id);
    const variants = new Set([normalized]);

    if (normalized.includes('@')) {
        const [number] = normalized.split('@');

        if (number) {
            variants.add(number);
        }
    }

    return [...variants];
}

function idsMatch(a, b) {
    if (!a || !b) return false;

    const aVariants = getIdVariants(a);
    const bVariants = getIdVariants(b);

    return aVariants.some(id => bVariants.includes(id));
}

module.exports = {
    config: {
        name: 'unmute',
        aliases: ['open'],
        version: '1.2.0',
        description: 'unmute the group so everyone can send messages',
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

            console.log('\n========== MUTE DEBUG ==========');
            console.log('Group ID:', groupId);

            console.log('\n--- Bot Identity ---');
            console.log(JSON.stringify(sock.user, null, 2));

            console.log('\n--- Bot IDs ---');

            for (const id of botIds) {
                console.log({
                    original: id,
                    normalized: normalizeId(id),
                    variants: getIdVariants(id)
                });
            }

            console.log('\n--- Group Participants ---');

            for (const participant of groupMetadata.participants || []) {
                console.log({
                    id: participant.id,
                    normalizedId: normalizeId(participant.id),
                    lid: participant.lid,
                    normalizedLid: normalizeId(participant.lid),
                    jid: participant.jid,
                    normalizedJid: normalizeId(participant.jid),
                    phoneNumber: participant.phoneNumber,
                    normalizedPhoneNumber: normalizeId(participant.phoneNumber),
                    admin: participant.admin
                });
            }

            const botParticipant = (groupMetadata.participants || []).find(participant => {
                const participantIds = [
                    participant.id,
                    participant.lid,
                    participant.jid,
                    participant.phoneNumber
                ].filter(Boolean);

                return participantIds.some(participantId =>
                    botIds.some(botId => idsMatch(participantId, botId))
                );
            });

            console.log('\n--- Matched Bot Participant ---');
            console.log(JSON.stringify(botParticipant || null, null, 2));

            const isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin';

            console.log('\n--- Admin Check ---');
            console.log('Matched:', Boolean(botParticipant));
            console.log('Role:', botParticipant?.admin || 'none');
            console.log('Is Bot Admin:', isBotAdmin);
            console.log('================================\n');

            if (!botParticipant) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: '❌ I could not identify myself in this group.'
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

            await sock.groupSettingUpdate(
                groupId,
                'not_announcement'
            );

            await sock.sendMessage(
                groupId,
                {
                    text: '✅ *Group unmuted*\n\nEveryone can send messages now.'
                },
                { quoted: msg }
            );

        } catch (error) {
            console.error('\n========== UNMUTE ERROR ==========');
            console.error(error);
            console.error('================================\n');

            await sock.sendMessage(
                groupId,
                {
                    text: `❌ Failed to unmute the group:\n${String(error.message || error).slice(0, 1000)}`
                },
                { quoted: msg }
            );
        }
    }
};