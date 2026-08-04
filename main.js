/**
 * 青鸟收藏夹 —— Forsion 桌面插件(裸 setup(ctx) 体,宿主 new Function('ctx', code) 装载)。
 *
 * 两个 LCL 视图(由 space.json 组合成工作台:library 侧栏 + folder 主区):
 *   plugin:bluebird:library —— 收藏夹:文件夹 + 历史 + 搜索(数据存 vault 索引,不依赖外部后端)。
 *   plugin:bluebird:folder  —— 分析/详情:贴链接→驱动 Tangu 抓字幕+出总结;播放器 + 总结/字幕标签 + 问答 + 导出。
 *
 * 视觉:照搬原版青鸟的 **QBird 设计系统**(青色渐变毛玻璃 + .ui-* 组件,3 主题×2 模式),
 *   作用域全在 .bb-root,默认 qbird、跟随宿主深浅;token 由 THEMES 注入成 --bb-* 变量。
 *
 * 引擎接入(同 desktop/frontend/src/services/agentRunService.ts):POST /agent/runs(execMode:host,
 *   agentSlug:bluebird)+ SSE /events(累积 token.delta、done.content);token 取 window.tangu.getConfig()。
 * 安全:Agent 产出的 Markdown 一律走自建 renderMarkdown(只 createElement+textContent,绝不 innerHTML 不可信)。
 */
const PLUGIN_ID = 'bluebird'
const AGENT_SLUG = 'bluebird'
const APP_ID = 'tangu'
const TEMPLATES = ['通用', '学术', '访谈', '播客', '会议', '新闻', '教程', 'Vlog', '旅行', '测评']
const DETAILS = { brief: '简洁', standard: '标准', detailed: '详细' }

ctx.registerSetting({ key: 'defaultTemplate', label: '默认总结模板', type: 'text', default: '通用', description: '通用/学术/访谈/播客/会议/新闻/教程/Vlog/旅行/测评' })
ctx.registerSetting({ key: 'detail', label: '默认详细程度(brief/standard/detailed)', type: 'text', default: 'standard', description: '简洁/标准/详细' })
// 存储文件夹改用宿主标准「工作文件夹」设置(1.3.0 起,每个插件自动就有,默认=插件名「青鸟收藏夹」)。
// 1.2.x 自定义过 saveFolder 的一次性迁移成 workFolder,此后单一真源;旧键删除。
try {
  const o = localStorage.getItem(`plugin.${PLUGIN_ID}.saveFolder`)
  if (o && !localStorage.getItem(`plugin.${PLUGIN_ID}.workFolder`)) localStorage.setItem(`plugin.${PLUGIN_ID}.workFolder`, o)
  if (o) localStorage.removeItem(`plugin.${PLUGIN_ID}.saveFolder`)
} catch { /* ignore */ }

// ── 纯函数(经文末 __BLUEBIRD_TEST__ 暴露给 check.mjs) ────────────────────────

const getSetting = (k, d) => { try { return localStorage.getItem(`plugin.${PLUGIN_ID}.${k}`) || d } catch { return d } }
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const esc = (s) => String(s == null ? '' : s)

function safeHref(u) {
  const s = String(u || '').trim()
  return /^(https?:\/\/|#|mailto:)/i.test(s) ? s : ''
}

/** [MM:SS] / [HH:MM:SS] → 秒。 */
function parseTs(str) {
  const p = String(str).split(':').map((n) => parseInt(n, 10))
  if (p.some((n) => Number.isNaN(n))) return null
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}
function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

/** 平台识别 + 可嵌入播放器地址(宿主 CSP frame-src 放行 youtube-nocookie 与 player.bilibili.com,
 *  故 YouTube / Bilibili 可内嵌,照原版 video-player;seek(t>0)带 autoplay=1,点时间戳即跳即播)。 */
function parsePlatform(url) {
  const u = String(url || '')
  let m
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/))) {
    const id = m[1]
    return { platform: 'youtube', videoId: id, embed: (t) => `https://www.youtube-nocookie.com/embed/${id}?rel=0${t ? `&start=${Math.floor(t)}&autoplay=1` : ''}` }
  }
  if ((m = u.match(/bilibili\.com\/video\/(BV[\w]+)/i)) || (m = u.match(/\b(BV[\w]{10})\b/))) {
    const id = m[1]
    return { platform: 'bilibili', videoId: id, embed: (t) => `https://player.bilibili.com/player.html?bvid=${id}&page=1&high_quality=1&controls=1${t ? `&t=${Math.floor(t)}&autoplay=1` : '&autoplay=0'}` }
  }
  if (/xiaohongshu\.com|xhslink/.test(u)) return { platform: 'xiaohongshu', videoId: '', embed: null }
  if (/douyin\.com/.test(u)) return { platform: 'douyin', videoId: '', embed: null }
  if (/github\.com/.test(u)) return { platform: 'github', videoId: '', embed: null }
  return { platform: '', videoId: '', embed: null }
}
const PLATFORM_META = {
  youtube: { label: 'YouTube', badge: 'pink' }, bilibili: { label: 'Bilibili', badge: 'b' },
  xiaohongshu: { label: '小红书', badge: 'pink' }, douyin: { label: '抖音', badge: 'slate' },
  github: { label: 'GitHub', badge: 'slate' }, '': { label: '视频', badge: 'slate' },
}

const SUPPORTED = /(?:youtu\.?be|youtube\.com|bilibili\.com|b23\.tv|xiaohongshu\.com|xhslink\.com|douyin\.com|github\.com)/i
/** 从分享文本里抠出第一条支持的链接(粘一整段分享文案也能识别)。 */
function extractUrl(text) {
  const m = String(text || '').match(new RegExp(`https?:\\/\\/[^\\s]*${SUPPORTED.source}[^\\s]*`, 'i'))
  return m ? m[0] : String(text || '').trim()
}
const isSupported = (url) => SUPPORTED.test(String(url || ''))

/** 拆 Agent 产出:剥掉给插件用的 ```json bluebird 数据块,剩下=给用户看的干净总结。 */
function parseAgentOutput(text) {
  const raw = String(text || '')
  const re = /```(?:json)?\s*bluebird\s*\n([\s\S]*?)```/i
  const m = raw.match(re)
  let data = null
  if (m) { try { data = JSON.parse(m[1].trim()) } catch { data = null } }
  const summary = raw.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
  return { summary, data }
}

