function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];
        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (/[0-9.]/.test(char)) {
            let value = char;
            index++;
            while (index < input.length && /[0-9.]/.test(input[index])) {
                value += input[index++];
            }
            if (!/^\d+(\.\d+)?$|^\.\d+$/.test(value)) {
                throw new Error('Invalid number');
            }
            tokens.push({ type: 'number', value: Number(value) });
            continue;
        }

        if ('+-*/%^()'.includes(char)) {
            tokens.push({ type: 'operator', value: char });
            index++;
            continue;
        }

        throw new Error('Invalid character');
    }

    return tokens;
}

function parseExpression(tokens) {
    let position = 0;

    function peek() {
        return tokens[position];
    }

    function consume(value) {
        if (peek()?.value === value) {
            position++;
            return true;
        }
        return false;
    }

    function parsePrimary() {
        if (consume('+')) return parsePrimary();
        if (consume('-')) return -parsePrimary();

        const token = peek();
        if (token?.type === 'number') {
            position++;
            return token.value;
        }

        if (consume('(')) {
            const value = parseAddSubtract();
            if (!consume(')')) throw new Error('Missing closing parenthesis');
            return value;
        }

        throw new Error('Expected number');
    }

    function parsePower() {
        let value = parsePrimary();
        while (consume('^')) {
            value = Math.pow(value, parsePrimary());
        }
        return value;
    }

    function parseMultiplyDivide() {
        let value = parsePower();
        while (true) {
            if (consume('*')) value *= parsePower();
            else if (consume('/')) value /= parsePower();
            else if (consume('%')) value %= parsePower();
            else break;
        }
        return value;
    }

    function parseAddSubtract() {
        let value = parseMultiplyDivide();
        while (true) {
            if (consume('+')) value += parseMultiplyDivide();
            else if (consume('-')) value -= parseMultiplyDivide();
            else break;
        }
        return value;
    }

    const result = parseAddSubtract();
    if (position !== tokens.length) throw new Error('Unexpected input');
    return result;
}

module.exports = {
    config: {
        name: 'calc',
        aliases: ['calculate', 'math'],
        version: '1.0.0',
        description: 'Calculates a basic math expression',
        usage: 'calc <expression>',
        examples: ['calc (12 + 8) / 4', 'calc 2^8'],
        permissions: 0,
        category: 'utility'
    },
    onRun: async (sock, msg, args) => {
        const expression = args.join(' ');

        if (!expression) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'Send a math expression.\nExample: !calc (12 + 8) / 4'
            }, { quoted: msg });
            return;
        }

        try {
            const result = parseExpression(tokenize(expression));
            if (!Number.isFinite(result)) throw new Error('Invalid result');

            await sock.sendMessage(msg.key.remoteJid, {
                text: `*${expression}* = ${Number(result.toFixed(10))}`
            }, { quoted: msg });
        } catch {
            await sock.sendMessage(msg.key.remoteJid, {
                text: 'I could not calculate that. Use numbers with +, -, *, /, %, ^ and parentheses.'
            }, { quoted: msg });
        }
    }
};
