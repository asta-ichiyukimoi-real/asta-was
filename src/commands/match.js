const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'matchProfiles.json');

function ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify({}, null, 2),
            'utf8'
        );
    }
}

function loadProfiles() {
    ensureDataFile();

    try {
        return JSON.parse(
            fs.readFileSync(DATA_FILE, 'utf8')
        );
    } catch (error) {
        console.error(
            'Failed to read match profiles:',
            error
        );

        return {};
    }
}

function saveProfiles(profiles) {
    ensureDataFile();

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(profiles, null, 2),
        'utf8'
    );
}

function getUserId(msg) {
    return (
        msg.key.participant ||
        msg.key.remoteJid
    );
}

function getMentionedUsers(msg) {
    return (
        msg.message?.extendedTextMessage?.contextInfo
            ?.mentionedJid ||
        msg.message?.imageMessage?.contextInfo
            ?.mentionedJid ||
        msg.message?.videoMessage?.contextInfo
            ?.mentionedJid ||
        []
    );
}

function getDisplayName(msg) {
    return (
        msg.pushName ||
        msg.key.participant?.split('@')[0] ||
        'Someone'
    );
}

function randomNumber(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function compatibilityMessage(score) {
    if (score >= 95) {
        return '💍 Forget the matching app... this is getting serious 👀';
    }

    if (score >= 85) {
        return '🔥 Okayyy, there is definitely something here.';
    }

    if (score >= 75) {
        return '💕 Not bad at all... somebody should make the first move.';
    }

    if (score >= 60) {
        return '👀 There might be something worth exploring.';
    }

    if (score >= 40) {
        return '😂 The vibes are questionable, but anything can happen.';
    }

    return '💀 The algorithm has spoken... good luck though.';
}

function getConfigCommandHandler() {
    return (
        global.configCommandHandler ||
        null
    );
}

function isBotAdmin(userId, msg) {
    const handler =
        getConfigCommandHandler();

    if (!handler) {
        return false;
    }

    try {
        return Boolean(
            handler.isOwner?.(
                userId,
                msg
            ) ||
            handler.isAdmin?.(userId)
        );
    } catch (error) {
        console.error(
            'Match admin check error:',
            error
        );

        return false;
    }
}

function normalizeGender(value) {
    const gender =
        String(value || '').toLowerCase().trim();

    if (
        gender === 'm' ||
        gender === 'male' ||
        gender === 'man' ||
        gender === 'boy'
    ) {
        return 'male';
    }

    if (
        gender === 'f' ||
        gender === 'female' ||
        gender === 'woman' ||
        gender === 'girl'
    ) {
        return 'female';
    }

    if (
        gender === 'off' ||
        gender === 'none' ||
        gender === 'remove'
    ) {
        return 'off';
    }

    return '';
}

async function sendText(sock, msg, text) {
    await sock.sendMessage(
        msg.key.remoteJid,
        { text },
        { quoted: msg }
    );
}

async function setGender(
    sock,
    msg,
    targetId,
    gender,
    adminAction = false
) {
    const profiles = loadProfiles();

    if (gender === 'off') {
        if (profiles[targetId]) {
            profiles[targetId].enabled = false;
            profiles[targetId].updatedAt = Date.now();
        }

        saveProfiles(profiles);

        await sendText(
            sock,
            msg,
            adminAction
                ? `💔 Gender profile for @${targetId.split('@')[0]} has been disabled.`
                : '💔 You have been removed from the matching pool.'
        );

        return;
    }

    profiles[targetId] = {
        ...(profiles[targetId] || {}),
        gender,
        enabled: true,
        updatedAt: Date.now()
    };

    saveProfiles(profiles);

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: adminAction
                ? `✅ Gender for @${targetId.split('@')[0]} has been set to *${gender}*.`
                : `✅ Your gender has been saved as *${gender}*.`,
            mentions: [targetId]
        },
        { quoted: msg }
    );
}

async function handleGender(
    sock,
    msg,
    args
) {
    const senderId = getUserId(msg);

    /*
     * Supported:
     *
     * .gender male
     * .gender female
     * .gender off
     *
     * Admin:
     *
     * .gender @user male
     * .gender @user female
     * .gender @user off
     */

    const mentionedUsers =
        getMentionedUsers(msg);

    /*
     * Admin is trying to modify somebody else's
     * profile.
     */
    if (mentionedUsers.length) {
        if (!isBotAdmin(senderId, msg)) {
            await sendText(
                sock,
                msg,
                '❌ Only bot owners/admins can set another user\'s gender.'
            );

            return;
        }

        const targetId =
            mentionedUsers[0];

        const gender =
            normalizeGender(args[args.length - 1]);

        if (!gender) {
            await sendText(
                sock,
                msg,
                [
                    '❌ Invalid gender.',
                    '',
                    'Use:',
                    '`.gender @user male`',
                    '`.gender @user female`',
                    '`.gender @user off`'
                ].join('\n')
            );

            return;
        }

        await setGender(
            sock,
            msg,
            targetId,
            gender,
            true
        );

        return;
    }

    /*
     * User is setting their own gender.
     */
    const gender =
        normalizeGender(args[0]);

    if (!gender) {
        await sendText(
            sock,
            msg,
            [
                '💘 *Gender Settings*',
                '',
                '`.gender male`',
                '`.gender female`',
                '`.gender off`',
                '',
                'Bot admins can also set another user:',
                '`.gender @user male`'
            ].join('\n')
        );

        return;
    }

    await setGender(
        sock,
        msg,
        senderId,
        gender,
        false
    );
}

