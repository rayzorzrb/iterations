// Sample work for a first look: three made-up projects, their chats cut into rounds, and every
// screen drawn here as a small SVG. Nothing is read from this Mac: no transcripts, no settings,
// not even your name.
import crypto from "node:crypto";

const id = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
const num = (hash, i) => parseInt(hash.slice(i * 2, i * 2 + 2), 16) / 255;
const pictures = new Map(); // hash -> what to draw

const PALETTES = [
  { bg: "#f4efe6", ink: "#2b2622", a: "#c8553d", b: "#e8c9a0" },
  { bg: "#1f2a2e", ink: "#f2efe9", a: "#e9b44c", b: "#5b8a8a" },
  { bg: "#eef2ee", ink: "#1d2b22", a: "#3f7d5c", b: "#c9dccf" },
  { bg: "#fbf3ee", ink: "#33211c", a: "#d9643a", b: "#f3cdb8" },
  { bg: "#14161c", ink: "#f4f4f6", a: "#7c8cff", b: "#2a2e3d" },
  { bg: "#fffaf0", ink: "#22201c", a: "#2f6fde", b: "#ffd66b" },
];
const SERIF = "Georgia, 'Times New Roman', serif", SANS = "Helvetica, Arial, sans-serif";

// ---- the drawings ---------------------------------------------------------------------------
function logo(h, { word, step }) {
  const p = PALETTES[Math.floor(num(h, 0) * PALETTES.length)];
  const shape = Math.floor(num(h, 1) * 4), font = step < 1 ? SANS : num(h, 2) > 0.4 ? SERIF : SANS;
  const mark = [
    `<rect x="210" y="150" width="180" height="180" fill="${p.a}"/>`,
    `<circle cx="300" cy="240" r="96" fill="${p.a}"/>`,
    `<path d="M210 250c0-70 40-110 96-106s92 46 84 108-52 84-98 80-82-30-82-82z" fill="${p.a}"/>`,
    `<path d="M214 330V236a86 86 0 01172 0v94z" fill="${p.a}"/>`,
  ][step < 1 ? 0 : shape];
  const letter = `<text x="300" y="${shape === 3 && step ? 300 : 282}" text-anchor="middle" font-family="${font}" font-size="${step < 1 ? 110 : 124}" font-weight="${step < 1 ? 700 : 400}" fill="${p.bg}">${word[0]}</text>`;
  const spacing = [2, 10, 18, 26][Math.floor(num(h, 3) * 4)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="${p.bg}"/>${mark}${letter}<text x="300" y="440" text-anchor="middle" font-family="${font}" font-size="${step < 1 ? 44 : 50}" letter-spacing="${spacing}" fill="${p.ink}">${step < 1 ? word.toUpperCase() : num(h, 4) > 0.5 ? word.toUpperCase() : word.toLowerCase()}</text>${step > 1 ? `<text x="300" y="480" text-anchor="middle" font-family="${SANS}" font-size="15" letter-spacing="4" fill="${p.ink}" opacity=".6">${"HANDMADE CERAMICS"}</text>` : ""}</svg>`;
}

function page(h, { title, line, step }) {
  const p = PALETTES[Math.floor(num(h, 0) * PALETTES.length)];
  const left = num(h, 1) > 0.5, big = 54 + Math.floor(num(h, 2) * 3) * 10;
  const words = title.split(" "), half = Math.ceil(words.length / 2);
  const tx = left ? 80 : 620, ix = left ? 660 : 80;
  const cards = [0, 1, 2].map((i) => `<rect x="${80 + i * 356}" y="560" width="328" height="170" rx="${step ? 14 : 0}" fill="${i === 1 ? p.b : p.ink}" opacity="${i === 1 ? 1 : 0.08}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780"><rect width="1200" height="780" fill="${p.bg}"/>
<circle cx="96" cy="52" r="14" fill="${p.a}"/><rect x="900" y="46" width="60" height="10" rx="5" fill="${p.ink}" opacity=".5"/><rect x="980" y="46" width="60" height="10" rx="5" fill="${p.ink}" opacity=".5"/><rect x="1060" y="36" width="76" height="30" rx="15" fill="${p.ink}"/>
<text font-family="${step > 1 ? SERIF : SANS}" font-size="${big}" font-weight="${step > 1 ? 400 : 700}" fill="${p.ink}"><tspan x="${tx}" y="230">${words.slice(0, half).join(" ")}</tspan><tspan x="${tx}" y="${230 + big * 1.12}">${words.slice(half).join(" ")}</tspan></text>
<text x="${tx}" y="${250 + big * 2.1}" font-family="${SANS}" font-size="20" fill="${p.ink}" opacity=".7">${line}</text>
<rect x="${tx}" y="${280 + big * 2.1}" width="170" height="48" rx="${step ? 24 : 4}" fill="${p.a}"/>
<rect x="${ix}" y="130" width="460" height="360" rx="${step ? 20 : 0}" fill="${p.b}"/><circle cx="${ix + 150 + num(h, 3) * 160}" cy="${250 + num(h, 4) * 100}" r="${70 + num(h, 5) * 50}" fill="${p.a}" opacity=".85"/>${cards}</svg>`;
}

function phone(h, { title, big, step }) {
  const p = PALETTES[Math.floor(num(h, 0) * PALETTES.length)];
  const ring = num(h, 1) > 0.45, done = 0.35 + num(h, 2) * 0.5;
  const rows = [0, 1, 2].map((i) => `<rect x="24" y="${540 + i * 86}" width="342" height="70" rx="${step ? 18 : 6}" fill="${p.ink}" opacity=".07"/><circle cx="62" cy="${575 + i * 86}" r="16" fill="${i === 0 ? p.a : p.b}"/><rect x="92" y="${562 + i * 86}" width="${120 + num(h, 3 + i) * 110}" height="10" rx="5" fill="${p.ink}" opacity=".7"/><rect x="92" y="${582 + i * 86}" width="80" height="8" rx="4" fill="${p.ink}" opacity=".3"/>`).join("");
  const hero = ring
    ? `<circle cx="195" cy="300" r="118" fill="none" stroke="${p.b}" stroke-width="22"/><circle cx="195" cy="300" r="118" fill="none" stroke="${p.a}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${done * 741} 741" transform="rotate(-90 195 300)"/><text x="195" y="318" text-anchor="middle" font-family="${SANS}" font-size="54" font-weight="700" fill="${p.ink}">${big}</text>`
    : `<rect x="24" y="170" width="342" height="250" rx="${step ? 28 : 8}" fill="${p.a}"/><text x="48" y="330" font-family="${step > 1 ? SERIF : SANS}" font-size="84" font-weight="700" fill="${p.bg}">${big}</text><text x="48" y="376" font-family="${SANS}" font-size="18" fill="${p.bg}" opacity=".8">this week</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844"><rect width="390" height="844" rx="46" fill="${p.bg}"/><text x="24" y="104" font-family="${step > 1 ? SERIF : SANS}" font-size="32" font-weight="${step > 1 ? 400 : 700}" fill="${p.ink}">${title}</text><circle cx="342" cy="92" r="20" fill="${p.b}"/>${hero}<text x="24" y="512" font-family="${SANS}" font-size="15" letter-spacing="2" fill="${p.ink}" opacity=".5">RECENT</text>${rows}<rect x="130" y="822" width="130" height="5" rx="3" fill="${p.ink}" opacity=".4"/></svg>`;
}

function poster(h, { word, line, step }) {
  const p = PALETTES[Math.floor(num(h, 0) * PALETTES.length)];
  const stack = num(h, 1) > 0.5, size = 150 + Math.floor(num(h, 2) * 3) * 26;
  const shapes = [0, 1, 2].map((i) => num(h, 3 + i) > 0.5
    ? `<circle cx="${160 + i * 240}" cy="${760 + num(h, 6 + i) * 120}" r="${70 + num(h, 4 + i) * 60}" fill="${i === 1 ? p.a : p.b}"/>`
    : `<rect x="${90 + i * 230}" y="${700 + num(h, 6 + i) * 110}" width="${130 + num(h, 4 + i) * 90}" height="${130 + num(h, 5 + i) * 90}" fill="${i === 1 ? p.a : p.b}" transform="rotate(${(num(h, 7) - 0.5) * 24} ${200 + i * 230} 780)"/>`).join("");
  const type = stack
    ? word.split("").map((c, i) => `<text x="${70 + (i % 3) * 230}" y="${200 + Math.floor(i / 3) * size}" font-family="${SANS}" font-size="${size}" font-weight="700" fill="${p.ink}">${c}</text>`).join("")
    : `<text x="60" y="${190 + size * 0.4}" font-family="${step > 1 ? SERIF : SANS}" font-size="${size}" font-weight="700" fill="${p.ink}" textLength="680" lengthAdjust="spacingAndGlyphs">${word}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="${p.bg}"/>${shapes}${type}<text x="60" y="1040" font-family="${SANS}" font-size="24" letter-spacing="3" fill="${p.ink}">${line}</text></svg>`;
}

const DRAW = { logo, page, phone, poster };
const SIZE = { logo: [600, 600], page: [1200, 780], phone: [390, 844], poster: [800, 1100] };

/** The drawing for one sample screen, or null. */
export function demoPicture(hash) {
  const spec = pictures.get(hash);
  return spec ? DRAW[spec.kind](hash, spec) : null;
}

// ---- the sample chats ------------------------------------------------------------------------
// each round: how many screens the session made, where they came from, and what was said next
const WORK = [
  { name: "Kiln pottery studio", chats: [
    { title: "Logo for the studio", days: 9, kind: "logo", spec: { word: "Kiln" }, src: "Paper",
      brief: "I need a logo for a small pottery studio called Kiln. Warm, handmade, not hipster.",
      rounds: [
        [4, "these look like a bank. too corporate, make it feel handmade", true],
        [5, "better. I like the second one, try it with a rounder letter"],
        [3, "no, the round one lost its character. go back to the arch"],
        [4, "yes, the arch. now show it small, like a stamp on the bottom of a cup"],
        [3, "the stamp works. keep the lower case one"],
        [2],
      ] },
    { title: "Shop homepage", days: 7, kind: "page", spec: { title: "Cups and bowls fired on Sundays", line: "Small batches. Open studio every weekend." }, src: "Browser",
      brief: "now a one page site for the studio. hero, three products, opening hours",
      rounds: [
        [3, "the hero is too loud, the cups should be the loud part"],
        [4, "closer. try the picture on the left, and a serif for the headline"],
        [3, "not this green. it reads like a pharmacy", true],
        [4, "this one. make the button the clay colour"],
        [2],
      ] },
  ] },
  { name: "Loop run club", chats: [
    { title: "Weekly distance screen", days: 5, kind: "phone", spec: { title: "This week", big: "23 km" }, src: "Simulator",
      brief: "build the home screen for a run club app. the one number that matters is distance this week",
      rounds: [
        [3, "too many numbers. one big number, everything else small"],
        [4, "I don't like the ring, it looks like every fitness app", true],
        [5, "yes, the card. try it darker for early morning runs"],
        [3, "the dark one is hard to read outside. go back to light and keep the big number"],
        [3],
      ] },
    { title: "Race day poster", days: 3, kind: "poster", spec: { word: "LOOP10", line: "SUNDAY 6 AM · RIVERSIDE · 10 KM" }, src: "Paper",
      brief: "poster for our first 10k. loud, type led, three colours at most",
      rounds: [
        [4, "love the stacked letters. more room at the bottom for the details"],
        [3, "the shapes fight the type. fewer of them", true],
        [3],
      ] },
  ] },
  { name: "Sunday zine", chats: [
    { title: "Issue 4 cover", days: 2, kind: "poster", spec: { word: "SUNDAY", line: "ISSUE 04 · SLOW MORNINGS" }, src: "Paper",
      brief: "cover for issue 4 of the zine. theme is slow mornings",
      rounds: [
        [5, "too busy for a slow morning. calmer"],
        [4, "this is the calm I wanted. try the title in a serif"],
        [3, "no, the serif makes it look like a bank newsletter. back to the bold one", true],
        [2],
      ] },
    { title: "Subscribe page", days: 1, kind: "page", spec: { title: "A small zine for slow mornings", line: "Four issues a year, in the post." }, src: "Browser",
      brief: "a tiny page where people can subscribe to the zine",
      rounds: [
        [3, "nice. the picture can be smaller, the words matter more here"],
        [3],
      ] },
  ] },
];

/** The sample board, in the same shape the real one has. It always ends about now. */
export function demoBoard() {
  pictures.clear();
  const now = Date.now();
  let total = 0, rejected = 0, standing = 0, chats = 0;
  const plots = WORK.map((w) => {
    const plot = { key: w.name, name: w.name, chats: [], screens: 0, rejected: 0 };
    for (const c of w.chats) {
      const events = [];
      let at = now - c.days * 864e5 + 9.5 * 36e5;
      c.rounds.forEach(([n, said, no], r) => {
        let last = null;
        for (let i = 0; i < n; i++) {
          at += 90e3 + i * 20e3;
          const hash = id(`${w.name}/${c.title}/${r}/${i}`);
          pictures.set(hash, { kind: c.kind, step: Math.min(r, 3), ...c.spec });
          last = { t: "i", at, hash, ext: "svg", w: SIZE[c.kind][0], h: SIZE[c.kind][1], src: c.src };
          events.push(last);
        }
        if (said) {
          at += 4 * 60e3;
          if (no) { last.no = true; rejected++; plot.rejected++; }
          events.push({ t: "s", at, text: said, ...(no && { no: true }) });
          at += 3 * 60e3;
        } else { last.alive = true; standing++; }
      });
      const n = events.filter((e) => e.t === "i").length;
      total += n; plot.screens += n; chats++;
      plot.chats.push({ id: id(`${w.name}/${c.title}`), title: c.title, start: events[0].at, end: events[events.length - 1].at, screens: n, gone: false, brief: c.brief, events });
    }
    plot.chats.sort((a, b) => b.end - a.end);
    return plot;
  });
  return { builtAt: now, demo: true, total, rejected, standing, chats, plots };
}
