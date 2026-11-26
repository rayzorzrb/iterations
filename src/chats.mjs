// Every chat, start to end. Reads each Claude Code transcript on this Mac and keeps a record of
// every picture in it (screens the session took in Paper, the browser, the simulator or the
// desktop, image files it opened, pictures you pasted, and image files it sent you), every page
// it published, and everything you typed, in order. Nothing but Claude Code's own files is read.
//
// Pictures inside a transcript stay there: each record keeps where its line is (file, byte
// offset, length) and the server reads it back when asked. Image files a session sent you and
// pages it published live in folders that get cleared, so a copy of each is kept here
// (~/.iterations/files, ~/.iterations/pages) the first time it is read. Records are kept in
// ~/.iterations/chats, one per transcript, and outlive the transcript.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const HOME = process.env.ITERATIONS_HOME || path.join(os.homedir(), ".iterations");
export const THUMBS = path.join(HOME, "thumb");
export const FILES = path.join(HOME, "files"); // image files sessions sent you, by content
export const PAGES = path.join(HOME, "pages"); // pages sessions published, each version by content
const CACHE = path.join(HOME, "chats");
const CLAUDE = process.env.ITERATIONS_CLAUDE_HOME || path.join(os.homedir(), ".claude");
const DESKTOP = process.env.ITERATIONS_DESKTOP_SESSIONS || path.join(os.homedir(), "Library/Application Support/Claude/claude-code-sessions");
const VERSION = 2; // of the record format; a change reads every transcript again

// What the person typed, without what the app added around it (reminders, pasted blocks,
// command wrappers).
export function typed(content) {
  const raw = typeof content === "string" ? content
    : Array.isArray(content) ? content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : "";
  const t = raw
    .replace(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[a-z][\w-]*\b[^>]*\/>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || /^(\[Request interrupted|Caveat:|This session is being continued|The summarized conversation|\[Artifact comment)/.test(t)) return "";
  return t;
}

// A guess from the words, nothing more: does this read as turning the design down?
const NO = /\b(no|nope|nah|not (good|right|great|it|what|working|there|quite)|don'?t (like|want|love)|do not (like|want)|hate|ugly|wrong|bad|worse|awful|terrible|amateur\w*|boring|meh|off|revert|go back|undo|scrap|drop (it|this|that)|kill (it|this|that)|start over|redo|try again|too (much|many|big|small|busy|loud|dark|light|heavy|thin|generic|plain|similar|close|tight)|doesn'?t (work|feel|look)|isn'?t (working|right)|looks? (off|weird|cheap|generic|like ai))\b/i;
export const readsAsNo = (text) => NO.test(String(text || "").slice(0, 260));

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// ---- reading a transcript --------------------------------------------------------------------

// Each line with where it starts, so a picture's line can be read again later on its own.
async function* lines(file, start = 0) {
  const stream = fs.createReadStream(file, { start, highWaterMark: 1 << 20 });
  let held = [], heldLen = 0, offset = start;
  for await (const chunk of stream) {
    let i = 0;
    for (;;) {
      const nl = chunk.indexOf(10, i);
      if (nl < 0) { if (i < chunk.length) { held.push(chunk.subarray(i)); heldLen += chunk.length - i; } break; }
      const piece = chunk.subarray(i, nl);
      const len = heldLen + piece.length;
      yield { line: held.length ? Buffer.concat([...held, piece], len) : piece, offset, len };
      offset += len + 1; held = []; heldLen = 0; i = nl + 1;
    }
  }
  // a last line still being written has no end yet: left for the next read
}

// The pictures in one row, always in the same order (the server counts along the same way).
export function* picturesOf(row) {
  const content = row?.message?.content;
  if (!Array.isArray(content)) return;
  for (const c of content) {
    if (c.type === "image" && c.source?.data) yield { source: c.source, tool: null };
    else if (c.type === "tool_result" && Array.isArray(c.content)) {
      for (const x of c.content) if (x.type === "image" && x.source?.data) yield { source: x.source, tool: c.tool_use_id };
    }
  }
}

// Width and height from the picture's own first bytes.
function dims(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return {};
}

// Where a picture came from, in a word. null: not design work (reference searches).
function sourceOf(tool) {
  if (tool === null) return "You pasted";
  const t = String(tool || "");
  if (/mobbin|refs__/i.test(t)) return null;
  if (/paper/i.test(t)) return "Paper";
  if (/pencil/i.test(t)) return "Pencil";
  if (/figma|sansfig/i.test(t)) return "Figma";
  if (/Simulator/i.test(t)) return "Simulator";
  if (/Browser|chrome|playwright|aside/i.test(t)) return "Browser";
  if (/computer-use/i.test(t)) return "Screen";
  if (t === "Read") return "File";
  return "Screenshot";
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const hashOf = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 16);
const HTML = /\.html?$/i;
const MAX_PAGE = 2e6; // a page bigger than this isn't followed through its edits

// An image file a session sent you, copied in by its content the moment it is found (the folder
// it was in may be cleared tomorrow). null when it is gone already.
function keepFile(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 40e6) return null;
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase().replace("jpeg", "jpg");
    const hash = hashOf(buf);
    fs.mkdirSync(FILES, { recursive: true });
    const dest = path.join(FILES, `${hash}.${ext}`);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    const d = dims(buf);
    return { hash, ext, w: d.w || 0, h: d.h || 0 };
  } catch { return null; }
}

// A page as it was published, kept by its content.
function keepPage(text) {
  const hash = hashOf(text);
  fs.mkdirSync(PAGES, { recursive: true });
  const dest = path.join(PAGES, `${hash}.html`);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, text);
  const title = (text.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || "").trim();
  return { hash, title };
}