function deriveTitle(md) {
  const m = /^#{1,6}\s+(.+)$/m.exec(String(md || ''))
  const first = m ? m[1] : (String(md || '').split('\n').find((l) => l.trim()) || '视频总结')
  return first.replace(/[*`#>\[\]()]/g, '').trim().slice(0, 60) || '视频总结'
}
function sanitizeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '视频总结'
}
function today() {
  const d = new Date(Date.now())
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── 导出(客户端,照搬原版 subtitle-export 语义) ──
function srtTime(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(ss)},${p(ms, 3)}`
}
function toSRT(segs) {
  return (segs || []).map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n')
}
function toTXT(segs, withTs) {
  return (segs || []).map((s) => (withTs ? `[${fmtTime(s.start)}] ` : '') + s.text).join('\n')
}
function toObsidian(meta, summary, sourceUrl) {
  const m = meta || {}
  const fm = ['---', `title: ${JSON.stringify(m.title || '视频总结')}`, `platform: ${m.platform || ''}`,
    `author: ${JSON.stringify(m.author || '')}`, `source: ${sourceUrl || m.videoUrl || ''}`, `date: ${today()}`, '---', ''].join('\n')
  return fm + '\n' + String(summary || '')
}

// ── 行内 / 块 Markdown → 安全 DOM(只 createElement+textContent;[MM:SS] 可点跳转) ──
function inline(text, onSeek) {
  const frag = document.createDocumentFragment()
  let rest = String(text == null ? '' : text)
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\[(\d{1,2}:\d{2}(?::\d{2})?)\]|\*([^*\n]+)\*|_([^_\n]+)_/
  let m
  while ((m = re.exec(rest))) {
    if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)))
    if (m[1] != null) { const b = document.createElement('strong'); b.textContent = m[1]; frag.appendChild(b) }
    else if (m[2] != null) { const c = document.createElement('code'); c.textContent = m[2]; frag.appendChild(c) }
    else if (m[3] != null) {
      const a = document.createElement('a'); a.textContent = m[3]
      const href = safeHref(m[4]); if (href) { a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') }
      frag.appendChild(a)
    } else if (m[5] != null) {
      const sec = parseTs(m[5])
      if (onSeek && sec != null) { const t = document.createElement('span'); t.className = 'bb-ts'; t.textContent = `[${m[5]}]`; t.addEventListener('click', () => onSeek(sec)); frag.appendChild(t) }
      else frag.appendChild(document.createTextNode(`[${m[5]}]`))
    } else if (m[6] != null) { const e = document.createElement('em'); e.textContent = m[6]; frag.appendChild(e) }
    else if (m[7] != null) { const e = document.createElement('em'); e.textContent = m[7]; frag.appendChild(e) }
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) frag.appendChild(document.createTextNode(rest))
  return frag
}
function renderMarkdown(container, md, onSeek) {
  container.textContent = ''
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n')
  let i = 0, para = [], list = null, listTag = null
  const flushPara = () => { if (para.length) { const p = document.createElement('p'); p.appendChild(inline(para.join(' '), onSeek)); container.appendChild(p); para = [] } }
  const flushList = () => { if (list) { container.appendChild(list); list = null; listTag = null } }
  while (i < lines.length) {
    const t = lines[i].replace(/\s+$/, '').trim()
    if (/^```/.test(t)) {
      flushPara(); flushList()
      const buf = []; i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      i++
      const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = buf.join('\n'); pre.appendChild(code); container.appendChild(pre); continue
    }
    if (t === '') { flushPara(); flushList(); i++; continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) { flushPara(); flushList(); const el = document.createElement('h' + Math.min(4, h[1].length)); el.appendChild(inline(h[2], onSeek)); container.appendChild(el); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); flushList(); container.appendChild(document.createElement('hr')); i++; continue }
    if (/^>\s?/.test(t)) { flushPara(); flushList(); const bq = document.createElement('blockquote'); bq.appendChild(inline(t.replace(/^>\s?/, ''), onSeek)); container.appendChild(bq); i++; continue }
    const ul = /^[-*]\s+(.*)$/.exec(t), ol = /^\d+\.\s+(.*)$/.exec(t)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      if (list && listTag !== want) flushList()
      if (!list) { list = document.createElement(want); listTag = want }
      const li = document.createElement('li'); li.appendChild(inline(ul ? ul[1] : ol[1], onSeek)); list.appendChild(li); i++; continue
    }
    flushList(); para.push(t); i++
  }
  flushPara(); flushList()
}

// ── 引擎配置 + 驱动 run(累积 token 直播;execMode:host 让转录能 run_bash) ──
async function getCfg() {
  try {
    const c = await (globalThis.window && window.tangu && window.tangu.getConfig ? window.tangu.getConfig() : null)
    if (c && c.backendUrl) return { backendUrl: c.backendUrl, token: c.token || '', modelId: c.modelId || '', cwd: c.defaultWorkspaceDir || c.homeDir || '' }
  } catch { /* web 回退 */ }
  try { return { backendUrl: location.origin + '/api', token: localStorage.getItem('forsion_token') || '', modelId: '', cwd: '' } } catch { /* ignore */ }
  return { backendUrl: '', token: '', modelId: '', cwd: '' }
}
/** 无字幕视频:音频交给 **Forsion 自己的语音链路**(设置 → 语音:本地 SenseVoice 离线 / 自带 key
 *  的 provider / Forsion 云)。插件不自带 ASR 供应商,也就不需要第二个 key。
 *  timestamps:true → 拿分段时间戳,字幕面板与 [MM:SS] 跳播放器才有得用;拿不到就只回文本(不编时间点)。 */
async function asrTranscribeFile(audioPath) {
  const t = globalThis.window && window.tangu
  if (!t || !t.transcribeAudioFile) throw new Error('当前环境没有 Forsion 语音识别桥(需桌面端)')
  const r = await t.transcribeAudioFile(audioPath, { timestamps: true })
  if (typeof r === 'string') return { text: r, segments: [] }
  return { text: (r && r.text) || '', segments: (r && r.segments) || [] }
}
/** 转录 → 喂给模型的文本(有时间戳就带上,让总结里的 [MM:SS] 有依据)。 */
const transcriptForPrompt = (asr) => (asr.segments.length
  ? asr.segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`).join('\n')
  : asr.text)

/** 引擎事件 → 进度阶段(百分比不是编的:status/tool_call/tool_result/token 都是真事件)。
 *  生成阶段没有总量可参照,按已产出字数往 92% 爬 —— 只保证单调、不假装精确。
 *  st = 队列五态里的过程态(照原版:提交/排队算 parsing,动手干活起算 transcribing)。 */
function stageOf(ev, content) {
  const p = ev.payload || {}
  if (ev.type === 'status') return p.state === 'queued' ? { pct: 10, label: '排队中', st: 'parsing' } : p.state === 'running' ? { pct: 16, label: '准备中', st: 'parsing' } : null
  if (ev.type === 'tool_call') return p.name === 'run_bash' ? { pct: 38, label: '抓取字幕 / 转录中', st: 'transcribing' } : { pct: 28, label: `调用 ${p.name || '工具'}`, st: 'transcribing' }
  if (ev.type === 'tool_result') return { pct: 58, label: '整理转录', st: 'transcribing' }
  if (ev.type === 'token') return { pct: Math.min(92, 68 + content.length / 120), label: '生成总结中', st: 'transcribing' }
  return null
}
/** 分析进度的阶段路标(详情页步骤条用):按已到百分比点亮。 */
const STEPS = [['提交', 6], ['排队', 10], ['转录', 38], ['总结', 68], ['保存', 96]]

async function runAgent(cfg, sessionId, message, onTick, signal, onStage) {
  const stage = (pct, label, st) => { if (onStage) onStage(pct, label, st) }
  stage(6, '提交任务', 'parsing')
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }
  const start = await fetch(`${cfg.backendUrl}/agent/runs`, {
    method: 'POST', headers: h, signal,
    body: JSON.stringify({ session_id: sessionId, model_id: cfg.modelId || undefined, app_id: APP_ID, message, attachments: [], agent_config: { agentSlug: AGENT_SLUG, execMode: 'host', cwd: cfg.cwd || undefined } }),
  })
  if (!start.ok) throw new Error((await start.text().catch(() => '')) || `起 run 失败 HTTP ${start.status}`)
  const { runId } = await start.json()
  if (!runId) throw new Error('引擎未返回 runId')
  const res = await fetch(`${cfg.backendUrl}/agent/runs/${encodeURIComponent(runId)}/events?fromSeq=0`, { headers: h, signal })
  if (!res.ok || !res.body) throw new Error(`订阅事件失败 HTTP ${res.status}`)
  const reader = res.body.getReader(), dec = new TextDecoder()
  let buf = '', lastSeq = 0, content = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n'); buf = parts.pop() || ''
    for (const line of parts) {
      const s = line.trim()
      if (!s || s.startsWith(':') || !s.startsWith('data:')) continue
      const data = s.slice(5).replace(/^ /, ''); if (!data) continue
      let ev; try { ev = JSON.parse(data) } catch { continue }
      if (typeof ev.seq === 'number') { if (ev.seq <= lastSeq) continue; lastSeq = ev.seq }
      if (ev.type === 'token') { const d = ev.payload && ev.payload.delta; if (d) { content += d; if (onTick) onTick(content) } }
      const st = stageOf(ev, content); if (st) stage(st.pct, st.label, st.st)
      if (ev.type === 'token') continue
      if (ev.type === 'done') { stage(100, '完成'); return (ev.payload && ev.payload.content) || content }
      if (ev.type === 'error') throw new Error((ev.payload && ev.payload.error) || '分析失败')
    }
  }
  throw new Error('与引擎的连接中断,未收到完成事件(可重试)')
}

// ── 收藏夹持久化:vault 索引 + 每条数据 sidecar(纯 ctx.app 文件读写,无外部后端) ──
// 工作文件夹 = 宿主标准约定(插件设置「工作文件夹」,默认=插件名);老宿主没有该 API 时退回 1.2.x 的 videos。
const LEGACY_ROOT = 'videos'
const folderRoot = () => (ctx.app.workFolder ? ctx.app.workFolder() : LEGACY_ROOT)
const indexPath = () => `${folderRoot()}/.bluebird-index.json`
const dataPath = (id) => `${folderRoot()}/.bluebird/${id}.json`
async function readIndexAt(root) {
  try { const t = await ctx.app.readFile(`${root}/.bluebird-index.json`); const j = t ? JSON.parse(t) : null; return j && Array.isArray(j.items) ? { folders: j.folders || [], items: j.items } : null }
  catch { return null }
}
async function readIndex() {
  const cur = await readIndexAt(folderRoot())
  if (cur && (cur.items.length || cur.folders.length)) return cur
  // 兜底读旧默认夹:升级/换文件夹后老收藏不失踪;下次保存时整份索引随写迁到新文件夹
  if (folderRoot() !== LEGACY_ROOT) { const old = await readIndexAt(LEGACY_ROOT); if (old) return old }
  return cur || { folders: [], items: [] }
}
const writeIndex = (idx) => ctx.app.writeFile(indexPath(), JSON.stringify(idx, null, 2))
async function saveEntry(full) {
  const id = full.id || uuid()
  const idx = await readIndex()
  const title = deriveTitle(full.summaryMarkdown)
  const notePath = `${folderRoot()}/${today()}-${sanitizeFileName(title)}.md`
  const header = `> 来源:${full.sourceUrl || (full.meta && full.meta.videoUrl) || ''}\n> 由「青鸟收藏夹」于 ${today()} 生成\n\n`
  await ctx.app.writeFile(notePath, header + full.summaryMarkdown)
  await ctx.app.writeFile(dataPath(id), JSON.stringify({ ...full, id, notePath, date: today(), generatedAt: full.generatedAt || new Date().toISOString() }))
  const m = full.meta || {}
  idx.items = [{ id, title, platform: m.platform || '', videoId: m.videoId || '', videoUrl: full.sourceUrl || m.videoUrl || '', folderId: full.folderId || null, date: today(), duration: m.duration || 0, author: m.author || '', thumbnail: m.thumbnail || '' }, ...idx.items.filter((it) => it.id !== id)]
  await writeIndex(idx)
  return { id, notePath }
}
const loadEntry = async (id) => {
  try {
    const t = (await ctx.app.readFile(dataPath(id))) || (folderRoot() !== LEGACY_ROOT ? await ctx.app.readFile(`${LEGACY_ROOT}/.bluebird/${id}.json`) : null)
    return t ? JSON.parse(t) : null
  } catch { return null }
}
/** 眼见为实:打开插件就把工作文件夹落进库(写空索引),不必等第一次保存才出现在文件树。 */
async function ensureWorkFolder() {
  try { if (!(await readIndexAt(folderRoot()))) await writeIndex({ folders: [], items: [] }) } catch { /* ignore */ }
}

// ── 跨视图小总线(library 点条目 → folder 视图打开;队列变更广播) ──
const bus = (() => { const subs = new Set(); return { on: (f) => (subs.add(f), () => subs.delete(f)), emit: (e) => subs.forEach((f) => { try { f(e) } catch { /* ignore */ } }) } })()
let pendingOpen = null // library 点击后暂存,folder 视图 mount/聚焦时消费

