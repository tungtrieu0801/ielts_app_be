// ═══════════════════════════════════════════════════════════════════
//  DICTATION CONTROLLER
//  Case 1: POST /dictation/prepare-text  → fill-in-blank
//  Case 2: POST /dictation/prepare-youtube → full-sentence typing
// ═══════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────────

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function decodeHtml(t) {
    return t
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// ── CASE 1 — Text ────────────────────────────────────────────────────

function splitSentences(text) {
    const normalized = text
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, ' ');
    const raw = normalized.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
    return raw.map(s => s.trim()).filter(s => /[a-zA-Z]/.test(s) && s.split(/\s+/).length >= 6);
}

const IELTS_PATTERNS = [
    /\b(as a result of|in addition to|in spite of|in terms of|with regard to|in order to|as well as|rather than|such as|in particular|on the other hand|at the same time|for example|for instance|in contrast|in conclusion|to sum up|as a consequence|with respect to|in other words|a wide range of|a significant number of|to a large extent)\b/gi,
    /\b(increasingly|rapidly|significantly|dramatically|substantially|considerably|widely|particularly|highly|largely|greatly|deeply|strongly|closely|broadly)\s+\w+/gi,
    /\b(significant|substantial|considerable|dramatic|rapid|widespread|major|growing|increasing|declining|rising|environmental|economic|social|technological|scientific|global|fundamental|critical|innovative|traditional|contemporary|negative|positive|potential|notable|apparent|inevitable|crucial|essential)\s+\w+/gi,
    /\b(achieve|improve|enhance|develop|promote|address|reduce|increase|support|maintain|ensure|generate|contribute|demonstrate|establish|implement|overcome|highlight|emphasize|indicate|suggest|affect|influence|facilitate|encourage|reflect|represent|require|provide|create)\s+(a|an|the|their|its|this|these|those|such|our|further|more|additional)?\s*\w+/gi,
    /\b(despite|throughout|beyond|within|between|among|during|following|regarding|concerning|according to|as a result|as part of)\s+(the|a|an|their|its|this|these|those|many|some|several|most|such)?\s*\w+/gi,
];

function findPatternChunks(sentence) {
    const found = [], seen = new Set();
    for (const pattern of IELTS_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(sentence)) !== null) {
            const text = m[0].trim();
            const wc = text.split(/\s+/).length;
            if (wc < 2 || wc > 6 || seen.has(m.index)) continue;
            seen.add(m.index);
            found.push({ text, start: m.index, end: m.index + m[0].trimEnd().length });
        }
    }
    return found;
}

const STOP_WORDS = new Set([
    'a','an','the','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','shall',
    'and','or','but','if','that','this','these','those','it','its',
    'in','on','at','to','for','of','by','not','no','so','yet','nor',
]);

function fallbackChunks(sentence) {
    const words = sentence.split(/\s+/);
    const chunks = [];
    for (let i = 1; i < words.length - 3; i++) {
        const word = words[i].replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (STOP_WORDS.has(word)) continue;
        const len = Math.random() > 0.5 ? 3 : 2;
        const slice = words.slice(i, Math.min(i + len, words.length - 1));
        const text = slice.join(' ');
        let pos = 0;
        for (let wi = 0; wi < i; wi++) {
            pos = sentence.indexOf(words[wi], pos) + words[wi].length;
            while (pos < sentence.length && sentence[pos] === ' ') pos++;
        }
        const actualPos = sentence.indexOf(words[i], pos);
        if (actualPos !== -1) chunks.push({ text, start: actualPos, end: actualPos + text.length });
    }
    return shuffle(chunks);
}

function buildBlankedSentence(sentence) {
    const words = sentence.split(/\s+/);
    const maxBlanks = words.length <= 8 ? 1 : words.length <= 14 ? 2 : 3;

    let candidates = findPatternChunks(sentence);
    candidates = candidates.length < maxBlanks
        ? shuffle([...candidates, ...fallbackChunks(sentence)])
        : shuffle(candidates);

    const selected = [], usedRanges = [];
    for (const c of candidates) {
        const overlaps = usedRanges.some(([s, e]) => c.start < e && c.end > s);
        if (!overlaps) { selected.push(c); usedRanges.push([c.start - 1, c.end + 1]); }
        if (selected.length >= maxBlanks) break;
    }
    selected.sort((a, b) => a.start - b.start);

    const parts = [];
    let cursor = 0;
    for (const chunk of selected) {
        if (chunk.start > cursor) parts.push({ type: 'text', value: sentence.slice(cursor, chunk.start) });
        parts.push({ type: 'blank', answer: chunk.text });
        cursor = chunk.end;
    }
    if (cursor < sentence.length) parts.push({ type: 'text', value: sentence.slice(cursor) });
    return { original: sentence, parts, blanks: selected.map(c => c.text) };
}

