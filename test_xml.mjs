import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const yt = require('youtube-transcript');

console.log(Object.keys(yt));

async function testFetch() {
    try {
        const fetcher = yt.YoutubeTranscript || yt.default.YoutubeTranscript;
        const res = await fetcher.fetchTranscript('M_RcV4WSc3k');
        console.log(res.slice(0, 2));
    } catch (e) {
        console.error(e);
    }
}
testFetch();
