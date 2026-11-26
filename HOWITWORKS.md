# How Iterations works

## Files
- `bin/iterations.mjs`: the command and the server (127.0.0.1:4798; the demo on 4799). Makes
  the small copies. Sets the rules that keep every load on this Mac.
- `src/chats.mjs`: reads every transcript and builds each chat's trail (`digAll`), keeps sent
  files and published pages, and holds the word rule (`readsAsNo`).
- `src/demo.mjs`: the sample board and its drawings. Imports nothing that reads the Mac; in
  `--demo` the command never loads `chats.mjs`.
- `src/canvas.html`: the board, one file, no build step, no dependencies.
- `src/fonts`: Geist and Geist Serif, and Caveat for everything handwritten (all SIL OFL). Served
  at `/fonts/`; nothing is fetched from Google.
- `scripts/audit.mjs`: looks for keys, home paths, emails and files that shouldn't ship.

## Where the data comes from
- `~/.claude/projects/*/<session>.jsonl`: every transcript. Pictures are inside tool results and
  pasted messages as base64. Tool names say where a picture came from (Paper, Browser,
  Simulator, Screen, File, Pencil); Mobbin and Refs results are skipped.
- `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json`: the desktop app's
  record of each chat, for its title, its folder and which sessions belong to it.
- Files a chat sent you (`SendUserFile`) and pages it published (`Artifact`): read from disk the
  first time the transcript line that sent them is read, if they are still there, and copied in.
  A page's text is followed through the session's own Write and Edit calls, so each published
  version is kept as it was, even when the file has changed since. Nothing from any other app.

## What Iterations keeps (`~/.iterations`)
- `chats/<session>.json`: one record per transcript: each picture's time, hash, size, source and
  where its line is (file, byte offset, length, which picture in the line), and each prompt.
  A transcript that grew is read on from where the last read stopped. A record whose
  transcript is gone is kept, so the chat stays on the canvas. It also keeps the text of the
  last 40 pages being written, to follow their edits on the next read.
- `files/<hash>.<ext>`: each image file a chat sent you, as it was.
- `pages/<hash>.html`: each version of each page a chat published.
- `thumb/<hash>.jpg`: a 420 px copy of each picture, made by `sips` in the background after
  start. The full picture is never copied: it is read back out of its transcript line, and when
  the transcript is gone the small copy is what's left.

## A chat's trail
Per chat (a desktop thread, however many sessions it ran through; a forked chat's copied rows
count once): prompts and pictures sorted by time. A prompt is kept only when a session-made
picture came since the last prompt, and sits right after those pictures. If it reads as a no
(`readsAsNo`, a word list on the first 260 characters), the last picture before it is marked
turned down. The last session-made picture of the chat is "still standing". Pictures you pasted
are part of the trail but never judged. A picture seen twice in a chat shows once.

Projects come from the folder's name; a worktree
counts as its repo and a folder the app made for one session is "No folder".

## The canvas
- The window: a source list of projects (click to fly there), the Everything / By date control,
  a toolbar (where you are, zoom), the days along the bottom, and an inspector when a screen is
  open. Fonts come from `src/fonts`, served at `/fonts/`.
- Everything: every project closed (`cover`): its name and what stood at the end of each chat.
  Clicking one sets `focus`, and then only that project is built, each chat whole. By date: only
  that day's part of each chat, every project open unless one is in focus.
- With one project open, chats off screen aren't drawn (`content-visibility: auto`).
- A chat is cut into rounds by `beatsOf`: the screens the session made, closed by the next thing
  you typed. A round shows `SHOWN` (8) screens, kept and turned-down ones first; "+ N more"
  opens it and the projects are laid out again.
- Every lean, drop, margin, tape and highlighter colour comes from the picture's hash or the
  chat's id, so the board looks the same each time.
- `place()` puts the title at the top left and the projects on uneven shelves under it.
  `home()` opens the board at 24 percent or more; the percentage button fits the width.
- Moving: wheel pans, pinch or cmd-wheel zooms, drag pans, 0 fits.

## The window
`iterations` opens `--app=<url>` in Chrome, Brave or Edge when one is installed, which gives a
window with no tabs or address bar. Otherwise, or with `--browser`, the default browser.

## The server
The board page is sent with a content security policy that allows loads from this Mac only
(`BOARD_RULES`); an old published page gets a sandbox and no network (`PAGE_RULES`).
GET only, answers only to localhost by name. `/t/<hash>` is a small copy, `/f/<hash>` the full picture, `/api/hello` lets a second `iterations` find the first. `/api/board` is the data. Page versions are served with a sandbox policy so a
buried page cannot read the canvas. `/api/graves?again` digs again.

## Verify
`node bin/iterations.mjs --json | head` prints the dig; `node bin/iterations.mjs` opens the canvas.
