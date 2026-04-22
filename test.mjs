import https from 'https';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const INNERTUBE_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } };

const videoId = "HrVV9A4SYDs";
async function getXml() {
    const res = await fetch(INNERTUBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': INNERTUBE_UA },
        body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
    });
    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) return console.log('No tracks');
    
    for (const track of tracks) {
        if (track.languageCode !== 'en') continue;
        console.log(`\nTrack: ${track.languageCode} (kind: ${track.kind || 'manual'})`);
        const r = await fetch(track.baseUrl);
        const xml = await r.text();
        const startIdx = xml.indexOf('bloodstream');
        if (startIdx !== -1) {
             const snippet = xml.slice(Math.max(0, startIdx - 500), Math.min(xml.length, startIdx + 500));
             console.log(snippet);
        } else {
             console.log("Word 'bloodstream' not found.");
        }
    }
}
getXml();
