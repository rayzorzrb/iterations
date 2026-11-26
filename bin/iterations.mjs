#!/usr/bin/env node
// iterations: every screen from every Claude Code chat, start to end, on one board.
//
//   iterations                 read the chats, serve on this Mac only, open a window
//   iterations --demo          sample work only: nothing of yours is read
//   iterations --name "Ana"    whose iterations they are (default: your first name)
//   iterations --port 4798     another port
//   iterations --no-open       don't open a window
//   iterations --browser       open in an ordinary browser tab, not a window of its own
//   iterations --pages-online  let old published pages load their own fonts and scripts
//   iterations --json          print what was found and stop
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const demo = flag("demo");
const log = (m) => console.error(`iterations: ${m}`);

function firstName() {
  for (const cmd of [["git", ["config", "--global", "user.name"]], ["id", ["-F"]]]) {
    try { const n = execFileSync(cmd[0], cmd[1], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); if (n) return n.split(/\s+/)[0]; } catch {}
  }
  return os.userInfo().username;
}
// the demo reads nothing of yours, your name included
const name = opt("name", demo ? "Sam" : firstName());
const wanted = Number(opt("port", process.env.ITERATIONS_PORT || (demo ? 4799 : 4798)));

// Opened as a window of its own (no tabs, no address bar) when a browser that can do that is
// installed, so it sits beside your work like an app. --browser opens an ordinary tab instead.
const WINDOWED = ["Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium"];
const openWindow = (at) => {
  if (flag("no-open")) return;
  const app = !flag("browser") && process.platform === "darwin" && WINDOWED.find((a) => fs.existsSync(`/Applications/${a}.app`));
  const cmd = app ? ["open", ["-na", app, "--args", `--app=${at}`, "--window-size=1480,940"]] : [process.platform === "darwin" ? "open" : "xdg-open", [at]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
};

// One already open on that port (and of the same kind) is the one to show: no second copy.
async function alreadyOpen(port) {
  try {
    const r = await fetch(`http://localhost:${port}/api/hello`, { signal: AbortSignal.timeout(1500) });
    const said = r.ok ? await r.json() : {};
    return said.iterations === true && !!said.demo === demo;
  } catch { return false; }
}
if (!flag("json") && !args.includes("--port") && await alreadyOpen(wanted)) {
  log(`already open at http://localhost:${wanted}`);
  openWindow(`http://localhost:${wanted}`);
  process.exit(0);
}

// The demo never loads the code that reads transcripts.
let board, readPicture = () => null, pointers = new Map(), THUMBS = "", HOME = "", PAGES = "", demoPicture = () => null;
if (demo) {
  const d = await import("../src/demo.mjs");
  demoPicture = d.demoPicture;
  board = async () => d.demoBoard();
  log("sample work only: nothing of yours is read");
} else {
  const c = await import("../src/chats.mjs");
  ({ readPicture, pointers, THUMBS, HOME, PAGES } = c);
  board = () => c.digAll({ log });
  log("reading every chat (the first time takes a little while)…");
}
let data = await board();
if (flag("json")) { process.stdout.write(JSON.stringify(data, null, 1)); process.exit(0); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function send(res, file, type) {
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": type, "content-length": st.size, "cache-control": type.startsWith("image/") ? "max-age=3600" : "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}

// ---- small copies ----------------------------------------------------------------------------
// A picture is read out of its transcript once and kept small (macOS's own sips), so the board
// can show thousands, and so it is still here after the transcript is deleted.
const TMP = HOME && path.join(HOME, "tmp");
if (!demo) { fs.mkdirSync(THUMBS, { recursive: true }); fs.mkdirSync(TMP, { recursive: true }); }
const making = new Map(); // hash -> promise of the small copy's path (or null)
let busy = 0;
const waiting = [];
const turn = () => new Promise((go) => { if (busy < 4) { busy++; go(); } else waiting.push(go); });
const done = () => { const next = waiting.shift(); if (next) next(); else busy--; };

function small(hash) {
  const file = path.join(THUMBS, `${hash}.jpg`);
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (making.has(hash)) return making.get(hash);
  const p = (async () => {
    await turn();
    try {
      const pic = readPicture(hash);
      if (!pic) return null;
      const src = path.join(TMP, `${hash}.${pic.ext}`);
      fs.writeFileSync(src, pic.bytes);
      await new Promise((ok) => execFile("sips", ["-Z", "420", "-s", "format", "jpeg", "-s", "formatOptions", "72", src, "--out", `${file}.tmp`], () => ok()));
      fs.rmSync(src, { force: true });
      if (fs.existsSync(`${file}.tmp`)) { fs.renameSync(`${file}.tmp`, file); return file; }
      return null;
    } catch { return null; } finally { done(); making.delete(hash); }
  })();
  making.set(hash, p);
  return p;
}
// every picture gets its small copy in the background
async function warm() {
  if (demo) return;
  const all = [...pointers.keys()].filter((h) => !fs.existsSync(path.join(THUMBS, `${h}.jpg`)));
  if (all.length) log(`keeping small copies of ${all.length} screens in the background…`);
  for (let i = 0; i < all.length; i += 3) await Promise.all(all.slice(i, i + 3).map(small));
  if (all.length) log("small copies done");
}

// The board itself may load only from this Mac: no font, script, picture or request can go
// anywhere else, whatever a transcript or an old page contains.
const OWN = "http://localhost:* http://127.0.0.1:*";
const BOARD_RULES = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' ${OWN} data:; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'`;
// An old published page is shown in a frame with no access to the board, and (unless
// --pages-online) cut off from the network too: only what is written in the page itself runs.
const PAGE_RULES = flag("pages-online") ? "sandbox allow-scripts" : "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

const handler = async (req, res) => {
  // this Mac only, asked for by its own name (a page elsewhere can't read the board)
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) || req.method !== "GET") { res.writeHead(403).end(); return; }
  res.setHeader("x-content-type-options", "nosniff");
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  if (p === "/") {
    res.setHeader("content-security-policy", BOARD_RULES);
    return send(res, path.join(HERE, "../src/canvas.html"), "text/html; charset=utf-8");
  }
  const font = p.match(/^\/fonts\/(GeistVF\.woff2|GeistSerifVF\.woff2|Caveat\.ttf)$/);
  if (font) {
    res.setHeader("cache-control", "max-age=86400");
    return send(res, path.join(HERE, "../src/fonts", font[1]), font[1].endsWith(".ttf") ? "font/ttf" : "font/woff2");
  }
  if (p === "/api/hello") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ iterations: true, demo })); }
  if (p === "/api/board") {
    if (url.searchParams.has("again")) { try { data = await board(); warm(); } catch (e) { log(e.message); } }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ name, ...data }));
  }
  const m = p.match(/^\/(t|f|page)\/([a-f0-9]{16})$/);
  if (!m) { res.writeHead(404).end(); return; }
  const [, kind, hash] = m;
  if (demo) {
    const svg = (kind === "t" || kind === "f") && demoPicture(hash);
    if (!svg) { res.writeHead(404).end(); return; }
    // a drawing is still a document: it runs nothing and loads nothing
    res.writeHead(200, { "content-type": "image/svg+xml", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "cache-control": "max-age=3600" });
    return res.end(svg);
  }
  // a screen from a chat: small, or as it was
  if (kind === "t") {
    const f = await small(hash);
    if (f) return send(res, f, TYPES.jpg);
    const pic = readPicture(hash);
    if (!pic) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": pic.type });
    return res.end(pic.bytes);
  }
  if (kind === "f") {
    const pic = readPicture(hash);
    if (pic) { res.writeHead(200, { "content-type": pic.type, "cache-control": "max-age=3600" }); return res.end(pic.bytes); }
    // its transcript is gone: the small copy is what's left
    return send(res, path.join(THUMBS, `${hash}.jpg`), TYPES.jpg);
  }
  // a page as it was published
  res.setHeader("content-security-policy", PAGE_RULES);
  return send(res, path.join(PAGES, `${hash}.html`), "text/html; charset=utf-8");
};

function listen(port, triesLeft) {
  const server = http.createServer(handler);
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && triesLeft > 0) { log(`port ${port} is taken by something else; trying ${port + 1}`); return listen(port + 1, triesLeft - 1); }
    log(e.message); process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const at = `http://localhost:${port}`;
    log(`open at ${at}  (ctrl-c to close)`);
    openWindow(at);
    warm();
  });
}
listen(wanted, 10);
