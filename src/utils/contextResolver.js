const PRONOUN_REFERENCE_PATTERN = /\b(it|that|this|them|those|he|him|his|she|her|hers|they|their|the image|the picture|the photo|what you saw)\b/i;

function cleanSubjectCandidate(value) {
    return String(value || '')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\b(btw|by the way|send|show|give|get|find|make|draw|generate|create|need|want|image|images|picture|pictures|photo|photos|wallpaper|wallpapers|pin|pins|please|can|could|would|will|you|me|about|of|for|is|are|was|were|the|a|an|do|does|did|know|heard|hear)\b/gi, ' ')
        .replace(/[^\w\s'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSubjectFromText(text) {
    const value = String(text || '').trim();
    const patterns = [
        /\bwho\s+is\s+(.+?)(?:[?.!]|$)/i,
        /\bwhat\s+is\s+(.+?)(?:[?.!]|$)/i,
        /\bdo\s+you\s+know\s+(.+?)(?:[?.!]|$)/i,
        /\bhave\s+you\s+heard\s+of\s+(.+?)(?:[?.!]|$)/i,
        /\bi\s+know\s+(.+?)(?:[?.!]|$)/i,
        /\btell\s+me\s+about\s+(.+?)(?:[?.!]|$)/i,
        /\bexplain\s+(.+?)(?:[?.!]|$)/i,
        /\babout\s+(.+?)(?:[?.!]|$)/i
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        const subject = cleanSubjectCandidate(match?.[1]);
        if (subject) return subject;
    }

    const capitalized = value.match(/\b[A-Z][a-zA-Z0-9'-]{2,}(?:\s+[A-Z][a-zA-Z0-9'-]{2,}){0,3}\b/g);
    return capitalized?.length ? capitalized[capitalized.length - 1] : '';
}

function getLastReferencedSubject(history = []) {
    const recent = history.slice(-8).reverse();

    for (const item of recent) {
        if (item.role !== 'user') continue;
        const subject = extractSubjectFromText(item.text);
        if (subject) return subject;
    }

    for (const item of recent) {
        const subject = extractSubjectFromText(item.text);
        if (subject) return subject;
    }

    return '';
}

function resolvePronouns(prompt, subject) {
    if (!subject || !PRONOUN_REFERENCE_PATTERN.test(prompt)) return prompt;

    return String(prompt || '')
        .replace(/\b(the image|the picture|the photo|what you saw|it|that|this|them|those|he|him|his|she|her|hers|they|their)\b/gi, subject)
        .replace(/\s+/g, ' ')
        .trim() || subject;
}

function normalizeImageSearchQuery(query) {
    return String(query || '')
        .replace(/\bsuper\s+saiy[ae]n\b/gi, 'Super Saiyan')
        .replace(/\bdbz\b/gi, 'Dragon Ball Z')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    PRONOUN_REFERENCE_PATTERN,
    cleanSubjectCandidate,
    extractSubjectFromText,
    getLastReferencedSubject,
    resolvePronouns,
    normalizeImageSearchQuery
};