// ── 运行队列:照原版 analysis-queue-context 同构 ────────────────────────────
// 五态 pending/parsing/transcribing/completed/error;串行 FIFO;完成项不自动消失(手动移除/清除已完成)。
// 模块级 —— 关掉视图队列照跑,回来还在。比原版多一个「取消」(反正有 AbortController)。
const queue = { items: [], processing: false }
const qEmit = () => bus.emit({ type: 'queue' })
const qFind = (id) => queue.items.find((i) => i.id === id)
const qActive = () => queue.items.filter((i) => i.status === 'parsing' || i.status === 'transcribing')
function qAdd(url, tpl, detail) {
  const it = {
    id: uuid(), url, tpl, detail, plat: parsePlatform(url), sessionId: uuid(),
    status: 'pending', progress: 0, progressLabel: '排队中', error: '',
    title: '', summary: '', data: null, entryId: null, notePath: null, saveError: '',
    controller: null, startedAt: 0, endedAt: 0,
  }
  queue.items.push(it); qEmit(); qPump()
  return it
}
function qRemove(id) { const it = qFind(id); if (it && it.controller) it.controller.abort(); queue.items = queue.items.filter((i) => i.id !== id); qEmit() }
function qClearDone() { queue.items = queue.items.filter((i) => i.status !== 'completed'); qEmit() }
function qCancel(id) {
  const it = qFind(id); if (!it) return
  if (it.controller) it.controller.abort()
  else if (it.status === 'pending') { it.status = 'error'; it.error = '已取消'; qEmit() }
}
async function qPump() {
  if (queue.processing) return
  const it = queue.items.find((i) => i.status === 'pending')
  if (!it) return
  queue.processing = true
  try { await qRun(it) } finally { queue.processing = false; qPump() } // ponytail: 并发度=1 照原版串行;要并行再开多泵
}
const outSpec = (it) => `输出两部分:①给用户看的 Markdown 总结正文(不要寒暄、不要问是否保存;句中用 [MM:SS] 标时间戳)。②正文之后另起一行追加一个机器可读代码块(我会用来做播放器和字幕,不展示给用户;字幕很长时 segments 可只给前 200 条):
\`\`\`json bluebird
{"meta":{"title":"","platform":"${it.plat.platform}","videoId":"${it.plat.videoId}","videoUrl":"${it.url}","author":"","duration":0,"thumbnail":""},"segments":[{"start":0,"end":0,"text":""}],"chapters":[{"t":0,"title":""}],"tags":[]}
\`\`\``
const runEntry = (it) => ({ id: it.entryId, summaryMarkdown: it.summary, meta: (it.data && it.data.meta) || { platform: it.plat.platform, videoId: it.plat.videoId, videoUrl: it.url }, segments: (it.data && it.data.segments) || [], chapters: (it.data && it.data.chapters) || [], tags: (it.data && it.data.tags) || [], sourceUrl: it.url, folderId: null, tpl: it.tpl, detail: it.detail })
async function qRun(it) {
  const cfg = await getCfg()
  if (!cfg.backendUrl || !cfg.token) { Object.assign(it, { status: 'error', error: cfg.backendUrl ? '请先登录 Forsion' : '未连接到 Tangu 引擎' }); qEmit(); return }
  it.controller = new AbortController()
  Object.assign(it, { status: 'parsing', progress: 4, progressLabel: '提交任务', startedAt: Date.now() })
  qEmit()
  const onStage = (pct, label, st) => {
    it.progress = Math.max(it.progress, pct) // 单调不回退(ASR 接力会再来一轮 tool_call)
    if (label) it.progressLabel = label
    if (st && it.status !== 'completed' && it.status !== 'error') it.status = st
    qEmit()
  }
  const onTick = (full) => { const p = parseAgentOutput(full); it.summary = p.summary || full; bus.emit({ type: 'run-delta', id: it.id }) }
  const SPEC = outSpec(it)
  const msg = `请分析这个视频。按「青鸟视频分析」技能:host 模式 run_bash 跑 transcribe.py 抓转录,再产出结构化 Markdown 总结(模板:${it.tpl},详细度:${DETAILS[it.detail] || '标准'})。
${SPEC}
若脚本回的是 source:"needs_asr"(该视频没有字幕),**不要自己想办法转写**:直接只输出这一个代码块、不要总结正文——
\`\`\`json bluebird
{"needs_asr":true,"audio_path":"脚本给的路径","meta":{...脚本给的 meta...}}
\`\`\`
我会用 Forsion 自己的语音识别转好再回来找你。
视频链接:${it.url}`
  try {
    let out = await runAgent(cfg, it.sessionId, msg, onTick, it.controller.signal, onStage)
    let parsed = parseAgentOutput(out)
    // 无字幕 → 本机(或用户选的云)语音识别接力,转好再让同一会话出总结。
    if (parsed.data && parsed.data.needs_asr && parsed.data.audio_path) {
      onStage(45, '本机语音识别中', 'transcribing')
      const asr = await asrTranscribeFile(parsed.data.audio_path)
      if (!asr.text.trim()) throw new Error('语音识别没有识别出内容(检查「设置 → 语音」里选的模型)')
      onStage(62, '生成总结中', 'transcribing')
      const m2 = `这是该视频的语音转写${asr.segments.length ? '(行首 [MM:SS] 是真实时间戳,可直接引用)' : '(该识别通道未提供时间戳,正文里就别标 [MM:SS] 了)'}:
${transcriptForPrompt(asr)}

按上面的要求(模板:${it.tpl},详细度:${DETAILS[it.detail] || '标准'})产出总结。
${SPEC}`
      out = await runAgent(cfg, it.sessionId, m2, onTick, it.controller.signal, onStage)
      parsed = parseAgentOutput(out)
      // 时间戳以识别结果为准 —— 模型转述的分段不可信
      if (asr.segments.length) parsed.data = { ...(parsed.data || {}), segments: asr.segments }
    }
    it.summary = parsed.summary || out; it.data = parsed.data
    it.title = (parsed.data && parsed.data.meta && parsed.data.meta.title) || deriveTitle(it.summary)
    if (!it.plat.platform && parsed.data && parsed.data.meta) it.plat = parsePlatform(parsed.data.meta.videoUrl || it.url)
    ctx.activity && ctx.activity.log && ctx.activity.log('analyze', { url: it.url })
    // 总结即笔记:直接落工作文件夹(照原版「中途已落库」语义);保存失败不吞结果,仍可手动存/导出。
    if (it.summary.trim()) {
      onStage(96, '保存记录', 'transcribing')
      try {
        const r = await saveEntry(runEntry(it))
        it.entryId = r.id; it.notePath = r.notePath; bus.emit({ type: 'saved' })
      } catch (e) { it.saveError = (e && e.message) || String(e); say(`「${it.title}」已总结,但自动保存失败:${it.saveError}`, { level: 'warning' }) }
    }
    Object.assign(it, { status: 'completed', progress: 100, progressLabel: '完成', endedAt: Date.now() }); qEmit()
  } catch (e) {
    const aborted = it.controller && it.controller.signal.aborted
    Object.assign(it, { status: 'error', error: aborted ? '已取消' : ((e && e.message) || String(e)), endedAt: Date.now() }); qEmit()
    if (!aborted) say(`分析失败:${it.error}`, { level: 'error' })
  } finally { it.controller = null }
}

// ── 字数档位(照原版 DETAIL_LEVEL_CONFIG 的目标区间;字数=剥 Markdown 符号后的字符数) ──
const WORD_RANGES = { brief: [300, 800], standard: [700, 1800], detailed: [1500, 5000] }
const countWords = (md) => String(md || '').replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>\-|\s]/g, '').length
const wordState = (n, detail) => { const r = WORD_RANGES[detail]; if (!r || !n) return null; return n < r[0] ? '字数偏少' : n > r[1] ? '字数偏多' : '字数达标' }

// ── 平台图标:官方 favicon(照原版侧栏),加载失败退回文字徽标 ──
const PLATFORM_FAVICON = { youtube: 'https://www.youtube.com/favicon.ico', bilibili: 'https://www.bilibili.com/favicon.ico', xiaohongshu: 'https://www.xiaohongshu.com/favicon.ico', douyin: 'https://www.douyin.com/favicon.ico', github: 'https://github.com/favicon.ico' }
function platIcon(platform, size) {
  const u = PLATFORM_FAVICON[platform]
  if (!u) return badge(platform)
  const img = document.createElement('img'); img.src = u; img.width = size || 16; img.height = size || 16
  img.style.borderRadius = '4px'; img.style.flex = '0 0 auto'; img.alt = platform
  img.addEventListener('error', () => { try { img.replaceWith(badge(platform)) } catch { /* ignore */ } })
  return img
}

// ── 浮层容器:菜单/弹窗挂到它上面(不是裸 body)——否则拿不到 .bb-root 上的 --bb-*,按钮会白字透明底 ──
let _layer = null
function layer() {
  if (!globalThis.document || !document.body) return null
  if (_layer && _layer.isConnected) return _layer
  _layer = document.createElement('div'); _layer.className = 'bb-layer'
  document.body.appendChild(_layer)
  return _layer
}
const showMenu = (box) => (layer() || document.body).appendChild(box)

// ── 主题:跟随 LCL 宿主 —— 直接吃宿主 token(--bg/--text/--accent/--on-accent…),缺哪个才从计算样式派生 ──
let _probe = null
function parseColor(css) {
  const s = (css || '').trim(); if (!s) return null
  if (!_probe) { const c = document.createElement('canvas'); c.width = c.height = 1; _probe = c.getContext('2d', { willReadFrequently: true }) }
  if (!_probe) return null
  _probe.fillStyle = '#000000'; _probe.fillStyle = s; const a = _probe.fillStyle
  _probe.fillStyle = '#ffffff'; _probe.fillStyle = s; if (a === '#000000' && _probe.fillStyle === '#ffffff') return null
  _probe.clearRect(0, 0, 1, 1); _probe.fillRect(0, 0, 1, 1); const d = _probe.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3] / 255]
}
function opaqueBgOf(start) {
  for (let n = start; n; n = n.parentElement) { const c = parseColor(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.95) return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})` }
  return null
}
const relL = (c) => { const g = (v) => { const x = v / 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4) }; return .2126 * g(c[0]) + .7152 * g(c[1]) + .0722 * g(c[2]) }
const contrast = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
/** 强调色上的字色:白 / 近黑取对比度高的一方(宿主没给 --on-accent 时的兜底)。 */
const onColorOf = (accent) => (contrast(accent, [255, 255, 255]) >= contrast(accent, [22, 22, 26]) ? '#ffffff' : '#16161a')
/** 强调色当**前景**(链接/时间戳/选中态)用时,与底色对比不足就朝文字色掺,掺到 3:1 为止。 */
function readableOn(fg, bg, text, min = 3) {
  let c = [fg[0], fg[1], fg[2]]
  for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = c.map((v, k) => v + (text[k] - v) * .18)
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`
}
/** 铺出本插件全套 --bb-*(同时铺到浮层容器),自动跟随 LCL 深浅与配色。 */
function syncTheme(root) {
  const cs = getComputedStyle(root)
  const tok = (n) => (cs.getPropertyValue(n) || '').trim()
  const rgb = parseColor(tok('--text')) || parseColor(cs.color) || [40, 40, 40, 1]
  const dark = relL(rgb) > .5 // 前景偏亮 = 暗色主题
  const bgc = parseColor(tok('--bg')) || parseColor(opaqueBgOf(root.parentElement) || '') || (dark ? [23, 24, 28] : [255, 255, 255])
  const rd = (n) => Math.round(n)
  const f = (a) => `rgba(${rd(rgb[0])},${rd(rgb[1])},${rd(rgb[2])},${a})`
  const accent = tok('--accent') || tok('--am-accent') || (dark ? '#cfc9ff' : '#4C2585')
  const arc = parseColor(accent) || [76, 37, 133, 1]
  const af = (a) => `rgba(${rd(arc[0])},${rd(arc[1])},${rd(arc[2])},${a})`
  const targets = [root, layer()].filter(Boolean)
  const set = (k, v) => targets.forEach((t) => t.style.setProperty(`--bb-${k}`, v))
  targets.forEach((t) => { t.style.colorScheme = dark ? 'dark' : 'light' }) // 原生 select 弹层/滚动条跟着深浅走
  set('text', tok('--text') || `rgb(${rd(rgb[0])},${rd(rgb[1])},${rd(rgb[2])})`)
  set('text-sec', tok('--text-light') || f(.72)); set('text-muted', tok('--text-muted') || f(.5)); set('text-subtle', tok('--text-faint') || f(.32))
  set('bg', tok('--bg') || `rgb(${rd(bgc[0])},${rd(bgc[1])},${rd(bgc[2])})`)
  set('elev', tok('--bg-card') || tok('--bg') || `rgb(${rd(bgc[0])},${rd(bgc[1])},${rd(bgc[2])})`) // 浮层必须不透明
  set('surf', tok('--bg-card') || f(.045)); set('surf-sub', tok('--overlay-subtle') || f(.025))
  set('sidebar', tok('--sidebar-bg') || f(.03)); set('header', tok('--overlay-subtle') || f(.02)); set('input', tok('--overlay-light') || f(.05))
  set('hover', tok('--overlay-medium') || f(.08)); set('border', tok('--border') || f(.16))
  set('border-sub', tok('--overlay-medium') || f(.09)); set('border-hover', tok('--overlay-strong') || f(.32))
  // 强调色两种用法分开:**填充**用原色 + 宿主指定的字色(cream 暗色 accent 是纸白,写死 #fff 必然瞎);**前景**用对比校正过的
  set('fill', accent); set('fill-hover', tok('--accent-hover') || accent); set('on-fill', tok('--on-accent') || onColorOf(arc))
  set('primary', readableOn(arc, bgc, rgb)); set('glow', af(.22)); set('tint', tok('--accent-light') || af(.13))
  set('user-bg', tok('--user-bg') || af(.14)) // 用户气泡照宿主=淡染,不是实心强调色
  set('danger', tok('--danger') || (dark ? '#e08a7d' : '#b03a2e'))
  set('ai-bg', tok('--tool-bg') || f(.05)); set('ai-border', tok('--border') || f(.08))
  set('shadow', tok('--card-shadow') || (dark ? '0 4px 20px rgba(0,0,0,.4)' : '0 2px 12px rgba(0,0,0,.08)'))
  set('b-bg', f(.08)); set('b-fg', f(.62)); set('p-bg', f(.08)); set('p-fg', f(.62)); set('s-bg', f(.08)); set('s-fg', f(.6))
}

