const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const DEFAULT_REMOTE_URL = 'https://github.com/asta-ichiyukimoi-real/asta-was.git';
const DEFAULT_BRANCH = 'main';
const UPDATE_APPROVAL_TTL_MS = 15 * 60 * 1000;
const pendingUpdateApprovals = new Map();
const PROTECTED_REMOTE_NAMES = new Set([
    '.env',
    'config.js',
    'bot-state.json',
    'cookies.txt',
    'auth_info_baileys',
    'backups',
    'data',
    'logs'
]);

function normalizeRemotePath(filePath) {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isProtectedRemotePath(filePath) {
    const [topLevelName] = normalizeRemotePath(filePath).split('/');
    return PROTECTED_REMOTE_NAMES.has(topLevelName);
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

function createApprovalToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function outputOf(result) {
    return [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
}

function unwrapMessage(message) {
    let current = message || {};

    for (let i = 0; i < 5; i += 1) {
        const next = current.ephemeralMessage?.message
            || current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.documentWithCaptionMessage?.message;

        if (!next) break;
        current = next;
    }

    return current;
}

function getQuotedText(msg) {
    const message = unwrapMessage(msg.message);
    const contextInfo = message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || message.videoMessage?.contextInfo
        || message.documentMessage?.contextInfo
        || null;
    const quoted = unwrapMessage(contextInfo?.quotedMessage);

    return quoted.conversation
        || quoted.extendedTextMessage?.text
        || quoted.imageMessage?.caption
        || quoted.videoMessage?.caption
        || quoted.documentMessage?.caption
        || '';
}

function isOwnerMessage(msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    return Boolean(global.configCommandHandler?.isOwner?.(sender, msg));
}

function parseIncomingCommitLog(rawLog) {
    const commits = [];
    const lines = String(rawLog || '').split(/\r?\n/).filter(Boolean);
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^[0-9a-f]{7,40}\b/.test(trimmed)) {
            const match = trimmed.match(/^([0-9a-f]{7,40})\s(.+)$/i);
            if (match) {
                current = {
                    sha: match[1],
                    subject: match[2],
                    files: []
                };
                commits.push(current);
            }
            continue;
        }

        const fileStatus = trimmed.match(/^([A-Z])\d*\s+(.+)$/);
        if (fileStatus && current) {
            const [, status, filePath] = fileStatus;
            const normalizedPath = String(filePath || '').trim().replace(/\t/g, ' -> ');
            if (normalizedPath) {
                current.files.push({
                    status,
                    path: normalizedPath
                });
            }
        }
    }

    return commits;
}

function describeIncomingCommits(incomingCommits) {
    if (!incomingCommits?.length) {
        return 'Incoming commits: none';
    }

    const lines = ['Incoming commits from GitHub:', ''];
    for (const commit of incomingCommits) {
        const visibleFiles = commit.files?.slice(0, 12) || [];
        const files = visibleFiles.length ? visibleFiles.map(f => `${f.status} ${f.path}`).join(', ') : 'No file status supplied';
        const extra = commit.files?.length > visibleFiles.length ? `, +${commit.files.length - visibleFiles.length} more` : '';
        lines.push(`- ${commit.sha} ${commit.subject}`);
        lines.push(`  Files: ${files}${extra}`);
    }
    return lines.join('\n');
}

function inferCommitType(commit) {
    const subject = String(commit.subject || '').toLowerCase();
    const statuses = new Set((commit.files || []).map(file => file.status));

    if (/fix|bug|error|crash|patch|repair/.test(subject)) return 'Fix';
    if (/security|vulnerability|auth|permission/.test(subject)) return 'Security';
    if (/config|setting|env/.test(subject)) return 'Config';
    if (/command|cmd/.test(subject)) return 'Command';
    if (/feature|add|new/.test(subject) || statuses.has('A')) return 'Feature';
    if (/remove|delete|drop/.test(subject) || statuses.has('D')) return 'Removal';
    if (/refactor|clean|rename/.test(subject) || statuses.has('R')) return 'Refactor';
    if (/doc|readme/.test(subject)) return 'Docs';
    if (statuses.has('M')) return 'Change';
    return 'Update';
}

function formatCommitList(commits) {
    if (!commits?.length) {
        return ['No commit details were returned by GitHub.'];
    }

    return commits.slice(0, 12).map((commit, index) => {
        const files = commit.files || [];
        const shownFiles = files.slice(0, 5).map(file => `${file.status} ${file.path}`).join(', ');
        const extraFiles = files.length > 5 ? `, +${files.length - 5} more` : '';

        return [
            `${index + 1}. ${inferCommitType(commit)} - ${commit.subject}`,
            `   Commit: ${commit.sha}`,
            files.length ? `   Files: ${shownFiles}${extraFiles}` : ''
        ].filter(Boolean).join('\n');
    });
}

function rememberUpdateApproval(chatId, sender, info) {
    const token = createApprovalToken();
    pendingUpdateApprovals.set(token, {
        chatId,
        sender,
        branch: info.branch,
        local: info.local,
        upstream: info.upstream,
        createdAt: Date.now()
    });
    return token;
}

function getApprovalFromQuotedMessage(msg) {
    const quotedText = getQuotedText(msg);
    const token = quotedText.match(/\[UPDATE_TOKEN:([a-z0-9]+)\]/i)?.[1];
    if (!token) return null;

    const approval = pendingUpdateApprovals.get(token);
    if (!approval) return { token, expired: true };

    if (Date.now() - approval.createdAt > UPDATE_APPROVAL_TTL_MS) {
        pendingUpdateApprovals.delete(token);
        return { token, expired: true };
    }

    return { token, approval };
}

function describeRemoteDiff(diff) {
    const lines = [];
    lines.push('Remote update analysis:');
    lines.push(`Repository: ${diff.remote}`);
    lines.push(`Branch: ${diff.branch}`);
    lines.push(`Remote revision: ${diff.remoteRevision || 'main'}`);
    lines.push(`Remote files scanned: ${diff.remoteFiles || 0}`);
    lines.push(`Missing local files: ${diff.missing?.length || 0}`);
    lines.push(`Changed local files: ${diff.changed?.length || 0}`);
    lines.push(`Protected files skipped: ${diff.protectedFiles?.length || 0}`);

    if (diff.missing?.length) {
        lines.push('Missing files would be created if the remote source is applied:');
        lines.push(diff.missing.slice(0, 20).map(file => `  - ${file}`).join('\n'));
    } else {
        lines.push('Missing files: none');
    }

    if (diff.changed?.length) {
        lines.push('Changed files differ from the remote checkout:');
        lines.push(diff.changed.slice(0, 20).map(file => `  - ${file}`).join('\n'));
    } else {
        lines.push('Changed files: none');
    }

    if (diff.protectedFiles?.length) {
        lines.push('Protected files are not touched by the remote sync path:');
        lines.push(diff.protectedFiles.map(file => `  - ${file}`).join('\n'));
    }

    const safeUpdateSize = Math.max(0, (diff.changed || []).length + (diff.missing || []).length);
    lines.push('');
    lines.push(`Description: the remote source currently reports ${safeUpdateSize} candidate drift item(s) that should be reviewed before applying. Missing files are local runtime additions, changed files are byte-different candidates, and protected files are blocked from remote replacement.`);

    return lines.join('\n');
}

async function compareRemoteRepoToWorkspace() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-update-'));
    const cloneDir = path.join(tempRoot, 'repo');

    try {
        const clone = await runGit(['clone', '--depth', '1', '--branch', DEFAULT_BRANCH, DEFAULT_REMOTE_URL, cloneDir], {
            cwd: tempRoot,
            timeoutMs: 240000
        });

        if (!clone.ok) {
            throw new Error(`Remote clone failed:\n${outputOf(clone)}`);
        }

        const missing = [];
        const changed = [];
        const protectedFiles = [];
        const remoteFiles = [];

        function walkRemoteTree(remoteDir, relativePrefix = '') {
            const entries = fs.readdirSync(remoteDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === '.git') continue;
                if (entry.name === 'node_modules') continue;

                const remotePath = path.join(remoteDir, entry.name);
                const relativePath = normalizeRemotePath(path.join(relativePrefix, entry.name));

                remoteFiles.push(relativePath);

                if (isProtectedRemotePath(relativePath)) {
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

                    if (!fs.lstatSync(localPath).isFile()) {
                        changed.push(relativePath);
                        continue;
                    }

                    const remoteData = fs.readFileSync(remotePath);
                    const localData = fs.readFileSync(localPath);
                    if (Buffer.compare(remoteData, localData) !== 0) {
                        changed.push(relativePath);
                    }
                }
            }
        }

        walkRemoteTree(cloneDir);

        return {
            branch: DEFAULT_BRANCH,
            remote: DEFAULT_REMOTE_URL,
            missing,
            changed,
            protectedFiles,
            remoteFiles: remoteFiles.length,
            remoteRevision: 'main',
            description: describeRemoteDiff({
                remote: DEFAULT_REMOTE_URL,
                branch: DEFAULT_BRANCH,
                remoteRevision: 'main',
                remoteFiles: remoteFiles.length,
                missing,
                changed,
                protectedFiles
            })
        };
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

async function syncRemoteRepoToWorkspace() {
    const diff = await compareRemoteRepoToWorkspace();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asta-update-'));
    const cloneDir = path.join(tempRoot, 'repo');

    try {
        const clone = await runGit(['clone', '--depth', '1', '--branch', DEFAULT_BRANCH, DEFAULT_REMOTE_URL, cloneDir], {
            cwd: tempRoot,
            timeoutMs: 240000
        });

        if (!clone.ok) {
            throw new Error(`Remote clone failed:\n${outputOf(clone)}`);
        }

        const copied = [];
        const skipped = [];

        function copyTree(sourceDir, relativePrefix = '') {
            const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === '.git') continue;
                if (entry.name === 'node_modules') continue;

                const source = path.join(sourceDir, entry.name);
                const relativePath = normalizeRemotePath(path.join(relativePrefix, entry.name));

                if (isProtectedRemotePath(relativePath)) continue;

                if (entry.isDirectory()) {
                    copyTree(source, relativePath);
                    continue;
                }

                if (!entry.isFile()) continue;

                const target = path.join(process.cwd(), relativePath);
                const sourceContent = fs.readFileSync(source);
                const targetExists = fs.existsSync(target);

                if (targetExists && !fs.lstatSync(target).isFile()) {
                    skipped.push(`${relativePath}: local path is not a file`);
                    continue;
                }

                const targetContent = targetExists ? fs.readFileSync(target) : null;

                if (!targetContent || Buffer.compare(sourceContent, targetContent) !== 0) {
                    fs.mkdirSync(path.dirname(target), { recursive: true });
                    fs.copyFileSync(source, target);
                    copied.push(relativePath);
                }
            }
        }

        copyTree(cloneDir);

        return {
            branch: DEFAULT_BRANCH,
            remote: DEFAULT_REMOTE_URL,
            copied,
            skipped,
            diff
        };
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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
    const remoteNameStatus = await runGit(['log', '--name-status', '--oneline', '--max-count=20', `HEAD..origin/${branch.stdout}`]);
    const parsedCommits = parseIncomingCommitLog(remoteNameStatus.stdout);
    const status = await runGit(['status', '--porcelain']);

    return {
        branch: branch.stdout,
        remote: remoteUrl,
        local: local.stdout,
        upstream: upstream.stdout,
        ahead: Number(ahead) || 0,
        behind: Number(behind) || 0,
        changes: log.stdout,
        incomingCommitDetails: parsedCommits,
        incomingCommitDescription: describeIncomingCommits(parsedCommits),
        dirty: Boolean(status.stdout),
        dirtySummary: status.stdout,
        gitAvailable: true,
        repoState: 'git'
    };
}