// One Edit on a page's text, the way Claude Code applies it. null when the text isn't known.
function applyEdit(text, e) {
  if (typeof text !== "string" || typeof e?.old_string !== "string" || typeof e.new_string !== "string") return null;
  if (!text.includes(e.old_string)) return null;
  return e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string);
}

async function scan(file, rec) {
  const names = new Map(); // tool_use id -> tool name
  const waiting = new Map(); // tool_use id -> a send or a publish, until its result says it worked
  rec.html ||= {}; // page path -> its text as the transcript has built it so far
  let end = rec.scanned;
  for await (const { line, offset, len } of lines(file, rec.scanned)) {
    end = offset + len + 1;
    const hasPic = line.includes('"type":"image"');
    const hasTool = !hasPic && line.includes('"type":"tool_use"');
    const isUser = line.includes('"type":"user"');
    if (!hasPic && !hasTool && !isUser) continue;
    // a tool's text result matters only when it answers a send or a publish
    if (!hasPic && isUser && line.includes('"type":"tool_result"') && !hasTool && ![...waiting.keys()].some((id) => line.includes(id))) continue;
    let row;
    try { row = JSON.parse(line.toString("utf8")); } catch { continue; }
    if (row.isSidechain) continue;
    if (!rec.cwd && row.cwd) rec.cwd = row.cwd;
    const content = row.message?.content;
    const at = Date.parse(row.timestamp) || 0;
    const sid = row.sessionId || rec.id;
    const where = row.cwd || rec.cwd || os.homedir();
    const full = (f) => (String(f).startsWith("~/") ? path.join(os.homedir(), String(f).slice(2)) : path.resolve(where, String(f)));
    if (hasTool && Array.isArray(content)) for (const c of content) {
      if (c.type !== "tool_use") continue;
      names.set(c.id, c.name);
      const i = c.input || {};
      // a page's text, followed through the session's own writes and edits
      if (typeof i.file_path === "string" && HTML.test(i.file_path)) {
        const fp = full(i.file_path);
        if (c.name === "Write" && typeof i.content === "string") { if (i.content.length < MAX_PAGE) rec.html[fp] = i.content; else delete rec.html[fp]; }
        else if (c.name === "Edit") { const t = applyEdit(rec.html[fp], i); if (t === null) delete rec.html[fp]; else rec.html[fp] = t; }
        else if (c.name === "MultiEdit" && Array.isArray(i.edits)) { let t = rec.html[fp]; for (const e of i.edits) t = applyEdit(t, e); if (t === null) delete rec.html[fp]; else rec.html[fp] = t; }
      }
      if (c.name === "SendUserFile" && Array.isArray(i.files)) {
        const pics = i.files.filter((f) => typeof f === "string" && /\.(png|jpe?g|webp|gif)$/i.test(f)).map(full);
        if (pics.length) waiting.set(c.id, { send: pics, caption: typeof i.caption === "string" ? i.caption : "", at, sid });
      } else if (c.name === "Artifact" && typeof i.file_path === "string" && HTML.test(i.file_path) && !i.asset && (!i.action || i.action === "publish")) {
        waiting.set(c.id, { page: full(i.file_path), at, sid });
      }
    }
    // a send or a publish that worked: keep what it showed
    if (isUser && Array.isArray(content) && waiting.size) for (const c of content) {
      if (c.type !== "tool_result" || !waiting.has(c.tool_use_id)) continue;
      const w = waiting.get(c.tool_use_id);
      waiting.delete(c.tool_use_id);
      const said = typeof c.content === "string" ? c.content : JSON.stringify(c.content || "");
      if (c.is_error || /refused|rejected|conflict/i.test(said.slice(0, 200))) continue;
      if (w.send) {
        for (const f of w.send) { const k = keepFile(f); if (k) rec.items.push({ at: w.at, sid: w.sid, ...k, src: "Sent to you", kept: "file", ...(w.caption && { caption: w.caption.slice(0, 400) }) }); }
      } else {
        // the text as the session wrote it; else the file as it is now, if it is still there
        let text = rec.html[w.page];
        if (typeof text !== "string") { try { const st = fs.statSync(w.page); if (st.size < MAX_PAGE) text = fs.readFileSync(w.page, "utf8"); } catch {} }
        if (typeof text === "string") { const k = keepPage(text); rec.items.push({ at: w.at, sid: w.sid, hash: k.hash, page: true, title: k.title || path.basename(w.page), src: "Published" }); }
      }
    }
    if (hasPic) {
      let n = -1;
      for (const p of picturesOf(row)) {
        n++;
        const src = sourceOf(p.tool === null ? null : names.get(p.tool) || "");
        if (!src || (p.tool === null && row.type !== "user")) continue;
        const data = p.source.data;
        const hash = crypto.createHash("sha1").update(data).digest("hex").slice(0, 16);
        const d = dims(Buffer.from(data.slice(0, 131072), "base64"));
        rec.items.push({ at, sid, hash, ext: EXT[p.source.media_type] || "jpg", w: d.w || 0, h: d.h || 0, src, o: offset, l: len, n });
      }
    }
    if (row.type === "user" && !row.isMeta && !(Array.isArray(content) && content.some((c) => c.type === "tool_result"))) {
      const text = typed(content);
      if (text && at) rec.prompts.push({ at, sid, text: text.length > 600 ? `${text.slice(0, 600)}…` : text });
    }
  }
  rec.scanned = end;
  // only the pages last worked on need their text kept for the next read
  const paths = Object.keys(rec.html);
  if (paths.length > 40) for (const k of paths.slice(0, paths.length - 40)) delete rec.html[k];
}