const STYLE = `
.bb-root{height:100%;min-height:0;display:flex;flex-direction:column;color:inherit;background:var(--bb-bg);font-size:13px;line-height:1.5}
.bb-root *{box-sizing:border-box}
.bb-root ::-webkit-scrollbar{width:6px;height:6px}.bb-root ::-webkit-scrollbar-thumb{background:var(--bb-border);border-radius:3px}
.bb-panel{border-radius:16px;background:var(--bb-surf);border:1px solid var(--bb-border);box-shadow:var(--bb-shadow);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%)}
.bb-input{width:100%;padding:9px 12px;font:inherit;color:var(--bb-text);background:var(--bb-input);border:1.5px solid var(--bb-border);border-radius:12px;outline:none;transition:border-color .2s,box-shadow .2s}
.bb-input::placeholder{color:var(--bb-text-subtle)}
.bb-input:focus{border-color:var(--bb-primary);box-shadow:0 0 0 3px var(--bb-glow)}
.bb-sel{padding:8px 10px;font:inherit;color:var(--bb-text);background:var(--bb-input);border:1.5px solid var(--bb-border);border-radius:12px;outline:none;cursor:pointer}
.bb-root option{background:var(--bb-elev);color:var(--bb-text)}
/* 三档照宿主 base.css:默认=卡片底+边框(≈.new-chat-btn),primary=实心强调色(≈.btn.primary,一屏最多一个),ghost=透明。
   别把默认档改成实心强调色 —— 宿主全站 background:var(--accent) 只用 3 处,满屏实心色块极其突兀。 */
.bb-btn{padding:7px 12px;font:inherit;color:var(--bb-text-sec);border:1px solid var(--bb-border);border-radius:12px;background:var(--bb-surf);cursor:pointer;transition:background .2s,border-color .2s,color .2s;white-space:nowrap}
.bb-btn:hover:not(:disabled){background:var(--bb-tint);border-color:var(--bb-primary);color:var(--bb-primary)}
.bb-btn:active:not(:disabled){transform:scale(.98)}
.bb-btn:disabled{opacity:.5;cursor:default}
.bb-btn.primary{color:var(--bb-on-fill);background:var(--bb-fill);border-color:transparent;font-weight:500}
.bb-btn.primary:hover:not(:disabled){background:var(--bb-fill-hover);color:var(--bb-on-fill);border-color:transparent}
.bb-btn.ghost{background:transparent;color:var(--bb-text-sec);border-color:transparent}
.bb-btn.ghost:hover:not(:disabled){background:var(--bb-hover);color:var(--bb-text);border-color:transparent}
.bb-btn.sm{padding:5px 10px;font-size:12px;border-radius:9px}
.bb-nav{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:12px;color:var(--bb-text-sec);cursor:pointer;transition:background .2s,transform .2s}
.bb-nav:hover{background:var(--bb-tint);transform:translateX(2px)}
.bb-nav.active{background:var(--bb-tint);color:var(--bb-primary)}
.bb-card{border-radius:14px;background:var(--bb-surf);border:1px solid var(--bb-border-sub);cursor:pointer;padding:9px 11px;transition:border-color .2s,background .2s,transform .2s,box-shadow .3s}
.bb-card:hover{border-color:var(--bb-primary);background:var(--bb-tint);transform:translateX(2px);box-shadow:0 2px 10px var(--bb-glow)}
.bb-card.active{border-color:var(--bb-primary);background:var(--bb-tint)}
.bb-badge{display:inline-block;font-size:10px;font-weight:600;padding:1px 8px;border-radius:9999px;white-space:nowrap}
.bb-badge.b{background:var(--bb-b-bg);color:var(--bb-b-fg)}.bb-badge.pink{background:var(--bb-p-bg);color:var(--bb-p-fg)}.bb-badge.slate{background:var(--bb-s-bg);color:var(--bb-s-fg)}
.bb-badge.primary{background:var(--bb-tint);color:var(--bb-primary)}
.bb-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bb-text-muted)}
.bb-muted{color:var(--bb-text-muted)}
.bb-ts{display:inline-flex;align-items:center;gap:2px;padding:0 5px;margin:0 1px;border-radius:6px;background:var(--bb-tint);color:var(--bb-primary);font-size:.85em;cursor:pointer;font-variant-numeric:tabular-nums}
.bb-ts:hover{filter:brightness(1.1)}
.bb-ts::before{content:"▸";font-size:.8em}
/* library */
.bb-lib{display:flex;flex-direction:column;height:100%;background:var(--bb-sidebar);backdrop-filter:blur(12px)}
.bb-lib-hd{padding:12px;border-bottom:1px solid var(--bb-border-sub)}
.bb-lib-body{flex:1;overflow:auto;padding:8px 10px}
.bb-sec{margin:10px 2px 4px;display:flex;align-items:center;justify-content:space-between}
.bb-fold{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;cursor:pointer;color:var(--bb-text-sec)}
.bb-fold:hover{background:var(--bb-hover)}
.bb-fold.active{background:var(--bb-tint);color:var(--bb-primary)}
.bb-fold .cnt{margin-left:auto;font-size:11px;opacity:.6}
.bb-item{display:flex;gap:8px;margin:6px 0;align-items:flex-start}
.bb-item .ttl{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px}
.bb-item .dt{font-size:10px;color:var(--bb-text-subtle);margin-top:2px}
.bb-empty{padding:24px 8px;text-align:center;color:var(--bb-text-subtle);font-size:12px}
/* detail */
.bb-app{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bb-bg)}
.bb-hdr{flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bb-border-sub);background:var(--bb-header);backdrop-filter:blur(12px)}
.bb-body{flex:1;min-height:0;overflow:auto;padding:14px}
.bb-hero{max-width:640px;margin:6vh auto 0;text-align:center}
.bb-hero h1{font-size:26px;font-weight:700;margin:0 0 6px;color:var(--bb-primary)}
.bb-hero p{color:var(--bb-text-muted);margin:0 0 18px}
.bb-cols{display:flex;gap:14px;align-items:stretch}
.bb-col-l{flex:0 0 42%;min-width:0;display:flex;flex-direction:column;gap:12px}
.bb-col-r{flex:1;min-width:0;display:flex;flex-direction:column}
@media(max-width:820px){.bb-cols{flex-direction:column}.bb-col-l{flex:none}}
.bb-media{border-radius:14px;overflow:hidden;background:#000;aspect-ratio:16/9;position:relative}
.bb-media iframe{width:100%;height:100%;border:0;display:block}
.bb-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--bb-text-subtle);gap:8px;background:var(--bb-surf-sub)}
.bb-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--bb-surf-sub);margin-bottom:10px}
.bb-tab{flex:1;padding:7px;text-align:center;border-radius:9px;cursor:pointer;font-size:12.5px;color:var(--bb-text-sec)}
.bb-tab.on{background:var(--bb-tint);color:var(--bb-primary);font-weight:500}
.bb-out{line-height:1.65}
.bb-out h1,.bb-out h2,.bb-out h3,.bb-out h4{margin:.9em 0 .4em;line-height:1.3}
.bb-out h1{font-size:1.5em}.bb-out h2{font-size:1.25em}.bb-out h3{font-size:1.08em}
.bb-out pre{background:var(--bb-surf-sub);padding:10px 12px;border-radius:10px;overflow:auto}
.bb-out code{background:var(--bb-surf-sub);padding:1px 5px;border-radius:5px;font-family:ui-monospace,Menlo,monospace}
.bb-out pre code{background:transparent;padding:0}
.bb-out blockquote{margin:.6em 0;padding:2px 12px;border-left:3px solid var(--bb-primary);color:var(--bb-text-sec)}
.bb-out a{color:var(--bb-primary)}
.bb-out table{border-collapse:collapse;width:100%;margin:.6em 0}.bb-out th,.bb-out td{border:1px solid var(--bb-border);padding:4px 8px;text-align:left}
.bb-seg{display:flex;gap:8px;padding:6px 4px;border-bottom:1px solid var(--bb-border-sub)}
.bb-qa{display:flex;flex-direction:column;min-height:200px}
.bb-qa-log{flex:1;overflow:auto;padding:4px 0;display:flex;flex-direction:column;gap:8px}
.bb-msg{max-width:90%;padding:8px 11px;font-size:12.5px;border-radius:14px}
.bb-msg.u{align-self:flex-end;color:var(--bb-text);background:var(--bb-user-bg);border-bottom-right-radius:4px}
.bb-msg.a{align-self:flex-start;background:var(--bb-ai-bg);border:1px solid var(--bb-ai-border);color:var(--bb-text-sec);border-bottom-left-radius:4px}
.bb-layer{position:fixed;inset:0;z-index:9999;pointer-events:none;color:var(--bb-text);font-size:13px;line-height:1.5}
.bb-menu{position:absolute;pointer-events:auto;min-width:120px;padding:4px;border-radius:10px;background:var(--bb-elev);border:1px solid var(--bb-border);box-shadow:var(--bb-shadow)}
.bb-menu div{padding:6px 10px;border-radius:7px;cursor:pointer;font-size:12px}.bb-menu div:hover{background:var(--bb-hover)}
/* 分析进度条(照原版:细轨 + 阶段标签 + 百分比;阶段来自引擎真事件) */
.bb-prog{margin-bottom:10px}
.bb-prog-head{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--bb-text-muted);margin-bottom:5px}
.bb-prog-track{height:4px;border-radius:999px;background:var(--bb-border-sub);overflow:hidden}
.bb-prog-fill{height:100%;width:0;border-radius:999px;background:var(--bb-primary);transition:width .5s ease-out}
.bb-prog.err .bb-prog-fill{background:var(--bb-danger)}
.bb-prog.err .bb-prog-head{color:var(--bb-danger)}
.bb-wc{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--bb-text-muted);margin-bottom:8px;flex-wrap:wrap}
.bb-wc .st{font-weight:600;padding:1px 8px;border-radius:999px;background:var(--bb-tint);color:var(--bb-primary)}
.bb-wc .st.warn{background:transparent;border:1px solid var(--bb-border);color:var(--bb-text-muted)}
.bb-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
/* 运行队列(照原版 analysis-queue-list:状态图标+标题+阶段文案+百分比+进度条+错误行+查看/移除) */
.bb-qrow{display:flex;gap:10px;align-items:flex-start;padding:9px 11px;border-radius:12px;border:1px solid var(--bb-border-sub);margin-top:8px;background:var(--bb-surf);cursor:pointer;transition:border-color .2s}
.bb-qrow:hover{border-color:var(--bb-primary)}
.bb-qrow .mid{flex:1;min-width:0}
.bb-qrow .ttl{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bb-qrow .sub{font-size:11px;color:var(--bb-text-muted);margin-top:2px;font-variant-numeric:tabular-nums}
.bb-qrow .err{font-size:11px;color:var(--bb-danger);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bb-qrow .acts{display:flex;gap:4px;flex:0 0 auto}
.bb-qic{flex:0 0 auto;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;margin-top:1px}
.bb-qic.ok{background:var(--bb-tint);color:var(--bb-primary)}
.bb-qic.bad{color:var(--bb-danger);border:1px solid var(--bb-danger)}
.bb-qic.spin{border:2px solid var(--bb-border);border-top-color:var(--bb-primary);animation:bbspin 1s linear infinite}
.bb-qic.wait{border:2px dashed var(--bb-border)}
@keyframes bbspin{to{transform:rotate(360deg)}}
/* 阶段步骤条(路标式:✓ 已过 / 高亮当前) */
.bb-steps{display:flex;gap:4px;align-items:center;margin-top:7px;font-size:10.5px;color:var(--bb-text-subtle);flex-wrap:wrap}
.bb-step{padding:2px 8px;border-radius:999px;background:var(--bb-surf-sub)}
.bb-step.on{background:var(--bb-tint);color:var(--bb-primary);font-weight:500}
.bb-step.done{color:var(--bb-text-muted)}
.bb-step.done::before{content:"✓ "}
/* 章节条 + 生成时间脚注 + 媒体封面 */
.bb-chap{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.bb-gen{margin-top:14px;text-align:right;font-size:10.5px;color:var(--bb-text-subtle)}
.bb-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bb-ph.ov{position:absolute;inset:0;background:rgba(0,0,0,.4);color:rgba(255,255,255,.95)} /* 压在封面暗色遮罩上,与主题无关 */
.bb-ph.ov a{color:rgba(255,255,255,.95);text-decoration:underline}
`

