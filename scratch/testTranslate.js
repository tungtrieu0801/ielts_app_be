import { translate } from "google-translate-api-x";
async function run() {
    try {
        const text = ["magnificent", "glorious", "splendid"].join(" | ");
        const res = await translate(text, { to: "vi" });
        console.log("Original:", text);
        console.log("Translated:", res.text);
        console.log("Split translations:", res.text.split(" | "));
    } catch (e) {
        console.error(e);
    }
}
run();
