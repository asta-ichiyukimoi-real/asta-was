const { execFile } = require('child_process');

function runGit(args, options = {}) {
    return new Promise((resolve) => {
        execFile('git', args, {
            cwd: process.cwd(),
            timeout: options.timeoutMs || 120000,
            windowsHide: true,
            maxBuffer: 1024 * 1024
        }, (error, stdout, stderr) => {
            resolve({
                ok: !error,
                code: error?.code ?? 0,
                stdout: String(stdout || '').trim(),
                stderr: String(stderr || '').trim(),
                error: error?.message || ''
            });
        });
    });
}

function short(value) {
    return String(value || '').trim().slice(0, 10);
}

function outputOf(result) {
    return [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
}

async function reloadHandlers() {
    Object.keys(require.cache).forEach((key) => {
        if (
            key.includes('\\src\\commands\\')
            || key.includes('/src/commands/')
            || key.endsWith('\\config.js')
            || key.endsWith('/config.js')
        ) {
            delete require.cache[key];
        }
    });

    const commandHandler = global.commandHandler;
    const chatCommandHandler = global.chatCommandHandler;
    const replyCommandHandler = global.replyCommandHandler;

    try {
        const ConfigCommandHandler = require('../../handlers/configCommandHandler');
        const freshConfig = require('../../config');
        const configCommandHandler = new ConfigCommandHandler(freshConfig);
        global.configCommandHandler = configCommandHandler;
        if (commandHandler) {
            commandHandler.configCommandHandler = configCommandHandler;
        }
    } catch (error) {
        console.error('Config reload after update failed:', error);
    }

    if (commandHandler?.loadCommands) {
        commandHandler.commands.clear();
        commandHandler.loadCommands();
    }
    if (chatCommandHandler?.loadChatCommands) {
        chatCommandHandler.chatCommands.clear();
        chatCommandHandler.loadChatCommands();
    }
    if (replyCommandHandler?.loadReplyCommands) {
        replyCommandHandler.replyCommands.clear();
        replyCommandHandler.loadReplyCommands();
    }

    return {
        commands: commandHandler?.commands ? new Set(commandHandler.commands.values()).size : 0,
        commandEntries: commandHandler?.commands?.size || 0,
        replyEntries: replyCommandHandler?.replyCommands?.size || 0,
        chatTriggers: chatCommandHandler?.chatCommands?.size || 0
    };
}

async function getUpdateInfo() {
    const branch = await runGit(['main', 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch.ok) throw new Error(`Not a git repository or branch is unavailable:\n${outputOf(branch)}`);

    const remote = await runGit(['remote', 'get-url', 'origin']);
    if (!remote.ok) throw new Error(`No origin remote found:\n${outputOf(remote)}`);

    const fetch = await runGit(['fetch', 'origin', branch.stdout]);
    if (!fetch.ok) throw new Error(`Fetch failed:\n${outputOf(fetch)}`);

    const local = await runGit(['rev-parse', 'HEAD']);
    const upstream = await runGit(['rev-parse', `origin/${branch.stdout}`]);
    if (!local.ok || !upstream.ok) throw new Error('Could not compare local and remote commits.');

    const aheadBehind = await runGit(['rev-list', '--left-right', '--count', `HEAD...origin/${branch.stdout}`]);
    const [ahead = '0', behind = '0'] = aheadBehind.stdout.split(/\s+/);
    const log = await runGit(['log', '--oneline', '--decorate', '--max-count=8', `HEAD..origin/${branch.stdout}`]);
    const status = await runGit(['status', '--porcelain']);

    return {
        branch: branch.stdout,
        remote: remote.stdout,
        local: local.stdout,
        upstream: upstream.stdout,
        ahead: Number(ahead) || 0,
        behind: Number(behind) || 0,
        changes: log.stdout,
        dirty: Boolean(status.stdout),
        dirtySummary: status.stdout
    };
}

module.exports = {
    config: {
        name: 'update',
        aliases: ['pullupdate', 'gitupdate'],
        version: '1.0.0',
        description: 'Update the bot from GitHub while preserving local changes',
        usage: 'update [check|apply]',
        examples: ['update check', 'update'],
        permissions: 2,
        cooldown: 0,
        category: 'admin'
    },
    onRun: async (sock, msg, args) => {
        const mode = (args[0] || 'apply').toLowerCase();
        const chatId = msg.key.remoteJid;

        try {
            await sock.sendMessage(chatId, { text: 'Checking GitHub for updates...' }, { quoted: msg });
            const info = await getUpdateInfo();

            if (mode === 'check' || mode === 'preview') {
                await sock.sendMessage(chatId, {
                    text: [
                        '*Update Check*',
                        `Remote: ${info.remote}`,
                        `Branch: ${info.branch}`,
                        `Local: ${short(info.local)}`,
                        `Remote HEAD: ${short(info.upstream)}`,
                        `Ahead: ${info.ahead}`,
                        `Behind: ${info.behind}`,
                        `Local changes: ${info.dirty ? 'yes' : 'no'}`,
                        '',
                        info.behind ? `*Incoming*\n${info.changes || 'No commit summary.'}` : 'No GitHub updates found.'
                    ].join('\n').slice(0, 3500)
                }, { quoted: msg });
                return;
            }

            if (!info.behind) {
                await sock.sendMessage(chatId, {
                    text: `No GitHub updates found.\nLocal changes: ${info.dirty ? 'yes' : 'no'}`
                }, { quoted: msg });
                return;
            }

            if (info.ahead) {
                await sock.sendMessage(chatId, {
                    text: [
                        'Update stopped because this host has local commits that are not on GitHub.',
                        `Ahead: ${info.ahead}`,
                        `Behind: ${info.behind}`,
                        'Use .update check, then decide whether to push, reset manually, or merge from shell.'
                    ].join('\n')
                }, { quoted: msg });
                return;
            }

            let stashed = false;
            if (info.dirty) {
                const stash = await runGit(['stash', 'push', '--include-untracked', '-m', `asta-update-${Date.now()}`]);
                if (!stash.ok) throw new Error(`Could not preserve local changes with git stash:\n${outputOf(stash)}`);
                stashed = !/No local changes/i.test(outputOf(stash));
            }

            const merge = await runGit(['merge', '--ff-only', `origin/${info.branch}`]);
            if (!merge.ok) {
                if (stashed) {
                    await runGit(['stash', 'pop']);
                }
                throw new Error(`Update failed during merge:\n${outputOf(merge)}`);
            }

            let stashMessage = 'No local changes needed re-applying.';
            if (stashed) {
                const pop = await runGit(['stash', 'pop']);
                stashMessage = pop.ok
                    ? 'Local changes re-applied.'
                    : `Update applied, but local changes have conflicts. Resolve manually:\n${outputOf(pop)}`;
            }

            const reload = await reloadHandlers();
            await sock.sendMessage(chatId, {
                text: [
                    '*Update Complete*',
                    `Branch: ${info.branch}`,
                    `Old: ${short(info.local)}`,
                    `New: ${short(info.upstream)}`,
                    stashMessage,
                    '',
                    `Commands: ${reload.commands}`,
                    `Command entries: ${reload.commandEntries}`,
                    `Reply entries: ${reload.replyEntries}`,
                    `Chat triggers: ${reload.chatTriggers}`,
                    '',
                    info.changes ? `*Applied commits*\n${info.changes}` : ''
                ].filter(Boolean).join('\n').slice(0, 3500)
            }, { quoted: msg });
        } catch (error) {
            console.error('Update command error:', error);
            await sock.sendMessage(chatId, {
                text: `Update failed:\n${String(error.message || error).slice(0, 3000)}`
            }, { quoted: msg });
        }
    }
};
