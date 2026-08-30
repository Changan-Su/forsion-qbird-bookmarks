---
name: 青鸟链接收藏
description: Use when the user shares a link they want KEPT — an article, blog post, doc page, thread, paper or repo — and asks to save, collect, summarize or file it ("存一下", "收藏这个", "整理进笔记", "save this", "add this to my notes"). Fetches the page, writes a structured Markdown note into the user's Amadeus vault under `Links/`, and hands video-platform links to the Bluebird workbench instead. NOT for links that are incidental context in some other task.
version: 1.0.0
category: 内容分析
---

# 青鸟链接收藏 — a shared link becomes a note

The user found something worth keeping and pasted it at you. Turn it into a note in their vault:
fetch → condense → file → tell them where it landed. One round trip, no ceremony.

> Companion skill: 青鸟视频分析 handles video links (transcription). This one handles everything else.

## Fire on intent, not on the presence of a URL

You may be running unattended. A skill that files every URL it sees fills the vault with garbage,
and garbage in a note vault is worse than a missing note — it poisons search.

**File it** when the user's intent is to keep the thing: they paste a link with "存一下" / "收藏" /
"整理进笔记" / "看看这个然后记下来", or they paste a bare link into a chat that is otherwise about
collecting reading material.

**Leave it alone** when the link is working material rather than a keepsake:

- a repo / issue / stack-trace / docs link inside a coding or debugging question — they want the answer, not a note;
- URLs sitting inside pasted logs, error messages, config files or code;
- a link you are being asked to *act on* (log in here, download this, call this endpoint);
- links you dug up yourself with `web_search` while researching an answer.

**Ambiguous** (a bare link, no verb, no surrounding topic) → ask one short question and wait, unless
the switch below is on. Do not write a note just to be helpful. Several links in one message →
confirm the list once, then work through them one at a time.

## Enhanced auto mode — check the switch before you ask

The Bluebird plugin has a setting, **增强自动模式 / Enhanced auto mode**, meaning "a link on its own is
intent enough, stop asking me". Plugin settings live in the desktop app where you cannot see them, so
the plugin mirrors this one switch into the vault as a small file.

- **Only when your Amadeus section shows a *local* vault**, and only at the moment you would otherwise
  ask: `read_file` `<vault root>/.bluebird/link-mode.json`. `{"autoSave": true}` → don't ask, just
  fetch and file it, and say in one line where it landed.
- Missing file, unreadable file, anything but `true` → default mode, ask. Don't retry, don't go
  looking for the file elsewhere, don't mention its existence to the user.
- Cloud vault → there is no plugin and no file, so always default mode. Never reach for it with
  `amadeus_read_note`: it is JSON, not a note.
- The switch flips **only** the bare-link question. It does not touch the "leave it alone" list above —
  a link inside a coding question is still a coding question in enhanced mode, and multiple links at
  once still get one confirmation.

## Routing by link type

| Link | What to do |
|---|---|
| Bilibili / YouTube / 抖音 / 小红书 and other video pages | Do **not** try to summarize the video page's HTML — it has no content. These need a transcript (yt-dlp plus the host's own speech recognition). Route in this order: **①** 青鸟视频分析 is in your current skill list (i.e. you are the Bluebird agent) → `use_skill` it and follow it instead of this skill. **②** You have the `delegate` tool and your Amadeus section shows a **local** vault → delegate to the Bluebird agent: `delegate` with `agentSlug: "bluebird"`, task = the URL verbatim + "transcribe and summarize this video, then save the note yourself with write_file as `<vault root>/videos/{YYYY-MM-DD}-{title}.md` (create the folder if needed) and report the saved path" — include the actual vault root from your Amadeus section in the task. Relay the note path (or its honest failure: no subtitles and no transcription available → offer ③). Notes saved this way do not appear in the Bluebird workbench sidebar — that index lists only what the workbench itself analyzed. **③** Otherwise (no delegate, cloud vault, or ② failed) → tell the user to open the workbench from the command palette (「青鸟收藏夹:打开」) and paste the link there; it queues, shows progress and files the note itself. |
| Article, blog post, doc page, paper, thread, release notes, repo README | `web_fetch` the URL, then write the note below. |
| Page you cannot reach (paywall, login wall, JS-only shell, 403, dead link) | Say what happened and stop. Never write a note from the title and your own priors — an invented summary is indistinguishable from a real one three months later. Offer the outs: paste the text directly, or (if you have browser tools on this machine) `browser_navigate` + `browser_snapshot`. |

## The note

Path `Links/{YYYY-MM-DD}-{title}.md` inside the vault (`get_datetime` for today; strip characters
that are illegal in filenames; keep the title under ~80 chars). **How to write it depends on the
vault, and your Amadeus prompt section already says which you have** — a local vault is a real
directory (ordinary file tools at `<vault root>/Links/…`), a cloud vault goes through
`amadeus_write_note`. Do not invent a path; if no Amadeus section is present, there is no vault
here — say so instead of dropping the note in the working directory.

```markdown
---
source: <the URL, verbatim>
author: <if the page states one>
captured: YYYY-MM-DD
tags: [3-6 tags]
---

# <title>

> <why the user is keeping this — their own words if they gave a reason>

## 要点
- …

## 细节
…
```

Rules that keep the note worth having:

- **Write in the language the user is speaking**, whatever the source's language is.
- **Condense, don't mirror.** A few verbatim lines at most; the rest in your own words. The vault is
  a personal note, not a copy of the web.
- **Cover the actual argument** — what it claims and what it rests on — not the page's table of contents.
- **Numbers, prices, versions, dates, names: copy them exactly.** Never round or "clean up".
- **The user's reason for saving goes at the top.** That sentence is what they will search for later.
- **Omit what you could not get.** No guessed author, no guessed publication date.

## Before you write, and after

- Check for a duplicate first: `amadeus_list_notes` with a distinctive word from the title. If a note
  for the same URL is already there, add to it (a new dated line, a fresh section) rather than
  creating a near-twin.
- When done, report the note path in one line. Do not paste the whole note back into the chat —
  they can open it.
- These notes are ordinary Markdown in the vault; they do **not** show up in the Bluebird sidebar,
  which lists only what the workbench itself analyzed. Don't touch that index.

## 交付前自查

- [ ] Intent really was "keep this" — not a link that happened to be in the message.
- [ ] Every claim in the note came from the fetched page; a failed fetch was reported, not papered over.
- [ ] Numbers and quotes verbatim; no invented author/date/field.
- [ ] Note is in the vault (not the working directory) and the user got the path.