async function sendUpdatePreview(sock, msg, info) {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (info.repoState === 'not-git') {
        const remoteDiff = await compareRemoteRepoToWorkspace();
        const hasDrift = remoteDiff.missing.length || remoteDiff.changed.length;
        const token = hasDrift ? rememberUpdateApproval(chatId, sender, info) : null;

        await sock.sendMessage(chatId, {
            text: [
                '*Updates Available*',
                `Remote: ${remoteDiff.remote}`,
                `Branch: ${remoteDiff.branch}`,
                'Type: Remote file sync',
                `Missing files: ${remoteDiff.missing.length}`,
                `Changed files: ${remoteDiff.changed.length}`,
                `Protected files skipped: ${remoteDiff.protectedFiles.length}`,
                '',
                remoteDiff.missing.length ? `Files to create:\n${remoteDiff.missing.slice(0, 20).join('\n')}` : '',
                remoteDiff.changed.length ? `Files to update:\n${remoteDiff.changed.slice(0, 20).join('\n')}` : '',
                '',
                hasDrift ? 'Reply to this message with yes, apply, or update to install these updates.' : 'No remote file updates found.',
                token ? `[UPDATE_TOKEN:${token}]` : '',
                hasDrift ? '[REPLY_ID:update]' : ''
            ].filter(Boolean).join('\n').slice(0, 7000)
        }, { quoted: msg });
        return;
    }

    if (!info.behind) {
        await sock.sendMessage(chatId, {
            text: `No GitHub updates found.\nLocal changes: ${info.dirty ? 'yes' : 'no'}`
        }, { quoted: msg });
        return;
    }

    const token = rememberUpdateApproval(chatId, sender, info);
    await sock.sendMessage(chatId, {
        text: [
            '*Updates Available*',
            `Remote: ${info.remote}`,
            `Branch: ${info.branch}`,
            `Local: ${short(info.local)}`,
            `Remote HEAD: ${short(info.upstream)}`,
            `Updates: ${info.behind} commit(s)`,
            `Local changes: ${info.dirty ? 'yes - they will be stashed and restored' : 'no'}`,
            '',
            '*Update list*',
            ...formatCommitList(info.incomingCommitDetails),
            '',
            'Reply to this message with yes, apply, or update to install these updates.',
            `[UPDATE_TOKEN:${token}]`,
            '[REPLY_ID:update]'
        ].filter(Boolean).join('\n').slice(0, 7000)
    }, { quoted: msg });
}