function badge(platform) {
  const meta = PLATFORM_META[platform] || PLATFORM_META['']
  const b = document.createElement('span'); b.className = `bb-badge ${meta.badge}`; b.textContent = meta.label; return b
}
function themeObserver(root) {
  syncTheme(root)
  const ob = new MutationObserver(() => syncTheme(root))
  // 观察祖先的 class/data-*/style(宿主切主题/换 token 时重派生);不观察 root 自身(syncTheme 写它 → 防成环)。
  for (let n = root.parentElement; n; n = n.parentElement) ob.observe(n, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme', 'style'] })
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
  const onMq = () => syncTheme(root); if (mq && mq.addEventListener) mq.addEventListener('change', onMq)
  return () => { ob.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq) }
}
const say = (m, o) => (ctx.notify ? ctx.notify(m, o) : ctx.app.notify(m))

// ══ 收藏夹视图 ══════════════════════════════════════════════════════════════
function mountLibrary(el) {
  el.innerHTML = ''
  const style = document.createElement('style'); style.textContent = STYLE; el.appendChild(style)
  const root = document.createElement('div'); root.className = 'bb-root'
  root.innerHTML = `
<div class="bb-lib">
  <div class="bb-lib-hd">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:18px">🐦</span><b>青鸟收藏夹</b></div>
    <button class="bb-btn" style="width:100%" data-new>＋ 新建总结</button>
  </div>
  <div class="bb-lib-body">
    <div class="bb-sec"><span class="bb-label">文件夹</span><span class="bb-btn ghost sm" data-newfolder>＋</span></div>
    <div data-folders></div>
    <div class="bb-sec" style="margin-top:14px"><span class="bb-label">历史记录</span></div>
    <input class="bb-input" data-search placeholder="搜索…" style="margin-bottom:6px;padding:6px 10px;font-size:12px" />
    <div data-list></div>
  </div>
</div>`
  el.appendChild(root)
  const off = themeObserver(root)
  const $ = (s) => root.querySelector(s)
  const foldersEl = $('[data-folders]'), listEl = $('[data-list]'), searchEl = $('[data-search]')
  let idx = { folders: [], items: [] }, activeFolder = 'all', query = ''

  const counts = () => { const c = {}; for (const it of idx.items) { const k = it.folderId || '__none'; c[k] = (c[k] || 0) + 1 } return c }
  /** 历史项拖进文件夹归档(照原版侧栏 drag&drop;右键菜单「移动到…」保留)。 */
  const wireDrop = (d, folderId) => {
    d.addEventListener('dragover', (e) => { if (e.dataTransfer && e.dataTransfer.types.includes('bluebird/id')) { e.preventDefault(); d.classList.add('active') } })
    d.addEventListener('dragleave', () => d.classList.remove('active'))
    d.addEventListener('drop', async (e) => {
      e.preventDefault(); d.classList.remove('active')
      const id = e.dataTransfer && e.dataTransfer.getData('bluebird/id'); if (!id) return
      const it = idx.items.find((x) => x.id === id); if (!it) return
      it.folderId = folderId; await writeIndex(idx); render()
    })
  }
  function renderFolders() {
    foldersEl.innerHTML = ''; const c = counts()
    const mk = (id, name, n) => { const d = document.createElement('div'); d.className = 'bb-fold' + (activeFolder === id ? ' active' : ''); d.innerHTML = `<span>${id === 'all' ? '📚' : id === 'none' ? '🗂' : '📁'}</span><span>${esc(name)}</span><span class="cnt">${n}</span>`; d.addEventListener('click', () => { activeFolder = id; render() }); return d }
    foldersEl.appendChild(mk('all', '全部', idx.items.length))
    const none = mk('none', '未分类', c['__none'] || 0); wireDrop(none, null); foldersEl.appendChild(none)
    for (const f of idx.folders) {
      const d = mk(f.id, f.name, c[f.id] || 0)
      wireDrop(d, f.id)
      const menu = document.createElement('span'); menu.className = 'bb-btn ghost sm'; menu.textContent = '⋯'; menu.style.marginLeft = '4px'
      menu.addEventListener('click', (e) => { e.stopPropagation(); folderMenu(f, menu) })
      d.appendChild(menu); foldersEl.appendChild(d)
    }
  }
  function renderList() {
    listEl.innerHTML = ''
    let items = idx.items
    if (activeFolder === 'none') items = items.filter((it) => !it.folderId)
    else if (activeFolder !== 'all') items = items.filter((it) => it.folderId === activeFolder)
    if (query) items = items.filter((it) => (it.title || '').toLowerCase().includes(query.toLowerCase()))
    if (!items.length) { listEl.innerHTML = `<div class="bb-empty">${idx.items.length ? '未找到匹配的记录' : '还没有收藏。贴一条视频链接,分析完自动出现在这里 →'}</div>`; return }
    for (const it of items) {
      const card = document.createElement('div'); card.className = 'bb-card'
      const row = document.createElement('div'); row.className = 'bb-item'
      const ic = platIcon(it.platform, 16); ic.style.marginTop = '2px'
      const col = document.createElement('div'); col.style.minWidth = '0'
      const ttl = document.createElement('div'); ttl.className = 'ttl'; ttl.textContent = it.title || '(无标题)'
      const dt = document.createElement('div'); dt.className = 'dt'
      dt.textContent = [it.date === today() ? '今天' : it.date, it.duration ? fmtTime(it.duration) : '', it.author || ''].filter(Boolean).join(' · ')
      col.appendChild(ttl); col.appendChild(dt); row.appendChild(ic); row.appendChild(col); card.appendChild(row)
      card.draggable = true
      card.addEventListener('dragstart', (e) => { if (e.dataTransfer) { e.dataTransfer.setData('bluebird/id', it.id); e.dataTransfer.effectAllowed = 'move' } })
      card.addEventListener('click', () => { pendingOpen = { entryId: it.id }; bus.emit({ type: 'open', entryId: it.id }); ctx.openView('folder') })
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(it, e.clientX, e.clientY) })
      listEl.appendChild(card)
    }
  }
  function render() { renderFolders(); renderList() }

  function folderMenu(f, anchor) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'
    const r = anchor.getBoundingClientRect(); box.style.left = r.left + 'px'; box.style.top = (r.bottom + 4) + 'px'
    const add = (t, fn) => { const d = document.createElement('div'); d.textContent = t; d.addEventListener('click', fn); box.appendChild(d) }
    add('✏️ 重命名', async () => { closeMenus(); const name = await askStr('文件夹名', f.name); if (name) { f.name = name; await writeIndex(idx); render() } })
    add('🗑 删除', async () => { closeMenus(); idx.folders = idx.folders.filter((x) => x.id !== f.id); idx.items.forEach((it) => { if (it.folderId === f.id) it.folderId = null }); await writeIndex(idx); if (activeFolder === f.id) activeFolder = 'all'; render() })
    showMenu(box)
  }
  function itemMenu(it, x, y) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'; box.style.left = x + 'px'; box.style.top = y + 'px'
    const add = (t, fn) => { const d = document.createElement('div'); d.textContent = t; d.addEventListener('click', fn); box.appendChild(d) }
    add('📂 移动到…', async () => { closeMenus(); const names = ['未分类', ...idx.folders.map((f) => f.name)]; const pick = await askStr(`移动到哪个文件夹?可选:${names.join(' / ')}`, ''); if (pick == null) return; const f = idx.folders.find((x) => x.name === pick); it.folderId = f ? f.id : null; await writeIndex(idx); render() })
    add('🗑 删除', async () => { closeMenus(); idx.items = idx.items.filter((x) => x.id !== it.id); await writeIndex(idx); render() })
    showMenu(box)
  }

  searchEl.addEventListener('input', () => { query = searchEl.value; renderList() })
  $('[data-new]').addEventListener('click', () => { pendingOpen = { fresh: true }; bus.emit({ type: 'open', fresh: true }); ctx.openView('folder') })
  $('[data-newfolder]').addEventListener('click', async () => { const name = await askStr('新文件夹名', ''); if (name) { idx.folders.push({ id: uuid(), name }); await writeIndex(idx); render() } })
  const offBus = bus.on((e) => { if (e.type === 'saved') refresh() })
  async function refresh() { idx = await readIndex(); render() }
  ensureWorkFolder().then(refresh)
  return () => { off(); offBus(); closeMenus() }
}