// Every transcript's record: read from the cache when the transcript hasn't grown, read on from
// where the last read stopped when it has, and kept as it was when the transcript is gone.
async function records(log) {
  fs.mkdirSync(CACHE, { recursive: true });
  const found = new Map();
  const root = path.join(CLAUDE, "projects");
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, d)); } catch { continue; }
    for (const f of files) if (f.endsWith(".jsonl")) found.set(f.slice(0, -6), path.join(root, d, f));
  }
  const out = [];
  let i = 0, read = 0;
  for (const [id, file] of found) {
    i++;
    const cacheFile = path.join(CACHE, `${id}.json`);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    let rec = readJSON(cacheFile, null);
    if (!rec || rec.v !== VERSION || rec.file !== file || rec.scanned > st.size) rec = { v: VERSION, id, file, cwd: "", scanned: 0, items: [], prompts: [], html: {} };
    if (rec.scanned < st.size) {
      const before = rec.scanned;
      try { await scan(file, rec); } catch (e) { log(`couldn't read ${id}: ${e.message}`); }
      if (rec.scanned !== before) {
        fs.writeFileSync(`${cacheFile}.tmp`, JSON.stringify(rec));
        fs.renameSync(`${cacheFile}.tmp`, cacheFile);
        read++;
        if (read % 5 === 0) log(`read ${i} of ${found.size} chats…`);
      }
    }
    out.push(rec);
  }
  for (const f of fs.readdirSync(CACHE)) {
    if (!f.endsWith(".json") || found.has(f.slice(0, -5))) continue;
    const rec = readJSON(path.join(CACHE, f), null);
    if (rec?.v === VERSION) out.push({ ...rec, gone: true });
  }
  return out;
}

