
async function run() {
    try {
        const res = await fetch("https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/data/oxford_5000.json");
        const json = await res.json();
        console.log("Total items:", json.length || Object.keys(json).length);
        const counts = {};
        for (const item of Object.values(json)) {
            const lvl = (item.cefr || "unknown").toUpperCase();
            counts[lvl] = (counts[lvl] || 0) + 1;
        }
        console.log("CEFR counts:", counts);
    } catch (e) {
        console.error(e);
    }
}
run();
