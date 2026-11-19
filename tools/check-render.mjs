/**
 * Load every Bb trumpet passage in the page renderer and check a sample A4 PDF.
 *
 *   npm install --no-save puppeteer-core
 *   node tools/check-render.mjs
 *
 * Uses system Chrome. Starts its own static server on 127.0.0.1:8765.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8765;
const base = `http://127.0.0.1:${port}/`;
const chrome = process.env.CHROME || "/usr/bin/google-chrome";
const outDir = "/tmp/ceq-out";

function firstPitchFromXml(xml) {
    const source = xml.replace(/<!DOCTYPE[^>]*>/i, "");
    const measure = (source.split(/<measure\b/)[1] || "").split("</measure>")[0];
    const re = /<note\b[\s\S]*?<\/note>/g;
    let match;
    while ((match = re.exec(measure))) {
        const chunk = match[0];
        if (/<rest\b/.test(chunk)) continue;
        const step = (chunk.match(/<step>([^<]+)<\/step>/) || [])[1];
        const octave = (chunk.match(/<octave>([^<]+)<\/octave>/) || [])[1];
        const alterText = (chunk.match(/<alter>([^<]+)<\/alter>/) || [])[1];
        const alter = alterText === undefined ? 0 : Number(alterText);
        const accidental = alter === 1 ? "#" : alter === -1 ? "b" : "";
        return step + accidental + octave;
    }
    throw new Error("no pitched note in the first measure");
}

function normalPitch(value) {
    return String(value).replace(/♭/g, "b").replace(/♯/g, "#");
}

const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore"
});

async function waitForServer() {
    for (let i = 0; i < 50; i++) {
        try {
            const response = await fetch(base);
            if (response.ok) return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw new Error("static server did not start");
}

const failures = [];
let browser;

try {
    await mkdir(outDir, { recursive: true });
    await waitForServer();
    browser = await puppeteer.launch({
        executablePath: chrome,
        headless: "new",
        args: ["--no-sandbox", "--disable-gpu"]
    });
    const page = await browser.newPage();
    const pageErrors = [];
    const external = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith(base) || url.startsWith("data:") || url.startsWith("blob:")) return;
        external.push(url);
    });

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "networkidle0" });
    await page.evaluate(() => window.CeqApp.ready);

    const manifest = await (await fetch(base + "passages/bb-trumpet/manifest.json")).json();
    if (manifest.length !== 50) throw new Error("expected 50 passages, got " + manifest.length);

    for (const entry of manifest) {
        const fileUrl = base + "passages/bb-trumpet/" + encodeURIComponent(entry.file);
        const xml = await (await fetch(fileUrl)).text();
        const expectedPitch = firstPitchFromXml(xml);
        const metronome = (xml.match(/<per-minute>([^<]+)<\/per-minute>/) || [])[1];
        const summary = await page.evaluate((n) => window.CeqApp.showByNumber(n), entry.n);
        const problems = [];
        if (summary.n !== entry.n) problems.push("number " + summary.n);
        if (summary.measures !== 16) problems.push("measures " + summary.measures);
        if (summary.systems !== 4) problems.push("systems " + summary.systems);
        if (summary.paths < 80) problems.push("paths " + summary.paths);
        if (metronome && !summary.text.includes(metronome)) problems.push("metronome missing: " + metronome);
        const prettyKey = entry.key.replaceAll("Bb", "B♭").replaceAll("Eb", "E♭");
        const prettyTime = entry.time === "cut" ? "Cut time" : entry.time;
        if (!summary.facts.includes(prettyKey)) problems.push("facts key " + summary.facts);
        if (!summary.facts.includes(prettyTime)) problems.push("facts time " + summary.facts);
        if (normalPitch(summary.firstPitch) !== expectedPitch) {
            problems.push("pitch " + summary.firstPitch + " != " + expectedPitch);
        }
        const number = "Passage " + String(entry.n).padStart(2, "0");
        if (summary.title !== number) problems.push("title " + summary.title);
        if (!summary.facts.includes(entry.tempo)) problems.push("facts " + summary.facts);
        if (problems.length) failures.push(entry.file + ": " + problems.join("; "));
        else process.stdout.write("ok " + String(entry.n).padStart(2, "0") + "  " + entry.key + "  " + entry.time + "  " + summary.firstPitch + "\n");
    }

    const random = await page.evaluate(async () => {
        const first = await window.CeqApp.generate();
        const second = await window.CeqApp.generate();
        return [first.n, second.n];
    });
    if (random[0] === random[1]) failures.push("generate repeated " + random[0]);
    else process.stdout.write("generate avoided a repeat (" + random.join(" then ") + ")\n");

    const downloadDir = path.join(outDir, "download");
    await mkdir(downloadDir, { recursive: true });
    const client = await page.createCDPSession();
    await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
    await page.evaluate((n) => window.CeqApp.showByNumber(n), 1);
    await page.click("#downloadButton");
    let saved = [];
    for (let i = 0; i < 80; i++) {
        saved = (await readdir(downloadDir)).filter((name) => name.endsWith(".pdf"));
        if (saved.length) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!saved.length) failures.push("Download PDF did not save a file");
    else process.stdout.write("saved " + saved[0] + "\n");

    const pdfReport = await page.evaluate(async (numbers) => {
        const reports = [];
        for (const n of numbers) {
            await window.CeqApp.showByNumber(n);
            const blob = await window.CeqPdf.buildBlob(window.CeqApp.material());
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            reports.push({ n, dataUrl, stats: window.__lastPdfStats });
        }
        return reports;
    }, [1, 3, 6, 17, 50]);

    for (const report of pdfReport) {
        const bytes = Buffer.from(report.dataUrl.split(",")[1], "base64");
        const file = path.join(outDir, "passage-" + String(report.n).padStart(2, "0") + ".pdf");
        await writeFile(file, bytes);
        const problems = [];
        if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) problems.push("not a pdf");
        if (bytes.length < 20000) problems.push("size " + bytes.length);
        if (!report.stats || report.stats.pages !== 1) problems.push("pages " + JSON.stringify(report.stats));
        if (!report.stats || report.stats.rawWidth < 800) problems.push("raw " + JSON.stringify(report.stats));
        if (!report.stats || report.stats.drawW < 140 || report.stats.drawH < 100) problems.push("draw " + JSON.stringify(report.stats));
        if (problems.length) failures.push("pdf " + report.n + ": " + problems.join("; "));
        else process.stdout.write("pdf " + report.n + " " + bytes.length + " bytes  " + report.stats.drawW + " x " + report.stats.drawH + " mm\n");
    }

    await page.evaluate((n) => window.CeqApp.showByNumber(n), 1);
    await page.screenshot({ path: path.join(outDir, "desktop-passage-01.png"), fullPage: true });
    await page.evaluate((n) => window.CeqApp.showByNumber(n), 6);
    await page.screenshot({ path: path.join(outDir, "desktop-passage-06-cut.png"), fullPage: true });
    await page.evaluate((n) => window.CeqApp.showByNumber(n), 17);
    await page.screenshot({ path: path.join(outDir, "desktop-passage-17-bb.png"), fullPage: true });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await page.evaluate(() => window.CeqApp.showByNumber(1));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const phone = await page.evaluate(() => window.CeqApp.summary());
    if (phone.systems !== 16) failures.push("phone systems " + phone.systems + " (expected 16, one bar a line)");
    else process.stdout.write("phone layout " + phone.systems + " systems\n");
    await page.screenshot({ path: path.join(outDir, "phone-passage-01.png"), fullPage: true });

    await page.screenshot({ path: path.join(outDir, "phone-top.png") });

    if (external.length) failures.push("requests left the site: " + [...new Set(external)].join(", "));
    if (pageErrors.length) failures.push("page errors:\n" + pageErrors.join("\n"));
} finally {
    if (browser) await browser.close();
    server.kill();
}

if (failures.length) {
    console.error("\nFAILED " + failures.length);
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
}
console.log("\nAll 50 passages rendered, and the sample PDFs are A4.");