let _menuCleanup = null
function closeMenus() { root_all('.bb-menu').forEach((m) => m.remove()) }
function root_all(sel) { return Array.from(document.querySelectorAll(sel)) }
document.addEventListener('click', (e) => { if (!(e.target.closest && e.target.closest('.bb-menu'))) closeMenus() }, true)

/** 极简输入框(Electron 无 window.prompt);返回字符串或 null。 */
function askStr(title, def) {
  return new Promise((resolve) => {
    closeMenus()
    const ov = document.createElement('div'); ov.className = 'bb-menu'; ov.style.left = '50%'; ov.style.top = '30%'; ov.style.transform = 'translateX(-50%)'; ov.style.minWidth = '280px'; ov.style.padding = '14px'
    ov.innerHTML = `<div style="font-size:12px;margin-bottom:8px">${esc(title)}</div>`
    const inp = document.createElement('input'); inp.className = 'bb-input'; inp.value = def || ''
    const row = document.createElement('div'); row.className = 'bb-row'; row.style.marginTop = '10px'; row.style.justifyContent = 'flex-end'
    const ok = document.createElement('button'); ok.className = 'bb-btn primary sm'; ok.textContent = '确定'
    const no = document.createElement('button'); no.className = 'bb-btn ghost sm'; no.textContent = '取消'
    const done = (v) => { ov.remove(); resolve(v) }
    ok.addEventListener('click', () => done(inp.value.trim() || null))
    no.addEventListener('click', () => done(null))
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null) })
    row.appendChild(no); row.appendChild(ok); ov.appendChild(inp); ov.appendChild(row); showMenu(ov); inp.focus()
  })
}

