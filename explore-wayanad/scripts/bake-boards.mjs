// Bus destination boards, rendered once by headless Chrome (correct Malayalam shaping: കോഴിക്കോട് has a two-part vowel
// sign and a conjunct that plain text renderers get wrong) into small WebP images the traffic puts on the buses.
//   node scripts/bake-boards.mjs        (CHROME=/path/to/chrome to override)
// Two styles: "led" — amber dot-matrix-like text on black (state transport); "painted" — dark red and black on a
// cream board (private buses). Three texts each: Malayalam, English, both. Font: Noto Sans Malayalam (OFL, Google
// Fonts), loaded by the page at bake time only.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "public/models/traffic/boards", W = 512, H = 128;
const TEXTS = { ml: ["കോഴിക്കോട്"], en: ["KOZHIKODE"], both: ["കോഴിക്കോട്", "KOZHIKODE"] };
const STYLES = {
  led: { bg: "#0b0b0a", ink: "#ffb22e", glow: "0 0 6px rgba(255,170,40,.75)", frame: "#1d1d1b", dots: true },
  painted: { bg: "#f1e7c8", ink: "#7d1414", ink2: "#151515", glow: "none", frame: "#2a2a28", dots: false },
};
const page = (style, lines) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@700&family=Noto+Sans:wght@700&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${style.frame}}
.b{box-sizing:border-box;width:${W}px;height:${H}px;border:6px solid ${style.frame};background:${style.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;overflow:hidden}
.l{font-family:"Noto Sans Malayalam","Noto Sans",sans-serif;font-weight:700;color:${style.ink};text-shadow:${style.glow};line-height:1;white-space:nowrap}
.l+.l{color:${style.ink2 ?? style.ink}}
.one .l{font-size:66px}.two .l{font-size:42px}.two .l+.l{font-size:34px;letter-spacing:.08em}
.b::after{content:"";position:absolute;inset:0;${style.dots ? "background:radial-gradient(circle,transparent 55%,rgba(0,0,0,.55) 60%) 0 0/4px 4px" : "background:linear-gradient(transparent,rgba(0,0,0,.06))"}}
</style></head><body><div class="b ${lines.length === 1 ? "one" : "two"}">${lines.map((l) => `<div class="l">${l}</div>`).join("")}</div></body></html>`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = join(tmpdir(), `boards-${process.pid}`);
const chrome = spawn(process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9335", `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 50 && !targets?.length; i++) { try { targets = await (await fetch("http://127.0.0.1:9335/json/list")).json(); } catch {} await wait(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

mkdirSync(OUT, { recursive: true });
for (const [styleName, style] of Object.entries(STYLES)) for (const [textName, lines] of Object.entries(TEXTS)) {
  const html = join(tmpdir(), `board-${styleName}-${textName}.html`);
  writeFileSync(html, page(style, lines));
  await send("Page.navigate", { url: `file://${html}` });
  for (let i = 0; i < 40; i++) { const r = await send("Runtime.evaluate", { expression: "document.fonts.status === 'loaded' && document.fonts.check('700 40px \"Noto Sans Malayalam\"')", returnByValue: true }); if (r.result?.result?.value) break; await wait(250); }
  await wait(300);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  const png = join(tmpdir(), `board-${styleName}-${textName}.png`), out = `${OUT}/${styleName}-${textName}.webp`;
  writeFileSync(png, Buffer.from(shot.result.data, "base64"));
  execFileSync("magick", [png, "-quality", "88", out]);
  console.log(out);
}
ws.close(); chrome.kill(); await wait(300); rmSync(profile, { recursive: true, force: true });