export const prepareText = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 30) {
            return res.status(400).json({ error: 'Text quá ngắn. Hãy dán đoạn văn dài hơn.' });
        }
        const sentences = splitSentences(text);
        if (!sentences.length) {
            return res.status(400).json({ error: 'Không tách được câu. Đảm bảo đây là văn bản tiếng Anh.' });
        }
        const exercises = sentences.map(buildBlankedSentence);
        return res.json({ mode: 'text', exercises, total: exercises.length });
    } catch (err) {
        console.error('[dictation] prepareText:', err);
        return res.status(500).json({ error: 'Lỗi server khi xử lý văn bản.' });
    }
};

// ── CASE 2 — YouTube InnerTube API ───────────────────────────────────

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_UA = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const INNERTUBE_CONTEXT = {
    client: { clientName: 'ANDROID', clientVersion: INNERTUBE_CLIENT_VERSION },
};

function extractVideoId(url) {
    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;
    const m = url.match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

/**
 * YouTube's newer caption XML uses <p t="ms" d="ms"> format.
 * Older one uses <text start="s" dur="s"> format.
 * We handle both.
 */
function parseCaptionXml(xml) {
    const items = [];

    // Try newer <p t="..." d="..."> format (ms timestamps)
    const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = pRegex.exec(xml)) !== null) {
        // Extract text from <s> tags or the raw element
        let text = '';
        const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
        let sm;
        while ((sm = sRegex.exec(m[3])) !== null) text += sm[1];
        if (!text) text = m[3].replace(/<[^>]+>/g, '');
        text = decodeHtml(text).trim();
        if (text) items.push({ start: parseInt(m[1], 10) / 1000, dur: parseInt(m[2], 10) / 1000, text });
    }
    if (items.length > 0) return items;

    // Fallback: older <text start="s" dur="s"> format
    const tRegex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
    while ((m = tRegex.exec(xml)) !== null) {
        const text = decodeHtml(m[3].replace(/<[^>]+>/g, '').replace(/\n/g, ' ')).trim();
        if (text) items.push({ start: parseFloat(m[1]), dur: parseFloat(m[2]), text });
    }
    return items;
}

// Method A: InnerTube API (JSON POST — most reliable, used by official apps)
async function fetchViaInnerTube(videoId) {
    const res = await fetch(INNERTUBE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': INNERTUBE_UA,
        },
        body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);

    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    console.log(`[dictation] InnerTube: ${tracks.length} tracks found`);
    if (!tracks.length) throw new Error('Video này không có phụ đề (InnerTube).');

    // Prefer English (manual > auto-generated)
    const track =
        tracks.find(t => t.languageCode === 'en' && !t.kind) ||  // manual English
        tracks.find(t => t.languageCode === 'en') ||              // any English
        tracks.find(t => t.languageCode?.startsWith('en')) ||     // en-US, en-GB etc.
        tracks.find(t => t.kind === 'asr') ||                     // any auto-generated
        tracks[0];

    console.log(`[dictation] Selected track: lang=${track.languageCode} kind=${track.kind || 'manual'}`);
    if (!track?.baseUrl) throw new Error('Caption track has no download URL.');

    const captionRes = await fetch(track.baseUrl, { signal: AbortSignal.timeout(10000) });
    if (!captionRes.ok) throw new Error(`Caption download HTTP ${captionRes.status}`);
    const xml = await captionRes.text();
    const items = parseCaptionXml(xml);
    console.log(`[dictation] Parsed ${items.length} caption segments`);
    return items;
}

