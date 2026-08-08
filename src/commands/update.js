const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const DEFAULT_REMOTE_URL = 'https://github.com/asta-ichiyukimoi-real/asta-was.git';
const DEFAULT_BRANCH = 'main';
const PROTECTED_REMOTE_NAMES = new Set([
    'config.js',
    'bot-state.json',
    'cookies.txt',
    'auth_info_baileys',
    'data',
    'logs'
]);

function isProtectedRemotePath(name) {
    return PROTECTED_REMOTE_NAMES.has(name);
}

function runGit(args, options = {}) {
    return new Promise((resolve) => {
        execFile('git', args, {
            cwd: options.cwd || process.cwd(),
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

async function compareRemoteRepoToWorkspace() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-update-'));
    const cloneDir = path.join(tempRoot, 'repo');

    const clone = await runGit(['clone', '--depth', '1', '--branch', DEFAULT_BRANCH, DEFAULT_REMOTE_URL, cloneDir], {
        cwd: tempRoot,
        timeoutMs: 240000
    });

    if (!clone.ok) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        throw new Error(`Remote clone failed:\n${outputOf(clone)}`);
    }

    const missing = [];
    const changed = [];
    const protectedFiles = [];

    function walkRemoteTree(remoteDir, relativePrefix = '') {
        const entries = fs.readdirSync(remoteDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === '.git') continue;
            if (entry.name === 'node_modules') continue;

            const remotePath = path.join(remoteDir, entry.name);
            const relativePath = path.join(relativePrefix, entry.name).split(path.sep).join('/');

            if (isProtectedRemotePath(entry.name)) {
                protectedFiles.push(relativePath);
                continue;
            }

            const localPath = path.join(process.cwd(), relativePath);

            if (entry.isDirectory()) {
                walkRemoteTree(remotePath, relativePath);
            } else if (entry.isFile()) {
                if (!fs.existsSync(localPath)) {
                    missing.push(relativePath);
                    continue;
                }

                const remoteData = fs.readFileSync(remotePath);
                const localData = fs.readFileSync(localPath);
                if (!Buffer.compare(remoteData, localData)) {
                    // identical on bytes
                } else {
                    changed.push(relativePath);
                }
            }
        }
    }

    walkRemoteTree(cloneDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });

    return {
        branch: DEFAULT_BRANCH,
        remote: DEFAULT_REMOTE_URL,
        missing,
        changed,
        protectedFiles,
        remoteRevision: 'main'
    };
}

async function syncRemoteRepoToWorkspace() {
    const diff = await compareRemoteRepoToWorkspace();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-update-'));
    const cloneDir = path.join(tempRoot, 'repo');

    const clone = await runGit(['clone', '--depth', '1', '--branch', DEFAULT_BRANCH, DEFAULT_REMOTE_URL, cloneDir], {
        cwd: tempRoot,
        timeoutMs: 240000
    });

    if (!clone.ok) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        throw new Error(`Remote clone failed:\n${outputOf(clone)}`);
    }

    const sourceRoot = cloneDir;
    const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
    const copied = [];

    for (const entry of entries) {
        if (entry.name === '.git') continue;
        if (entry.name === 'node_modules') continue;
        if (isProtectedRemotePath(entry.name)) continue;

        const source = path.join(sourceRoot, entry.name);
        const target = path.join(process.cwd(), entry.name);

        if (!fs.existsSync(target)) {
            fs.cpSync(source, target, { recursive: true, force: true });
            copied.push(entry.name);
            continue;
        }

        if (fs.lstatSync(target).isDirectory() && fs.lstatSync(source).isDirectory()) {
            const sourceChildren = fs.readdirSync(source, { withFileTypes: true });
            for (const child of sourceChildren) {
                const childName = child.name;
                if (isProtectedRemotePath(childName)) continue;

                const childSrc = path.join(source, childName);
                const childTarget = path.join(target, childName);

                if (!fs.existsSync(childTarget)) {
                    fs.cpSync(childSrc, childTarget, { recursive: true, force: true });
                    copied.push(path.join(entry.name, childName));
                } else if (fs.lstatSync(childTarget).isFile() && fs.lstatSync(childSrc).isFile()) {
                    const remoteData = fs.readFileSync(childSrc);
                    const localData = fs.readFileSync(childTarget);
                    if (Buffer.compare(remoteData, localData) !== 0) {
                        // Only allow an update when the file is safe to override.
                        const safeUpdate = ['src', 'handlers', 'scripts'].some(prefix => path.relative(process.cwd(), childTarget).startsWith(prefix));
                        if (safeUpdate) {
                            fs.copyFileSync(childSrc, childTarget);
                            copied.push(path.join(entry.name, childName));
                        }
                    }
                }
            }
        } else if (fs.lstatSync(source).isFile()) {
            const sourceContent = fs.readFileSync(source);
            const targetContent = fs.existsSync(target) ? fs.readFileSync(target) : null;

            if (!targetContent || Buffer.compare(sourceContent, targetContent) !== 0) {
                const safeOverride = !isProtectedRemotePath(path.basename(target));
                if (safeOverride) {
                    fs.copyFileSync(source, target);
                    copied.push(entry.name);
                }
            }
        }
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });

    return {
        branch: DEFAULT_BRANCH,
        remote: DEFAULT_REMOTE_URL,
        copied,
        diff
    };
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
    const branchProbe = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const isGitRepository = branchProbe.ok;

    if (!isGitRepository) {
        return {
            branch: DEFAULT_BRANCH,
            remote: DEFAULT_REMOTE_URL,
            local: null,
            upstream: null,
            ahead: 0,
            behind: 1,
            changes: '',
            dirty: false,
            dirtySummary: '',
            gitAvailable: false,
            repoState: 'not-git'
        };
    }

    const branch = branchProbe;
    const remote = await runGit(['remote', 'get-url', 'origin']);
    if (!remote.ok) {
        const configuredOrigin = await runGit(['remote', 'add', 'origin', DEFAULT_REMOTE_URL]);
        if (!configuredOrigin.ok) {
            throw new Error(`No origin remote found and could not configure it:\n${outputOf(configuredOrigin)}`);
        }
    }

    const remoteUrl = (await runGit(['remote', 'get-url', 'origin'])).stdout || DEFAULT_REMOTE_URL;

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
        remote: remoteUrl,
        local: local.stdout,
        upstream: upstream.stdout,
        ahead: Number(ahead) || 0,
        behind: Number(behind) || 0,
        changes: log.stdout,
        dirty: Boolean(status.stdout),
        dirtySummary: status.stdout,
        gitAvailable: true,
        repoState: 'git'
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
                if (info.repoState === 'not-git') {
                    const remoteDiff = await compareRemoteRepoToWorkspace();
                    await sock.sendMessage(chatId, {
                        text: [
                            '*Update Check*',
                            `Remote: ${remoteDiff.remote}`,
                            `Branch: ${remoteDiff.branch}`,
                            `Remote revision: ${remoteDiff.remoteRevision}`,
                            `Missing remote files: ${remoteDiff.missing.length}`,
                            `Changed files: ${remoteDiff.changed.length}`,
                            `Protected files skipped: ${remoteDiff.protectedFiles.length}`,
                            '',
                            remoteDiff.missing.length ? `Missing:\n${remoteDiff.missing.slice(0, 20).join('\n')}` : 'Missing: none',
                            remoteDiff.changed.length ? `\nChanged:\n${remoteDiff.changed.slice(0, 20).join('\n')}` : '',
                            remoteDiff.protectedFiles.length ? `\nProtected/skipped:\n${remoteDiff.protectedFiles.slice(0, 10).join('\n')}` : ''
                        ].filter(Boolean).join('\n').slice(0, 3500)
                    }, { quoted: msg });
                    return;
                }

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

            if (!info.behind && info.repoState !== 'not-git') {
                await sock.sendMessage(chatId, {
                    text: `No GitHub updates found.\nLocal changes: ${info.dirty ? 'yes' : 'no'}`
                }, { quoted: msg });
                return;
            }

            if (info.repoState === 'not-git') {
                await sock.sendMessage(chatId, {
                    text: 'This runtime is not a Git checkout, so I will sync files from the configured remote repository.'
                }, { quoted: msg });

                const remoteSync = await syncRemoteRepoToWorkspace();
                const reload = await reloadHandlers();

                await sock.sendMessage(chatId, {
                    text: [
                        '*Remote sync complete*',
                        `Remote: ${remoteSync.remote}`,
                        `Branch: ${remoteSync.branch}`,
                        'The bot files were refreshed from the GitHub remote source without deleting protected local settings.',
                        remoteSync.copied.length ? `Copied: ${remoteSync.copied.join(', ')}` : 'No new files were copied.',
                        '',
                        `Commands: ${reload.commands}`,
                        `Command entries: ${reload.commandEntries}`,
                        `Reply entries: ${reload.replyEntries}`,
                        `Chat triggers: ${reload.chatTriggers}`
                    ].filter(Boolean).join('\n').slice(0, 3500)
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
