const { getTargetJids, formatMentions } = require('../utils/targets');

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '');
}

function jidCandidates(value) {
    const raw = String(value || '');
    const normalized = normalizeJid(raw);
    const candidates = new Set();

    if (raw) candidates.add(raw);
    if (normalized) candidates.add(normalized);

    const [user] = normalized.split('@');

    if (user) {
        candidates.add(`${user}@s.whatsapp.net`);
        candidates.add(`${user}@lid`);
    }

    return [...candidates];
}

function findBotParticipant(groupMetadata, sock) {
    const botCandidates = new Set([
        ...jidCandidates(sock.user?.id),
        ...jidCandidates(sock.user?.lid),
        ...jidCandidates(sock.user?.jid)
    ]);

    return groupMetadata.participants.find(participant => {
        const participantCandidates = [
            ...jidCandidates(participant.id),
            ...jidCandidates(participant.jid),
            ...jidCandidates(participant.phoneNumber)
        ];

        return participantCandidates.some(jid => botCandidates.has(jid));
    });
}

module.exports = {
    config: {
        name: 'demote',
        aliases: ['radmin'],
        version: '1.0.0',
        description: 'Promotes mentioned or replied users to group admin',
        permissions: 1,
        cooldown: 2,
        category: 'moderation'
    },

    onRun: async (sock, msg, args) => {
        const groupId = msg.key.remoteJid;

        if (!groupId?.endsWith('@g.us')) {
            await sock.sendMessage(
                groupId,
                { text: 'This command only works in groups.' },
                { quoted: msg }
            );
            return;
        }

        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const botParticipant = findBotParticipant(groupMetadata, sock);

            console.log('Promote bot IDs:', {
                id: sock.user?.id,
                lid: sock.user?.lid,
                jid: sock.user?.jid
            });

            console.log('Promote matched bot participant:', botParticipant);

            const isBotAdmin =
                botParticipant?.admin === 'admin' ||
                botParticipant?.admin === 'superadmin';

            if (!isBotAdmin) {
                await sock.sendMessage(
                    groupId,
                    { text: 'I am not an admin.' },
                    { quoted: msg }
                );
                return;
            }

            const targets = getTargetJids(msg);

            if (!targets.length) {
                await sock.sendMessage(
                    groupId,
                    {
                        text: 'Mention someone or reply to their message.\nExample: !promote @user'
                    },
                    { quoted: msg }
                );
                return;
            }

            const botJids = new Set([
                ...jidCandidates(sock.user?.id),
                ...jidCandidates(sock.user?.lid),
                ...jidCandidates(sock.user?.jid)
            ]);

            const validTargets = targets.filter(target => {
                const targetCandidates = jidCandidates(target);
                return !targetCandidates.some(jid => botJids.has(jid));
            });

            if (!validTargets.length) {
                await sock.sendMessage(
                    groupId,
                    { text: 'I cannot promote myself.' },
                    { quoted: msg }
                );
                return;
            }

            await sock.groupParticipantsUpdate(
                groupId,
                validTargets,
                'demote'
            );

            await sock.sendMessage(
                groupId,
                {
                    text: `Demoted ${formatMentions(validTargets)}.`,
                    mentions: validTargets
                },
                { quoted: msg }
            );
        } catch (error) {
            console.error('Demote command error:', error);

            await sock.sendMessage(
                groupId,
                {
                    text: `Failed to demote the user.\n${error.message || 'Unknown error'}`
                },
                { quoted: msg }
            );
        }
    }
};