// Method B: Page scrape with bracket-matching JSON extraction (fallback)
async function fetchViaPageScrape(videoId) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'PREF=hl=en&gl=US; CONSENT=YES+cb;',
        },
        signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) throw new Error(`YouTube page HTTP ${res.status}`);
    const html = await res.text();

    // Bracket-matching JSON extraction for captionTracks
    const marker = '"captionTracks":';
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) throw new Error('No captionTracks found in page. Video might not have subtitles.');

    let arrayStart = html.indexOf('[', markerIdx);
    if (arrayStart === -1) throw new Error('Malformed captionTracks in page.');

    let depth = 0, i = arrayStart, inStr = false, esc = false;
    while (i < html.length) {
        const c = html[i];
        if (esc) { esc = false; i++; continue; }
        if (c === '\\' && inStr) { esc = true; i++; continue; }
        if (c === '"') { inStr = !inStr; }
        if (!inStr) {
            if (c === '[') depth++;
            else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
        }
        i++;
    }

    let tracks;
    try {
        tracks = JSON.parse(html.slice(arrayStart, i));
    } catch (e) {
        throw new Error('Could not parse captionTracks JSON from page.');
    }

    if (!tracks.length) throw new Error('No caption tracks in page source.');

    const track =
        tracks.find(t => t.languageCode === 'en' && !t.kind) ||
        tracks.find(t => t.languageCode === 'en') ||
        tracks.find(t => t.languageCode?.startsWith('en')) ||
        tracks[0];

    const url = track.baseUrl;
    const captionRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!captionRes.ok) throw new Error(`Caption download HTTP ${captionRes.status}`);
    const xml = await captionRes.text();
    return parseCaptionXml(xml);
}

async function fetchYouTubeCaptions(videoId) {
    // Primary: InnerTube API (same method used by the package)
    try {
        console.log('[dictation] Method A: InnerTube API…');
        const items = await fetchViaInnerTube(videoId);
        if (items.length > 0) return items;
    } catch (e) {
        console.warn('[dictation] InnerTube failed:', e.message, '→ trying page scrape');
    }

    // Fallback: page scrape
    console.log('[dictation] Method B: Page scrape…');
    const items = await fetchViaPageScrape(videoId);
    if (items.length > 0) return items;

    throw new Error('Không tìm thấy phụ đề cho video này sau khi thử tất cả phương pháp.');
}

/**
 * Merge caption segments into sentences, preserving timestamps.
 * - Punctuated transcripts: split at .!?
 * - ASR captions with no punctuation: split every ~12 words
 */
function mergeIntoSentences(captions) {
    const sentences = [];
    let currentText = '';
    let sentenceStart = null;
    let sentenceEnd = null;
    let wordCount = 0;
    const MAX_WORDS = 14;

    const flush = () => {
        const clean = currentText.trim();
        if (clean.split(/\s+/).length >= 4) {
            sentences.push({
                text: clean,
                start: sentenceStart ?? 0,
                end: sentenceEnd ?? (sentenceStart ?? 0) + 5,
            });
        }
        currentText = '';
        sentenceStart = null;
        sentenceEnd = null;
        wordCount = 0;
    };

    for (const cap of captions) {
        const t = cap.text.replace(/\[.*?\]/g, '').trim();
        if (!t) continue;
        if (sentenceStart === null) sentenceStart = cap.start;
        sentenceEnd = cap.start + cap.dur;
        currentText = currentText ? `${currentText} ${t}` : t;
        wordCount += t.split(/\s+/).length;

        const hasTerminator = /[.!?]$/.test(currentText.trimEnd());
        if (hasTerminator || wordCount >= MAX_WORDS) flush();
    }
    if (currentText.trim()) flush();
    return sentences;
}

export const prepareYoutube = async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'Vui lòng nhập YouTube URL.' });

        const videoId = extractVideoId(url.trim());
        if (!videoId) {
            return res.status(400).json({
                error: 'URL YouTube không hợp lệ. Ví dụ: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            });
        }

        const captions = await fetchYouTubeCaptions(videoId);
        if (!captions.length) {
            return res.status(400).json({ error: 'Không lấy được phụ đề từ video này.' });
        }

        const sentences = mergeIntoSentences(captions);
        if (!sentences.length) {
            return res.status(400).json({ error: 'Không tách được câu từ phụ đề.' });
        }

        const exercises = sentences.map(s => ({
            original: s.text,
            mode: 'youtube',
            start: s.start,
            end: s.end,
        }));
        return res.json({ mode: 'youtube', exercises, total: exercises.length, videoId });
    } catch (err) {
        console.error('[dictation] prepareYoutube error:', err.message);
        return res.status(500).json({
            error: err.message || 'Lỗi khi tải phụ đề YouTube. Thử video khác hoặc kiểm tra phụ đề.',
        });
    }
};
