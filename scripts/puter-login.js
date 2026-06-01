const fs = require('fs');
const http = require('http');
const path = require('path');

const tokenFile = path.join(__dirname, '../data/puter-token.txt');

function getAuthTokenManually(guiOrigin = 'https://puter.com') {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const token = new URL(req.url, 'http://localhost/').searchParams.get('token');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!doctype html>
<html>
<body style="font-family: sans-serif; padding: 32px;">
  <h1>Puter login complete</h1>
  <p>You can close this tab and return to your terminal.</p>
</body>
</html>`);

            server.close();
            resolve(token);
        });

        server.on('error', reject);
        server.listen(0, () => {
            const { port } = server.address();
            const redirectURL = `http://localhost:${port}`;
            const loginURL = `${guiOrigin}/?action=authme&redirectURL=${encodeURIComponent(redirectURL)}`;

            console.log('Open this Puter login URL in your browser:');
            console.log(loginURL);
            console.log('\nAfter login, Puter will redirect back here and this script will save the token.');
        });
    });
}

async function main() {
    const token = await getAuthTokenManually();

    if (!token) {
        throw new Error('No token was returned. Please try again.');
    }

    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, `${token}\n`, 'utf8');

    console.log(`Saved Puter token to ${tokenFile}`);
    console.log('Restart the bot, then test: .qwen tell me a fun fact');
}

main().catch((error) => {
    console.error(`Puter login failed: ${error.message}`);
    process.exit(1);
});
