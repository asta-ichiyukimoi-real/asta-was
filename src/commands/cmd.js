require('dotenv').config(); // Reads GITHUB_TOKEN from your local .env file
const fs = require('fs');
const acorn = require('acorn');
const path = require('path');
const { Octokit } = require("@octokit/core"); 
const state = require('../utils/stateManager');
const config = require('../../config');

const srcc = path.join(__dirname, '../commands');

const octokit = new Octokit({ 
    auth: process.env.GITHUB_TOKEN  || "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"
});

const REPO_OWNER = "asta-ichiyukimoi-real"; 
const REPO_NAME = "asta-was";     

const validateCode = (codeSnippet) => {
    try {
        acorn.parse(codeSnippet, { 
            ecmaVersion: 2020, 
            sourceType: "script" 
        });
        
        if (!codeSnippet.includes('config:') || !codeSnippet.includes('name:')) {
            return { isValid: false, error: "Missing 'config' block or command 'name'" };
        }
        if (!codeSnippet.includes('onRun:')) {
            return { isValid: false, error: "Missing execution structure 'onRun:'" };
        }

        return { isValid: true, error: null };
    } catch (err) {
        return { 
            isValid: false, 
            error: `Syntax Error: ${err.message}` 
        };
    }
};

const addFileLocally = (fileName, script) => {
    const filePath = path.join(srcc, fileName);
    fs.writeFileSync(filePath, script, 'utf8');
};

const delFileLocally = (fileName) => {
    const filePath = path.join(srcc, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

// Target directory paths match your repository exactly
async function pushToGitHub(fileName, fileContent) {
    const contentBase64 = Buffer.from(fileContent).toString("base64");
    const repoPath = `src/commands/${fileName}`; 
    let currentFileSha = null;

    try {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner: REPO_OWNER, repo: REPO_NAME, path: repoPath
        });
        currentFileSha = data.sha;
    } catch (error) {
        if (error.status !== 404) throw error; 
    }

    const response = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: repoPath,
        message: `feat: sync command ${fileName} via WhatsApp Bot`,
        content: contentBase64,
        sha: currentFileSha || undefined
    });
    return response.data.commit.html_url;
}

module.exports = {
    config: {
        name: 'cmd',
        aliases: ['command'],
        version: '1.0.0',
        description: 'Dynamically manages bot execution commands and syncs with GitHub',
        permissions: 0,
        category: 'general'
    },
    onRun: async (sock, msg, args) => {
        try {
            const chatId = msg.key.remoteJid;
            const commandHandler = global.commandHandler;
            const configHandler = global.configCommandHandler;
            const prefix = state.getChatPrefix(chatId, configHandler?.getPrefix?.() || config.prefix);
            
            const option = args[0]?.toLowerCase();
            let filename = args[1]; 
            const text = args.slice(2).join(' ').trim();
            
            const usage = `*Usage:*\n🔹 _Add:_ ${prefix}cmd add <filename.js> <code>\n🔸 _Delete:_ ${prefix}cmd del <filename.js>`;

            if (!option || !['add', 'del'].includes(option)) {
                return await sock.sendMessage(chatId, { text: usage }, { quoted: msg });
            }

            if (!filename) {
                return await sock.sendMessage(chatId, { text: `⚠️ Please specify a filename.\n\n${usage}` }, { quoted: msg });
            }

            if (!filename.endsWith('.js')) filename += '.js';
            const localPath = path.join(srcc, filename);

            if (option === 'add') {
                if (!text) {
                    return await sock.sendMessage(chatId, { text: `❌ You must provide the code block to register.` }, { quoted: msg });
                }

                const check = validateCode(text);
                if (check.isValid) {
                    // 1. Save Locally
                    addFileLocally(filename, text);
                    await sock.sendMessage(chatId, { text: `⏳ Code validated. Local file \`${filename}\` created. Syncing to GitHub repo...` }, { quoted: msg });

                    // 2. Push to GitHub
                    try {
                        const commitUrl = await pushToGitHub(filename, text);
                        await sock.sendMessage(chatId, { text: `🚀 Successfully pushed to GitHub!\n\n📂 View code updates directly inside your repository folder.` }, { quoted: msg });
                    } catch (gitErr) {
                        await sock.sendMessage(chatId, { text: `⚠️ Local command is working, but GitHub sync failed: ${gitErr.message}` }, { quoted: msg });
                    }

                    // 3. Hot-Reload Bot Memory Cache
                    if (commandHandler?.loadCommands) {
                        commandHandler.loadCommands();
                    }
                } else {
                    await sock.sendMessage(chatId, { text: `❌ Code validation rejected! Details:\n${check.error}` }, { quoted: msg });
                }

            } else if (option === 'del') {
                if (!fs.existsSync(localPath)) {
                    return await sock.sendMessage(chatId, { text: `❌ The command file \`${filename}\` does not exist locally.` }, { quoted: msg });
                }

                delFileLocally(filename);
                await sock.sendMessage(chatId, { text: `🗑️ Successfully deleted \`${filename}\` locally.` }, { quoted: msg });
                
                if (commandHandler?.loadCommands) {
                    commandHandler.loadCommands();
                }
            }
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, { text: `💥 An execution error occurred: ${error.message}` }, { quoted: msg });
        }
    }
};