// ---- whose chat, which project ---------------------------------------------------------------

function desktopThreads() {
  const byCli = new Map();
  const walk = (dir) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.startsWith("local_") && e.name.endsWith(".json")) {
        const s = readJSON(p, null);
        if (!s?.sessionId) continue;
        const t = { id: s.sessionId, title: s.title || "", cwd: s.originCwd || s.cwd || "" };
        for (const cli of [s.cliSessionId, s.lastAssistantCliSessionId]) if (cli) byCli.set(cli, t);
      }
    }
  };
  walk(DESKTOP);
  return byCli;
}

// A project from the folder a chat ran in: the folder's name, a worktree counted as its repo,
// and a folder the app made for one session counted as none.
function projectOf(cwd) {
  if (!cwd) return "No folder";
  if (/scratch-workspaces|\/tmp\/|\/T\//.test(cwd)) return "No folder";
  const repo = cwd.split("/.claude/worktrees/")[0].replace(/\/+$/, "");
  if (repo === os.homedir()) return "Home";
  return path.basename(repo).trim() || "No folder";
}

// how a chat began, in your words: the first thing typed, kept short, without file paths
const brief = (t) => { const w = String(t || "").replace(/@"[^"]*"|@[~/]\S*/g, "").replace(/\s+/g, " ").trim(); return w.length > 200 ? `${w.slice(0, 200).replace(/\s+\S*$/, "")}…` : w; };

// a folder the app made for one session is no project
const nameOf = (n) => (/^scratch-\d{4}-/.test(n) ? "No folder" : n);

// ---- every chat, as a board ----------------------------------------------------------------------

/** hash -> where its picture can be read from: filled by digAll, used by the server. */
export const pointers = new Map();

export async function digAll({ log = () => {} } = {}) {
  const recs = await records(log);
  const byCli = desktopThreads();
  // anything matching "private" in ~/.iterations/config.json never shows
  const hidden = (readJSON(path.join(HOME, "config.json"), {}).private || []).map((p) => String(p).toLowerCase());
  const isPrivate = (...words) => hidden.some((p) => words.some((w) => String(w || "").toLowerCase().includes(p)));

  // chats: a desktop thread (however many sessions it ran through), or a session on its own
  const chats = new Map();
  const chatOf = (sid, rec) => {
    const t = byCli.get(sid);
    const key = t?.id || sid;
    if (!chats.has(key)) {
      const cwd = t?.cwd || rec?.cwd || "";
      chats.set(key, { id: key, title: t?.title || "", cwd, project: nameOf(projectOf(cwd)), pics: [], said: [], gone: true });
    }
    return chats.get(key);
  };
  const seen = new Set();
  pointers.clear();
  for (const rec of recs) {
    for (const it of rec.items) {
      const k = `${it.sid}:${it.hash}:${it.at}`;
      if (seen.has(k)) continue; // a forked chat's transcript carries its parent's rows
      seen.add(k);
      const c = chatOf(it.sid, rec);
      if (!rec.gone) c.gone = false;
      c.pics.push(it);
      if (it.kept === "file") pointers.set(it.hash, { kept: path.join(FILES, `${it.hash}.${it.ext}`), ext: it.ext });
      else if (!it.page && !rec.gone && !pointers.has(it.hash)) pointers.set(it.hash, { file: rec.file, o: it.o, l: it.l, n: it.n, ext: it.ext });
    }
    for (const p of rec.prompts) {
      const k = `${p.sid}:p:${p.at}`;
      if (seen.has(k)) continue;
      seen.add(k);
      chatOf(p.sid, rec).said.push(p);
    }
  }
  const plots = new Map();
  const plotOf = (name) => { if (!plots.has(name)) plots.set(name, { key: name, name, chats: [], screens: 0, rejected: 0 }); return plots.get(name); };
  let total = 0, rejected = 0, standing = 0;

  for (const c of chats.values()) {
    if (!c.pics.length || isPrivate(c.title, c.cwd)) continue;
    c.pics.sort((a, b) => a.at - b.at);
    c.said.sort((a, b) => a.at - b.at);
    if (!c.title) c.title = (c.said[0]?.text || "Untitled chat").slice(0, 64);
    // one trail: what you typed, then what came back, in order; a picture seen twice shows once
    const once = new Set();
    const pics = c.pics.filter((p) => !once.has(p.hash) && once.add(p.hash));
    const rows = [...c.said.map((s) => ({ t: "s", at: s.at, text: s.text })), ...pics.map((p) => ({ t: p.page ? "p" : "i", ...p }))]
      .sort((a, b) => a.at - b.at || (a.t === "s" ? -1 : 1));
    const events = [];
    let last = null, since = 0; // the last picture the session made since you last typed
    for (const r of rows) {
      if (r.t === "s") {
        if (!since) continue; // words with no picture before them aren't about a design
        const no = readsAsNo(r.text);
        if (last && no) { last.no = true; rejected++; }
        events.push({ t: "s", at: r.at, text: r.text.length > 240 ? `${r.text.slice(0, 240).replace(/\s+\S*$/, "")}…` : r.text, ...(no && { no: true }) });
        last = null; since = 0;
      } else {
        const e = r.t === "p"
          ? { t: "p", at: r.at, hash: r.hash, title: r.title, src: r.src }
          : { t: "i", at: r.at, hash: r.hash, ext: r.ext, w: r.w, h: r.h, src: r.src, ...(r.caption && { caption: r.caption }) };
        events.push(e);
        if (r.src !== "You pasted") { last = e; since++; }
      }
    }
    const made = events.filter((e) => e.t !== "s" && e.src !== "You pasted");
    if (!events.some((e) => e.t !== "s")) continue;
    if (made.length) { made[made.length - 1].alive = true; standing++; }
    const n = events.filter((e) => e.t !== "s").length;
    total += n;
    const plot = plotOf(c.project);
    plot.screens += n;
    plot.rejected += events.filter((e) => e.no && e.t !== "s").length;
    plot.chats.push({ id: c.id, title: c.title, start: (events.find((e) => e.at) || events[0]).at, end: events[events.length - 1].at, screens: n, gone: c.gone, brief: brief(c.said[0]?.text), events });
  }

  for (const p of plots.values()) p.chats.sort((a, b) => b.end - a.end);
  const out = {
    builtAt: Date.now(), total, rejected, standing,
    chats: [...plots.values()].reduce((n, p) => n + p.chats.length, 0),
    plots: [...plots.values()].sort((a, b) => b.screens - a.screens),
  };
  log(`${out.total} screens in ${out.chats} chats across ${out.plots.length} projects; ${out.rejected} turned down in words, ${out.standing} still standing`);
  return out;
}

/** The picture itself: a kept file, or read back out of its transcript line. null when gone. */
export function readPicture(hash) {
  const p = pointers.get(hash);
  if (!p) return null;
  if (p.kept) {
    try { return { bytes: fs.readFileSync(p.kept), type: { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[p.ext] || "image/jpeg", ext: p.ext }; } catch { return null; }
  }
  try {
    const fd = fs.openSync(p.file, "r");
    const buf = Buffer.alloc(p.l);
    fs.readSync(fd, buf, 0, p.l, p.o);
    fs.closeSync(fd);
    let n = -1;
    for (const pic of picturesOf(JSON.parse(buf.toString("utf8")))) if (++n === p.n) return { bytes: Buffer.from(pic.source.data, "base64"), type: pic.source.media_type || "image/jpeg", ext: p.ext };
  } catch {}
  return null;
}
