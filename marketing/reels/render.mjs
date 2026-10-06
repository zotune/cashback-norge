// Render a reel: node render.mjs <video-name> [--fps 30] [--still 3.2,8.5] [--draft]
// Expects build/<name>/timeline.json + voice.wav (run tts.py first).
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const fps = Number(opt("--fps", 30));
const stills = opt("--still", "");
const draft = args.includes("--draft");

const videoDir = resolve(ROOT, "videos", name);
const buildDir = resolve(ROOT, "build", name);
const outDir = resolve(ROOT, "out");
mkdirSync(outDir, { recursive: true });
const timeline = JSON.parse(readFileSync(resolve(buildDir, "timeline.json"), "utf8"));

const browser = await chromium.launch({ args: ["--disable-gpu", "--use-angle=swiftshader", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[page error]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()); });
await page.addInitScript((tl) => { window.TIMELINE = tl; }, timeline);
await page.goto(pathToFileURL(resolve(videoDir, "index.html")).href);
const { duration, sfx } = await page.evaluate(() => window.__init());

if (stills) {
  for (const t of stills.split(",").map(Number)) {
    await page.evaluate((t) => window.__seek(t), t);
    const p = resolve(buildDir, `still-${t.toFixed(2)}.png`);
    await page.screenshot({ path: p });
    console.log(p);
  }
  await browser.close();
  process.exit(0);
}

writeFileSync(resolve(buildDir, "sfx.json"), JSON.stringify({ duration, sfx }));
execFileSync(resolve(ROOT, ".venv/bin/python"), [resolve(ROOT, "sfx.py"), resolve(buildDir, "sfx.json"), resolve(buildDir, "sfx.wav"), resolve(buildDir, "music.wav")], { stdio: "inherit" });

const frames = Math.ceil(duration * fps);
const silent = resolve(buildDir, "video.mp4");
const ff = spawn("ffmpeg", [
  "-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
  "-c:v", "libx264", "-preset", draft ? "veryfast" : "slow", "-crf", draft ? "23" : "16",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(fps), silent,
], { stdio: ["pipe", "inherit", "inherit"] });

const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__seek(t), i / fps);
  const buf = await page.screenshot({ type: "jpeg", quality: draft ? 85 : 97 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`\nframes done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// Mix: voice (lead) + sfx + music bed ducked under the voice.
const mux = (withMusic, out) => {
  const inputs = ["-i", silent, "-i", resolve(buildDir, "voice.wav"), "-i", resolve(buildDir, "sfx.wav")];
  let filter;
  if (withMusic) {
    inputs.push("-i", resolve(buildDir, "music.wav"));
    filter = [
      "[1:a]aformat=sample_rates=48000:channel_layouts=mono,volume=1.0,asplit=2[v][vk]",
      "[3:a]volume=0.55[m]",
      "[m][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md]",
      "[2:a]volume=0.8[s]",
      "[v][s][md]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,aformat=channel_layouts=stereo[a]",
    ].join(";");
  } else {
    filter = "[1:a][2:a]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,aformat=channel_layouts=stereo[a]";
  }
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", duration.toFixed(3), "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log(out);
};
mux(true, resolve(outDir, `${name}.mp4`));
mux(false, resolve(outDir, `${name}-uten-musikk.mp4`));
