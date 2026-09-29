const emojiSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const EMOJI_GRAPHEME_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;

function findEmojis(text) {
    return Array.from(emojiSegmenter.segment(String(text || '')))
        .map(segment => segment.segment)
        .filter(segment => EMOJI_GRAPHEME_PATTERN.test(segment));
}

function chooseRandomEmoji(text, random = Math.random) {
    const emojis = findEmojis(text);
    if (!emojis.length) return null;

    const index = Math.min(emojis.length - 1, Math.floor(random() * emojis.length));
    return emojis[index];
}

module.exports = {
    findEmojis,
    chooseRandomEmoji
};