async function applyUpdate(sock, msg, expectedApproval = null) {
    const chatId = msg.key.remoteJid;
    const info = await getUpdateInfo();

    if (expectedApproval && info.repoState !== 'not-git') {
        const remoteChanged = expectedApproval.branch !== info.branch
            || expectedApproval.local !== info.local
            || expectedApproval.upstream !== info.upstream;

        if (remoteChanged) {
            await sock.sendMessage(chatId, {
                text: 'The available update changed since that preview was sent. Run .update again and approve the fresh list.'
            }, { quoted: msg });
            return;
        }
    }

    if (!info.behind && info.repoState !== 'not-git') {
        await sock.sendMessage(chatId, {
            text: `No GitHub updates found.\nLocal changes: ${info.dirty ? 'yes' : 'no'}`
        }, { quoted: msg });
        return;
    }

    if (info.repoState === 'not-git') {
        await sock.sendMessage(chatId, {
            text: 'Applying approved remote file sync...'
        }, { quoted: msg });

        const remoteSync = await syncRemoteRepoToWorkspace();
        const reload = await reloadHandlers();

        await sock.sendMessage(chatId, {
            text: [
                '*Remote Sync Complete*',
                `Remote: ${remoteSync.remote}`,
                `Branch: ${remoteSync.branch}`,
                'The bot files were refreshed from the GitHub remote source without deleting protected local settings.',
                remoteSync.copied.length ? `Copied: ${remoteSync.copied.join(', ')}` : 'No new files were copied.',
                remoteSync.skipped.length ? `Skipped: ${remoteSync.skipped.join(', ')}` : '',
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
                'Run .update to review the remote list, then decide whether to push, reset manually, or merge from shell.'
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
        const mode = (args[0] || 'preview').toLowerCase();
        const chatId = msg.key.remoteJid;

        try {
            await sock.sendMessage(chatId, { text: 'Checking GitHub for updates...' }, { quoted: msg });
            const info = await getUpdateInfo();

            if (mode === 'apply' || mode === 'force') {
                await applyUpdate(sock, msg);
                return;
            }

            if (mode === 'check' || mode === 'preview' || mode === 'list') {
                await sendUpdatePreview(sock, msg, info);
                return;
            }

            await sock.sendMessage(chatId, {
                text: 'Use .update to list updates, then reply yes/apply/update to the preview. Use .update apply to apply immediately.'
            }, { quoted: msg });
        } catch (error) {
            console.error('Update command error:', error);
            await sock.sendMessage(chatId, {
                text: `Update failed:\n${String(error.message || error).slice(0, 3000)}`
            }, { quoted: msg });
        }
    },
    onReply: async (sock, msg, replyText) => {
        const chatId = msg.key.remoteJid;
        const answer = String(replyText || '').trim().toLowerCase();

        try {
            if (!isOwnerMessage(msg)) {
                await sock.sendMessage(chatId, {
                    text: 'Only the owner can approve updates.'
                }, { quoted: msg });
                return;
            }

            const approvalResult = getApprovalFromQuotedMessage(msg);
            if (!approvalResult?.approval) {
                await sock.sendMessage(chatId, {
                    text: approvalResult?.expired
                        ? 'That update approval expired. Run .update again to get a fresh list.'
                        : 'Reply to a valid update preview message to approve an update.'
                }, { quoted: msg });
                return;
            }

            if (/^(no|n|cancel|stop)$/i.test(answer)) {
                pendingUpdateApprovals.delete(approvalResult.token);
                await sock.sendMessage(chatId, {
                    text: 'Update cancelled.'
                }, { quoted: msg });
                return;
            }

            if (!/^(yes|y|apply|update|install|go)$/i.test(answer)) {
                await sock.sendMessage(chatId, {
                    text: 'Reply yes, apply, or update to install. Reply no to cancel.'
                }, { quoted: msg });
                return;
            }

            const sender = msg.key.participant || msg.key.remoteJid;
            if (approvalResult.approval.chatId !== chatId || approvalResult.approval.sender !== sender) {
                await sock.sendMessage(chatId, {
                    text: 'Only the same owner who requested this update preview can approve it.'
                }, { quoted: msg });
                return;
            }

            pendingUpdateApprovals.delete(approvalResult.token);
            await sock.sendMessage(chatId, {
                text: 'Approval received. Applying update now...'
            }, { quoted: msg });
            await applyUpdate(sock, msg, approvalResult.approval);
        } catch (error) {
            console.error('Update reply error:', error);
            await sock.sendMessage(chatId, {
                text: `Update failed:\n${String(error.message || error).slice(0, 3000)}`
            }, { quoted: msg });
        }
    }
};
