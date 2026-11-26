#!/usr/bin/env node
// Before anything goes public: look through every file git tracks (or every file in a folder
// given as the first argument) for things that must not ship. Exits 1 when it finds any.
//
//   node scripts/audit.mjs            the files git tracks here
//   node scripts/audit.mjs ../public  every file in that folder
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.argv[2] || ".");
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === ".git" || e.name === "node_modules") continue; const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(path.relative(root, p)); } return out; };
const files = process.argv[2] ? walk(root) : execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

const user = os.userInfo().username;
const RULES = [
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an API key or token", /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/],
  ["a secret written in the file", /\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ["a home folder path", /\/Users\/[a-z][\w.-]+\/|\/home\/[a-z][\w.-]+\//],
  ["this Mac's user name", new RegExp(`\\b${user.replace(/[^\w]/g, ".")}\\b`)],
  ["an email address", /\b[\w.+-]+@(?!users\.noreply\.github\.com)[\w-]+\.(com|design|io|dev|co|net|org|in)\b/],
];
const NAMES = [/^\.env/, /\.pem$/, /\.p12$/, /id_rsa/, /credentials/i, /\.sqlite$/, /\.jsonl$/];
const mine = path.relative(root, new URL(import.meta.url).pathname); // this file names what it looks for

let found = 0;
for (const f of files) {
  if (NAMES.some((n) => n.test(path.basename(f)))) { console.log(`${f}: a file that should not ship`); found++; }
  if (f === mine || /\.(woff2?|ttf|png|jpe?g|gif|mp4|icns)$/i.test(f)) continue;
  let text;
  try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    for (const [what, re] of RULES) if (re.test(line)) { console.log(`${f}:${i + 1}: ${what}`); found++; }
  });
}
console.log(found ? `\n${found} thing${found === 1 ? "" : "s"} to look at before this goes public.` : `Looked through ${files.length} files: nothing that shouldn't ship.`);
process.exit(found ? 1 : 0);