async function getGroupParticipants(
    sock,
    chatId
) {
    try {
        const metadata =
            await sock.groupMetadata(chatId);

        return metadata?.participants || [];
    } catch (error) {
        console.error(
            'Match group metadata error:',
            error
        );

        return [];
    }
}

async function findMatch(
    sock,
    msg,
    specificUserId = null
) {
    const chatId =
        msg.key.remoteJid;

    const senderId =
        getUserId(msg);

    if (!chatId.endsWith('@g.us')) {
        await sendText(
            sock,
            msg,
            '💘 The match command can only be used in a group.'
        );

        return;
    }

    const profiles =
        loadProfiles();

    const senderProfile =
        profiles[senderId];

    if (
        !senderProfile ||
        !senderProfile.enabled ||
        !senderProfile.gender
    ) {
        await sendText(
            sock,
            msg,
            [
                '💘 You need to set your gender first.',
                '',
                'Use:',
                '`.gender male`',
                'or',
                '`.gender female`'
            ].join('\n')
        );

        return;
    }

    const participants =
        await getGroupParticipants(
            sock,
            chatId
        );

    if (!participants.length) {
        await sendText(
            sock,
            msg,
            '❌ I could not read the group members.'
        );

        return;
    }

    /*
     * Specific match:
     *
     * .match @user
     */
    if (specificUserId) {
        if (specificUserId === senderId) {
            await sendText(
                sock,
                msg,
                '😂 You cannot match yourself.'
            );

            return;
        }

        const targetProfile =
            profiles[specificUserId];

        if (
            !targetProfile ||
            !targetProfile.enabled ||
            !targetProfile.gender
        ) {
            await sendText(
                sock,
                msg,
                '❌ That user has not set up their match profile yet.'
            );

            return;
        }

        await sendMatchResult(
            sock,
            msg,
            senderId,
            specificUserId
        );

        return;
    }

    /*
     * Random match.
     */
    const targetGender =
        senderProfile.gender === 'male'
            ? 'female'
            : 'male';

    const candidates =
        participants
            .map(
                participant =>
                    participant.id
            )
            .filter(Boolean)
            .filter(
                id =>
                    id !== senderId
            )
            .filter(id => {
                const profile =
                    profiles[id];

                return (
                    profile &&
                    profile.enabled === true &&
                    profile.gender === targetGender
                );
            });

    if (!candidates.length) {
        await sendText(
            sock,
            msg,
            [
                '💔 *No match found.*',
                '',
                `I couldn't find an eligible ${targetGender} in this group.`,
                '',
                'Ask people to set their gender with:',
                '`.gender male` or `.gender female`'
            ].join('\n')
        );

        return;
    }

    const selectedId =
        candidates[
            Math.floor(
                Math.random() *
                candidates.length
            )
        ];

    await sendMatchResult(
        sock,
        msg,
        senderId,
        selectedId
    );
}

async function sendMatchResult(
    sock,
    msg,
    userA,
    userB
) {
    const score =
        randomNumber(35, 99);

    const verdict =
        compatibilityMessage(score);

    const hearts =
        score >= 90
            ? '❤️❤️❤️'
            : score >= 75
                ? '❤️❤️'
                : '❤️';

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text: [
                '💘 *LOVE MATCH*',
                '',
                `👤 @${userA.split('@')[0]}`,
                `${hearts} *${score}% Compatibility*`,
                `💞 @${userB.split('@')[0]}`,
                '',
                `✨ ${verdict}`
            ].join('\n'),

            mentions: [
                userA,
                userB
            ]
        },
        { quoted: msg }
    );
}

module.exports = {
    config: {
        name: 'match',

        aliases: [
            'love',
            'ship'
        ],

        version: '1.1.0',

        description:
            'Find a random love match or match with a specific user',

        usage:
            'match | match @user | gender male',

        examples: [
            'match',
            'match @user',
            'gender male',
            'gender female',
            'gender off',
            'gender @user female'
        ],

        permissions: 0,

        cooldown: 10,

        category: 'fun'
    },

    onRun: async (
        sock,
        msg,
        args
    ) => {
        const firstArg =
            String(args[0] || '')
                .toLowerCase();

        if (
            firstArg === 'gender' ||
            firstArg === 'setgender'
        ) {
            await handleGender(
                sock,
                msg,
                args.slice(1)
            );

            return;
        }

        const mentions =
            getMentionedUsers(msg);

        if (mentions.length) {
            await findMatch(
                sock,
                msg,
                mentions[0]
            );

            return;
        }

        await findMatch(
            sock,
            msg
        );
    }
};