// ══ 分析 / 详情视图 ═════════════════════════════════════════════════════════
function mountAnalyze(el) {
  el.innerHTML = ''
  const style = document.createElement('style'); style.textContent = STYLE; el.appendChild(style)
  const root = document.createElement('div'); root.className = 'bb-root'; el.appendChild(root)
  const off = themeObserver(root)

  // 视图态:home | run(队列项:直播与结果同一张脸)| entry(已存收藏)。
  // 分析本体在模块级队列 —— 切走/关掉视图照跑,回来还在。
  let cur = { kind: 'home', id: null, live: false }
  let view = null // { title, summary, data, sourceUrl, plat, sessionId, entryId, notePath, detail, generatedAt, runId }
  let qaController = null, seekHandler = null
  const say2 = say

  // ── 首页:输入面板 + 分析队列面板(照原版 LinkInputPanel + AnalysisQueueList 同屏) ──
  function renderHome() {
    cur = { kind: 'home', id: null, live: false }
    root.innerHTML = `
<div class="bb-app">
  <div class="bb-body">
    <div class="bb-hero">
      <h1>青鸟收藏夹</h1>
      <p>贴一条视频链接,抓字幕、出结构化总结,自动存进你的知识库。转录与 AI 全在本机。</p>
      <div class="bb-panel" style="padding:16px;text-align:left">
        <input class="bb-input" data-url placeholder="粘贴视频链接(Bilibili / YouTube / 抖音 / 小红书),或整段分享文案…" />
        <div class="bb-row" style="margin-top:10px">
          <select class="bb-sel" data-tpl>${TEMPLATES.map((t) => `<option${t === getSetting('defaultTemplate', '通用') ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <select class="bb-sel" data-detail>${Object.entries(DETAILS).map(([k, v]) => `<option value="${k}"${k === getSetting('detail', 'standard') ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button class="bb-btn primary" data-go style="flex:1">添加到分析队列</button>
        </div>
        <div class="bb-muted" data-warn style="font-size:11px;margin-top:8px;min-height:14px"></div>
      </div>
      <div class="bb-row" style="justify-content:center;gap:16px;margin-top:14px;font-size:11px;color:var(--bb-text-subtle)">
        <span>⚡ 自动抓字幕</span><span>🧠 AI 总结</span><span>💾 自动存进笔记</span>
      </div>
    </div>
    <div data-queue style="max-width:640px;margin:18px auto 0"></div>
  </div>
</div>`
    const urlEl = root.querySelector('[data-url]'), warnEl = root.querySelector('[data-warn]')
    const check = () => {
      const raw = urlEl.value, u = extractUrl(raw)
      warnEl.textContent = !raw ? '' : !isSupported(u) ? '⚠️ 暂不支持的链接' : (u !== raw.trim() ? '✓ 已从分享文本中提取链接' : '✓ 可分析')
    }
    urlEl.addEventListener('input', check)
    urlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
    root.querySelector('[data-go]').addEventListener('click', go)
    function go() {
      const url = extractUrl(urlEl.value.trim()); if (!url) return
      if (!isSupported(url)) { say2('暂不支持的链接', { level: 'warning' }); return }
      qAdd(url, root.querySelector('[data-tpl]').value, root.querySelector('[data-detail]').value)
      urlEl.value = ''; warnEl.textContent = '已加入分析队列 ↓'
    }
    renderQueue()
  }

  function renderQueue() {
    const box = root.querySelector('[data-queue]'); if (!box) return
    if (!queue.items.length) { box.innerHTML = ''; return }
    box.innerHTML = `
<div class="bb-panel" style="padding:12px;text-align:left">
  <div class="bb-row" style="justify-content:space-between;margin-bottom:2px">
    <span class="bb-label">分析队列</span>
    ${queue.items.some((i) => i.status === 'completed') ? '<button class="bb-btn ghost sm" data-cleardone>清除已完成</button>' : ''}
  </div>
  <div data-qitems></div>
</div>`
    const wrap = box.querySelector('[data-qitems]')
    for (const it of queue.items) wrap.appendChild(queueRow(it))
    const cd = box.querySelector('[data-cleardone]'); if (cd) cd.addEventListener('click', qClearDone)
  }

  /** 队列行(全 DOM 拼装:标题/错误来自模型与网络,一律 textContent 杜绝注入)。 */
  function queueRow(it) {
    const row = document.createElement('div'); row.className = 'bb-qrow'
    const active = it.status === 'parsing' || it.status === 'transcribing'
    const ic = document.createElement('span')
    ic.className = 'bb-qic ' + (it.status === 'completed' ? 'ok' : it.status === 'error' ? 'bad' : it.status === 'pending' ? 'wait' : 'spin')
    ic.textContent = it.status === 'completed' ? '✓' : it.status === 'error' ? '✕' : ''
    const mid = document.createElement('div'); mid.className = 'mid'
    const t = document.createElement('div'); t.className = 'ttl'; t.textContent = it.title || it.url; t.title = it.url
    const sub = document.createElement('div'); sub.className = 'sub'
    const lbl = it.status === 'pending' ? '排队中' : it.status === 'completed' ? '已完成' : it.status === 'error' ? '失败' : (it.progressLabel || '处理中…')
    sub.textContent = lbl + (active && it.progress > 0 ? ` · ${Math.round(it.progress)}%` : '') + (active && it.startedAt ? ` · ${Math.round((Date.now() - it.startedAt) / 1000)}s` : '')
    mid.appendChild(t); mid.appendChild(sub)
    if (it.status === 'error' && it.error) { const er = document.createElement('div'); er.className = 'err'; er.textContent = it.error; er.title = it.error; mid.appendChild(er) }
    if (active && it.progress > 0) {
      const tr = document.createElement('div'); tr.className = 'bb-prog-track'; tr.style.marginTop = '5px'
      const f = document.createElement('div'); f.className = 'bb-prog-fill'; f.style.width = Math.min(100, it.progress) + '%'
      tr.appendChild(f); mid.appendChild(tr)
    }
    const acts = document.createElement('div'); acts.className = 'acts'
    const btn = (txt, fn) => { const b = document.createElement('button'); b.className = 'bb-btn ghost sm'; b.textContent = txt; b.addEventListener('click', (e) => { e.stopPropagation(); fn() }); acts.appendChild(b) }
    if (it.status === 'completed') btn('查看', () => openRun(it))
    else if (active) btn('取消', () => qCancel(it.id))
    if (it.status === 'completed' || it.status === 'error') btn('移除', () => qRemove(it.id))
    row.appendChild(ic); row.appendChild(mid); row.appendChild(acts)
    row.addEventListener('click', () => openRun(it)) // 点行即看:运行中=直播,完成=结果
    return row
  }

  function openRun(it) {
    if (it.status === 'completed' && it.entryId) { openSaved(it.entryId); return }
    renderRun(it)
  }

  /** 队列项 → 详情(直播或结果)。 */
  function renderRun(it) {
    const live = it.status === 'pending' || it.status === 'parsing' || it.status === 'transcribing'
    cur = { kind: 'run', id: it.id, live }
    view = {
      title: it.title || (live ? '分析中…' : '视频'), summary: it.summary || '', data: it.data,
      sourceUrl: it.url, plat: it.plat, sessionId: it.sessionId, entryId: it.entryId, notePath: it.notePath,
      detail: it.detail, generatedAt: it.endedAt || null, runId: it.id,
    }
    renderDetail(live, it.status === 'error' ? it.error : '')
    if (live) syncRunUI(it)
  }

  /** 直播态只刷数字与文案,不整页重绘(不打断 QA 输入/滚动位置)。 */
  function syncRunUI(it) {
    const box = root.querySelector('[data-prog]'); if (!box) return
    box.style.display = ''
    const sec = it.startedAt ? ` · ${Math.round((Date.now() - it.startedAt) / 1000)}s` : ''
    const statusEl = root.querySelector('[data-status]'), pctEl = root.querySelector('[data-pct]'), bar = root.querySelector('[data-bar]')
    if (statusEl) statusEl.textContent = it.status === 'error' ? '失败:' + it.error : (it.progressLabel || '') + sec
    if (pctEl) pctEl.textContent = it.status === 'error' ? '' : `${Math.round(it.progress)}%`
    if (bar) bar.style.width = `${Math.min(100, it.progress)}%`
    if (it.status === 'error') box.classList.add('err')
    const steps = root.querySelector('[data-steps]')
    if (steps) for (let i = 0; i < steps.children.length; i++) {
      const th = STEPS[i][1], next = STEPS[i + 1] ? STEPS[i + 1][1] : 101
      steps.children[i].className = 'bb-step' + (it.progress >= next ? ' done' : it.progress >= th ? ' on' : '')
    }
  }

  // ── 详情(直播 / 结果 / 收藏共用一张脸) ──
  function renderDetail(loading, errText) {
    const meta = (view.data && view.data.meta) || {}
    const title = meta.title || view.title || deriveTitle(view.summary) || '视频'
    const metaLine = [PLATFORM_META[view.plat.platform] ? PLATFORM_META[view.plat.platform].label : '', meta.author, meta.duration ? fmtTime(meta.duration) : ''].filter(Boolean).join(' · ')
    root.innerHTML = `
<div class="bb-app">
  <div class="bb-hdr">
    <button class="bb-btn ghost sm" data-back title="返回">←</button>
    <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-title></div><div class="bb-muted" style="font-size:11px" data-metaline></div></div>
    <button class="bb-btn ghost sm" data-restart ${loading ? 'disabled' : ''}>重新总结</button>
    <button class="bb-btn ghost sm" data-export ${loading ? 'disabled' : ''}>导出 ▾</button>
    <button class="bb-btn primary sm" data-save ${loading ? 'disabled' : ''}>${view.entryId ? '打开笔记' : '存入收藏夹'}</button>
  </div>
  <div class="bb-body">
    <div class="bb-prog" data-prog style="display:none">
      <div class="bb-prog-head"><span data-status></span><span data-pct></span></div>
      <div class="bb-prog-track"><div class="bb-prog-fill" data-bar></div></div>
      <div class="bb-steps" data-steps>${STEPS.map((s) => `<span class="bb-step">${s[0]}</span>`).join('')}</div>
    </div>
    <div class="bb-cols">
      <div class="bb-col-l">
        <div class="bb-media" data-media></div>
        <div class="bb-panel" style="padding:10px;flex:1;display:flex;flex-direction:column;min-height:220px">
          <div class="bb-label" style="margin-bottom:6px">AI 问答</div>
          <div class="bb-qa">
            <div class="bb-qa-log" data-qalog></div>
            <div class="bb-row" style="margin-top:8px"><input class="bb-input" data-qin placeholder="${loading ? '分析完成后可提问…' : '就这个视频提问…'}" ${loading ? 'disabled' : ''} style="flex:1;padding:7px 10px"/><button class="bb-btn primary sm" data-ask ${loading ? 'disabled' : ''}>问</button></div>
          </div>
        </div>
      </div>
      <div class="bb-col-r">
        <div class="bb-tabs"><div class="bb-tab on" data-tab="s">总结</div><div class="bb-tab" data-tab="t">字幕</div></div>
        <div class="bb-muted" data-hint style="font-size:11px;margin:-4px 2px 8px"></div>
        <div class="bb-panel" style="padding:14px;flex:1;overflow:auto">
          <div data-wc class="bb-wc"></div>
          <div data-tags class="bb-row" style="margin-bottom:10px"></div>
          <div data-chapters class="bb-chap"></div>
          <div class="bb-out" data-summary></div>
          <div data-transcript style="display:none"></div>
          <div class="bb-gen" data-gen></div>
        </div>
      </div>
    </div>
  </div>
</div>`
    const $ = (s) => root.querySelector(s)
    $('[data-title]').textContent = title
    $('[data-metaline]').textContent = metaLine
    $('[data-back]').addEventListener('click', renderHome)
    $('[data-restart]').addEventListener('click', (e) => { if (view.sourceUrl) resummarize(e.currentTarget) })
    $('[data-save]').addEventListener('click', doSave)
    $('[data-export]').addEventListener('click', (e) => exportMenu(e.currentTarget))
    // 播放器 / 封面(不能内嵌的平台给缩略图,压暗色遮罩,与主题无关)
    const media = $('[data-media]')
    const seek = (t) => { if (view.plat.embed) { media.innerHTML = ''; const f = document.createElement('iframe'); f.src = view.plat.embed(t); f.allow = 'autoplay; fullscreen'; media.appendChild(f) } }
    seekHandler = seek
    if (view.plat.embed) { const f = document.createElement('iframe'); f.src = view.plat.embed(0); f.allow = 'autoplay; fullscreen'; media.appendChild(f) }
    else {
      media.innerHTML = ''
      const thumb = safeHref(meta.thumbnail || '')
      const hasThumb = /^https:/i.test(thumb)
      if (hasThumb) { const img = document.createElement('img'); img.className = 'bb-thumb'; img.src = thumb; img.addEventListener('error', () => img.remove()); media.appendChild(img) }
      const ph = document.createElement('div'); ph.className = 'bb-ph' + (hasThumb ? ' ov' : '')
      const icon = document.createElement('div'); icon.style.fontSize = '28px'; icon.textContent = '▶'
      const lab = document.createElement('div'); lab.textContent = PLATFORM_META[view.plat.platform] ? PLATFORM_META[view.plat.platform].label : '视频'
      ph.appendChild(icon); ph.appendChild(lab)
      if (view.sourceUrl) { const a = document.createElement('a'); a.href = safeHref(view.sourceUrl); a.target = '_blank'; a.rel = 'noopener'; a.textContent = '在浏览器打开 ↗'; a.style.fontSize = '12px'; if (!hasThumb) a.style.color = 'var(--bb-primary)'; ph.appendChild(a) }
      media.appendChild(ph)
    }
    // 标签切换 + 提示行(照原版 RightPanelTabs 的 hint)
    const outEl = $('[data-summary]'), trEl = $('[data-transcript]'), hintEl = $('[data-hint]')
    const setHint = (s) => { hintEl.textContent = s ? '正文里的 [MM:SS] 可点击跳转播放器' : `带时间戳的字幕内容${(view.data && view.data.segments && view.data.segments.length) ? ` · 共 ${view.data.segments.length} 条` : ''}` }
    setHint(true)
    root.querySelectorAll('[data-tab]').forEach((tabEl) => tabEl.addEventListener('click', () => {
      root.querySelectorAll('[data-tab]').forEach((x) => x.classList.remove('on')); tabEl.classList.add('on')
      const s = tabEl.getAttribute('data-tab') === 's'
      outEl.style.display = s ? '' : 'none'; trEl.style.display = s ? 'none' : ''
      for (const sel of ['[data-wc]', '[data-tags]', '[data-chapters]', '[data-gen]']) $(sel).style.display = s ? '' : 'none'
      setHint(s)
    }))
    if (errText) { const box = $('[data-prog]'); box.style.display = ''; box.classList.add('err'); $('[data-status]').textContent = '失败:' + errText }
    fillSummary(loading); fillTranscript(); wireQA(loading)
  }

  function fillSummary(loading) {
    const outEl = root.querySelector('[data-summary]'); if (!outEl) return
    if (loading && !view.summary) outEl.textContent = '…'
    else renderMarkdown(outEl, view.summary || '(无总结)', (t) => seekHandler && seekHandler(t))
    // 字数横幅(照原版:达标/偏少/偏多 + 目标区间 + 档位)
    const wc = root.querySelector('[data-wc]'); wc.innerHTML = ''
    if (view.summary && !loading) {
      const n = countWords(view.summary), st = wordState(n, view.detail)
      if (st) { const b = document.createElement('span'); b.className = 'st' + (st === '字数达标' ? '' : ' warn'); b.textContent = st; wc.appendChild(b) }
      const r = WORD_RANGES[view.detail]
      const tx = document.createElement('span'); tx.textContent = `字数 ${n}` + (r ? ` / 目标 ${r[0]}-${r[1]}` : '') + (DETAILS[view.detail] ? ` · 档位:${DETAILS[view.detail]}` : '')
      wc.appendChild(tx)
    }
    const tags = root.querySelector('[data-tags]'); tags.innerHTML = ''
    if (view.data && Array.isArray(view.data.tags)) for (const tg of view.data.tags.slice(0, 8)) { const b = document.createElement('span'); b.className = 'bb-badge primary'; b.textContent = '#' + tg; tags.appendChild(b) }
    // 章节(原版只入库不渲染,这里补上:可点跳转)
    const ch = root.querySelector('[data-chapters]'); ch.innerHTML = ''
    const chs = (view.data && Array.isArray(view.data.chapters)) ? view.data.chapters.filter((c) => c && c.title) : []
    for (const c of chs.slice(0, 24)) {
      const chip = document.createElement('span'); chip.className = 'bb-ts'; chip.textContent = `${fmtTime(c.t || 0)} ${c.title}`
      chip.addEventListener('click', () => seekHandler && seekHandler(c.t || 0)); ch.appendChild(chip)
    }
    const gen = root.querySelector('[data-gen]')
    gen.textContent = view.generatedAt && !loading ? `生成于 ${new Date(view.generatedAt).toLocaleString('zh-CN')}` : ''
  }

  function fillTranscript() {
    const trEl = root.querySelector('[data-transcript]'); if (!trEl) return
    trEl.innerHTML = ''
    const segs = (view.data && Array.isArray(view.data.segments)) ? view.data.segments : []
    if (!segs.length) { trEl.innerHTML = '<div class="bb-empty">暂无字幕(纯 ASR 或未返回)。</div>'; return }
    for (const s of segs) {
      const row = document.createElement('div'); row.className = 'bb-seg'
      const ts = document.createElement('span'); ts.className = 'bb-ts'; ts.textContent = `[${fmtTime(s.start)} - ${fmtTime(s.end == null ? s.start : s.end)}]`; ts.addEventListener('click', () => seekHandler && seekHandler(s.start))
      const tx = document.createElement('span'); tx.textContent = s.text; tx.style.flex = '1'
      row.appendChild(ts); row.appendChild(tx); trEl.appendChild(row)
    }
  }

  function wireQA(loading) {
    const log = root.querySelector('[data-qalog]'), inp = root.querySelector('[data-qin]'), ask = root.querySelector('[data-ask]')
    if (!ask || loading) return
    const send = async () => {
      const q = inp.value.trim(); if (!q) return
      if (!view.sessionId) { say2('先分析一个视频', { level: 'warning' }); return }
      const cfg = await getCfg(); if (!cfg.token) { say2('请先登录 Forsion', { level: 'error' }); return }
      inp.value = ''
      const u = document.createElement('div'); u.className = 'bb-msg u'; u.textContent = q; log.appendChild(u)
      const a = document.createElement('div'); a.className = 'bb-msg a'; a.textContent = '…'; log.appendChild(a); log.scrollTop = log.scrollHeight
      ask.disabled = true
      if (qaController) qaController.abort(); qaController = new AbortController(); const sig = qaController.signal
      try { const ans = await runAgent(cfg, view.sessionId, q, (full) => { a.textContent = full; log.scrollTop = log.scrollHeight }, sig); renderMarkdown(a, ans || '(无回答)', (t) => seekHandler && seekHandler(t)) }
      catch (e) { if (!sig.aborted) a.textContent = '失败:' + ((e && e.message) || e) } finally { ask.disabled = false }
    }
    ask.addEventListener('click', send); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
  }

  // ── 重新总结:小弹层选模板+档位 → 重新排队(照原版 GenerateSummaryModal 的精简版) ──
  function resummarize(anchor) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'; box.style.minWidth = '230px'; box.style.padding = '12px'
    const r = anchor.getBoundingClientRect(); box.style.left = Math.max(8, r.right - 240) + 'px'; box.style.top = (r.bottom + 4) + 'px'
    const cap = document.createElement('div'); cap.className = 'bb-label'; cap.style.marginBottom = '8px'; cap.textContent = '重新总结(重新分析并排队)'
    const s1 = document.createElement('select'); s1.className = 'bb-sel'; s1.style.width = '100%'
    for (const t of TEMPLATES) { const o = document.createElement('option'); o.textContent = t; if (t === getSetting('defaultTemplate', '通用')) o.selected = true; s1.appendChild(o) }
    const s2 = document.createElement('select'); s2.className = 'bb-sel'; s2.style.width = '100%'; s2.style.marginTop = '6px'
    for (const [k, v] of Object.entries(DETAILS)) { const o = document.createElement('option'); o.value = k; o.textContent = v; if (k === (view.detail || getSetting('detail', 'standard'))) o.selected = true; s2.appendChild(o) }
    const goBtn = document.createElement('button'); goBtn.className = 'bb-btn primary sm'; goBtn.style.cssText = 'margin-top:10px;width:100%'; goBtn.textContent = '开始'
    goBtn.addEventListener('click', () => { closeMenus(); renderRun(qAdd(view.sourceUrl, s1.value, s2.value)) })
    box.appendChild(cap); box.appendChild(s1); box.appendChild(s2); box.appendChild(goBtn); showMenu(box)
  }

  // 当前视图态 → saveEntry 载荷(自动保存在 qRun 里;这里是手动保存/导出存笔记)
  const currentEntry = () => ({ id: view.entryId, summaryMarkdown: view.summary, meta: (view.data && view.data.meta) || { platform: view.plat.platform, videoId: view.plat.videoId, videoUrl: view.sourceUrl }, segments: (view.data && view.data.segments) || [], chapters: (view.data && view.data.chapters) || [], tags: (view.data && view.data.tags) || [], sourceUrl: view.sourceUrl, folderId: null, detail: view.detail })
  const markSaved = (r) => {
    view.entryId = r.id; view.notePath = r.notePath
    if (view.runId) { const it = qFind(view.runId); if (it) { it.entryId = r.id; it.notePath = r.notePath } }
    bus.emit({ type: 'saved' })
    const b = root.querySelector('[data-save]'); if (b) b.textContent = '打开笔记'
  }
  async function doSave() {
    if (view.entryId && view.notePath) { if (ctx.app.openFile) ctx.app.openFile(view.notePath); return } // 已保存 → 打开笔记
    if (!view.summary.trim()) { say2('还没有可保存的总结', { level: 'warning' }); return }
    try { const r = await saveEntry(currentEntry()); markSaved(r); say2('已存入收藏夹', { level: 'success' }) }
    catch (e) { say2('保存失败:' + ((e && e.message) || e), { level: 'error' }) }
  }
  function exportMenu(anchor) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'; const r = anchor.getBoundingClientRect(); box.style.left = r.left + 'px'; box.style.top = (r.bottom + 4) + 'px'
    const segs = (view.data && view.data.segments) || []
    const dl = (name, text, mime) => { const b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = sanitizeFileName(deriveTitle(view.summary)) + name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); closeMenus() }
    const add = (t, fn) => { const d = document.createElement('div'); d.textContent = t; d.addEventListener('click', fn); box.appendChild(d) }
    add('📋 复制 Markdown', async () => { try { await navigator.clipboard.writeText(view.summary); say2('已复制', { level: 'success' }) } catch { say2('复制失败', { level: 'error' }) } closeMenus() })
    add('📄 Markdown', () => dl('.md', view.summary, 'text/markdown'))
    add('💎 Obsidian', () => dl('.md', toObsidian((view.data && view.data.meta), view.summary, view.sourceUrl), 'text/markdown'))
    add(`📝 SRT${segs.length ? '' : '(无字幕)'}`, () => segs.length ? dl('.srt', toSRT(segs)) : say2('无字幕数据', { level: 'warning' }))
    add(`📄 TXT${segs.length ? '' : '(无字幕)'}`, () => segs.length ? dl('.txt', toTXT(segs, true)) : say2('无字幕数据', { level: 'warning' }))
    add('🔧 JSON', () => dl('.json', JSON.stringify({ meta: (view.data && view.data.meta) || {}, summaryMarkdown: view.summary, segments: segs, chapters: (view.data && view.data.chapters) || [], tags: (view.data && view.data.tags) || [], exportedAt: new Date().toISOString() }, null, 2), 'application/json'))
    add('💾 存为笔记', async () => { closeMenus(); try { const r = await saveEntry(currentEntry()); markSaved(r); if (ctx.app.openFile) ctx.app.openFile(r.notePath); say2('已存为笔记', { level: 'success' }) } catch (e) { say2('失败:' + ((e && e.message) || e), { level: 'error' }) } })
    showMenu(box)
  }

  async function openSaved(id) {
    const full = await loadEntry(id)
    if (!full) { say2('打不开这条收藏(数据缺失)', { level: 'error' }); renderHome(); return }
    const sourceUrl = full.sourceUrl || (full.meta && full.meta.videoUrl) || ''
    cur = { kind: 'entry', id, live: false }
    view = {
      title: (full.meta && full.meta.title) || '', summary: full.summaryMarkdown || '',
      data: { meta: full.meta || {}, segments: full.segments || [], chapters: full.chapters || [], tags: full.tags || [] },
      sourceUrl, plat: parsePlatform(sourceUrl), sessionId: uuid(), entryId: id, notePath: full.notePath || null,
      detail: full.detail || '', generatedAt: full.generatedAt || null, runId: null,
    }
    renderDetail(false)
    // 给新会话垫一句字幕上下文,之后追问 Agent 就记得了
    if (view.data.segments.length) { const cfg = await getCfg(); if (cfg.token) runAgent(cfg, view.sessionId, `以下是视频《${(full.meta && full.meta.title) || ''}》的字幕,后续我会基于它提问,先记住不必回复长篇:\n${view.data.segments.slice(0, 400).map((s) => `[${fmtTime(s.start)}] ${s.text}`).join('\n')}`, null).catch(() => {}) }
  }

  // ── 总线消费:library 打开请求 / 队列变更 / 直播 token ──
  const consume = (e) => { if (!e) return; if (e.fresh) renderHome(); else if (e.entryId) openSaved(e.entryId) }
  const offBus = bus.on((e) => {
    if (e.type === 'open') { consume(e); return }
    if (e.type === 'queue') {
      if (cur.kind === 'home') { renderQueue(); return }
      if (cur.kind === 'run') {
        const it = qFind(cur.id); if (!it) return
        if (cur.live && (it.status === 'completed' || it.status === 'error')) { renderRun(it); return } // 直播 → 结果,整页翻一次
        if (cur.live) syncRunUI(it) // 只在直播态跟进;看别的结果时不受其他任务事件干扰
      }
      return
    }
    if (e.type === 'run-delta' && cur.kind === 'run' && cur.live && e.id === cur.id) {
      const it = qFind(cur.id); const outEl = root.querySelector('[data-summary]')
      if (it && outEl) { outEl.textContent = it.summary; view.summary = it.summary }
    }
  })
  // 秒表:活动 run 的耗时逐秒走(首页队列行 + 直播页);无活动任务时空转,开销可忽略
  const tick = setInterval(() => {
    if (!qActive().length) return
    if (cur.kind === 'home') renderQueue()
    else if (cur.kind === 'run' && cur.live) { const it = qFind(cur.id); if (it) syncRunUI(it) }
  }, 1000)

  ensureWorkFolder() // folder 视图可单独打开(状态栏/命令),不能只靠 library 建夹
  if (pendingOpen) { const p = pendingOpen; pendingOpen = null; consume(p) } else renderHome()

  return () => { off(); offBus(); clearInterval(tick); if (qaController) qaController.abort() } // 队列不随视图死:分析继续、自动落盘
}

// ── 注册 ──
ctx.registerView({ id: 'library', title: '收藏夹', mount: mountLibrary, singleton: true })
ctx.registerView({ id: 'folder', title: '青鸟收藏夹', mount: mountAnalyze, singleton: true })
ctx.registerCommand({ id: 'bluebird-open', title: '青鸟收藏夹:打开', keywords: 'bluebird 青鸟 视频 总结 字幕 video', run: () => ctx.openView('folder') })
ctx.registerCommand({ id: 'bluebird-library', title: '青鸟收藏夹:打开侧栏', keywords: 'bluebird 青鸟 收藏 library history', run: () => ctx.openView('library') })
const sb = ctx.registerStatusItem && ctx.registerStatusItem({ id: 'open', side: 'right', text: '🐦 青鸟', title: '打开青鸟收藏夹', onClick: () => ctx.openView('folder') })

if (globalThis.__BLUEBIRD_TEST__) {
  Object.assign(globalThis.__BLUEBIRD_TEST__, { inline, renderMarkdown, safeHref, deriveTitle, sanitizeFileName, today, parsePlatform, extractUrl, isSupported, parseAgentOutput, fmtTime, parseTs, toSRT, toTXT, toObsidian, onColorOf, readableOn, contrast, folderRoot, stageOf, countWords, wordState, STEPS, queue, qAdd, qCancel, qRemove, qClearDone, ensureWorkFolder })
}

return () => { if (sb && sb.dispose) sb.dispose(); queue.items.forEach((i) => { if (i.controller) i.controller.abort() }) } // 插件停用才断分析
