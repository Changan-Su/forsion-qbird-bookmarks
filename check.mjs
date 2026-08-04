/**
 * 青鸟收藏夹插件自检:宿主同款 new Function('ctx', src) 求值 main.js,断言贡献点齐全(2 视图/2 命令/2 设置 + saveFolder→workFolder 迁移),
 * 并用极简 DOM 垫片验证 Markdown 渲染器**天然防 XSS**;再测一批纯函数(平台识别/链接抽取/产出解析/导出)。
 * 纯函数经 main.js 文末 __BLUEBIRD_TEST__ 钩子暴露。跑法:node check.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as A } from 'node:assert'

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')

// ── 极简 DOM 垫片 ──
function mkText(t) {
  const n = { tag: '#text', children: [], attrs: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }
  let v = String(t); Object.defineProperty(n, 'textContent', { get: () => v, set: (x) => { v = String(x) } }); return n
}
function mkEl(tag) {
  const n = { tag, children: [], attrs: {}, addEventListener() {} }
  let own = ''
  n.appendChild = (c) => { if (c && c.tag === '#frag') for (const k of c.children) n.children.push(k); else n.children.push(c); return c }
  n.setAttribute = (k, val) => { n.attrs[k] = val }
  Object.defineProperty(n, 'textContent', { get: () => own + n.children.map((c) => c.textContent || '').join(''), set: (x) => { n.children.length = 0; own = String(x) } })
  return n
}
globalThis.document = { createElement: mkEl, createTextNode: mkText, createDocumentFragment: () => mkEl('#frag'), addEventListener() {} }
// Map 垫片 + 预置 1.2.x 自定义 saveFolder:求值时应被迁移成 workFolder
const _ls = new Map([['plugin.bluebird.saveFolder', 'myvids']])
globalThis.localStorage = { getItem: (k) => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: (k) => _ls.delete(k) }
const findAll = (node, tag) => { const out = []; const walk = (n) => { for (const c of (n.children || [])) { if (c.tag === tag) out.push(c); walk(c) } }; walk(node); return out }
const anyAttr = (node, key) => { let hit = false; const walk = (n) => { if (n.attrs && key in n.attrs) hit = true; for (const c of (n.children || [])) walk(c) }; walk(node); return hit }

// ── 求值 main.js ──
globalThis.__BLUEBIRD_TEST__ = {}
const reg = { views: [], commands: [], settings: [], status: [] }
const ctx = {
  registerView: (v) => reg.views.push(v), registerCommand: (c) => reg.commands.push(c),
  registerSetting: (s) => reg.settings.push(s), registerStatusItem: (s) => { reg.status.push(s); return { update() {}, dispose() {} } },
  notify() {}, activity: { log() {} }, openView() {},
  app: { notify() {}, writeFile: async () => {}, openFile() {}, readFile: async () => null },
}
const dispose = new Function('ctx', src)(ctx)
// 上面 ctx.app 的读写走内存 vault:队列/建夹断言要看落盘轨迹
const V = new Map(); const writes = []
ctx.app.readFile = async (p) => (V.has(p) ? V.get(p) : null)
ctx.app.writeFile = async (p, t) => { V.set(p, t); writes.push(p) }

// ── 贡献点契约 ──
A.equal(typeof dispose, 'function', 'setup 应返回 disposer')
A.ok(reg.views.find((v) => v.id === 'folder' && typeof v.mount === 'function'), '应注册 folder 视图')
A.ok(reg.views.find((v) => v.id === 'library' && typeof v.mount === 'function'), '应注册 library 视图(Space 引用它)')
A.ok(reg.commands.find((c) => c.id === 'bluebird-open'), '应注册 bluebird-open 命令')
A.ok(reg.commands.find((c) => c.id === 'bluebird-library'), '应注册 bluebird-library 命令')
A.deepEqual(reg.settings.map((s) => s.key).sort(), ['defaultTemplate', 'detail'], '应声明两个设置(存储夹已改用宿主标准 workFolder)')

// ── 工作文件夹约定(1.3.0):默认走宿主 workFolder;老宿主退回 videos;saveFolder 一次性迁移 ──
A.equal(_ls.get('plugin.bluebird.workFolder'), 'myvids', '1.2.x 自定义 saveFolder 应迁移为 workFolder')
A.ok(!_ls.has('plugin.bluebird.saveFolder'), '迁移后旧 saveFolder 键应删除')

// ── 纯函数 ──
const T = globalThis.__BLUEBIRD_TEST__
for (const k of ['inline', 'renderMarkdown', 'safeHref', 'deriveTitle', 'sanitizeFileName', 'today', 'parsePlatform', 'extractUrl', 'isSupported', 'parseAgentOutput', 'fmtTime', 'toSRT', 'toTXT', 'toObsidian', 'onColorOf', 'readableOn', 'contrast']) {
  A.equal(typeof T[k], 'function', `钩子应暴露 ${k}`)
}

// ── 深浅色可读性(2026-07-25 回归:cream 暗色 --accent 是纸白 #f8f7f6,按钮写死白字 → 对比 1.02:1 全瞎) ──
A.ok(!/color:\s*#fff/i.test(src), 'CSS 里不许再出现写死的白字(强调色填充上的字一律 var(--bb-on-fill))')
// ASI 陷阱:无分号风格下,以 ( 或 [ 开头的行会粘到上一句尾部当调用/下标(菜单曾因此整体不弹)
const lines = src.split('\n')
const asi = [...lines.keys()].filter((i) => {
  if (!/^\s*[([]/.test(lines[i])) return false
  let p = i - 1; while (p >= 0 && !lines[p].trim()) p--
  return p >= 0 && /[)\]'"`\w]\s*$/.test(lines[p])
}).map((i) => i + 1)
A.equal(asi.length, 0, `以 ( [ 开头的行会被 ASI 粘到上一句:第 ${asi.join(',')} 行`)
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
// 真 LCL 配色(skins.css / tangu.css):强调色 × 兜底字色,对比度必须够读
for (const [name, ac] of [['cream-dark', '#f8f7f6'], ['cream-light', '#1c1c1c'], ['lovable-dark', '#ece7dd'],
  ['echo-dark', '#ff9a7d'], ['echo-light', '#ff8a6b'], ['qbird-dark', '#5fa3b2'], ['zhi', '#1e96eb']]) {
  const on = T.onColorOf(hex(ac))
  A.ok(T.contrast(hex(ac), hex(on)) >= 4.5, `${name} 强调色上的兜底字色对比度不足(${on})`)
}
A.equal(T.onColorOf(hex('#f8f7f6')), '#16161a', '纸白强调色上必须给深字')
A.equal(T.onColorOf(hex('#1c1c1c')), '#ffffff', '炭黑强调色上必须给白字')
// 强调色当前景用(链接/时间戳/选中态):与底色贴太近时要朝文字色掺开
const rgbOf = (s) => s.match(/\d+/g).map(Number)
const blended = rgbOf(T.readableOn(hex('#2a292b'), hex('#2a292b'), hex('#f2efe8'))) // 强调色 == 底色的极端情形
A.ok(T.contrast(blended, hex('#2a292b')) >= 3, '与底色同色的强调色应被掺开到 3:1')

// safeHref / deriveTitle / sanitizeFileName
A.equal(T.safeHref('javascript:alert(1)'), '', 'javascript: 应被拒')
A.equal(T.safeHref('https://x.com'), 'https://x.com', 'https 放行')
A.equal(T.deriveTitle('# 视频标题\n正文'), '视频标题')
A.equal(T.sanitizeFileName('a/b:c?d'), 'a_b_c_d')

// ⚠️ XSS:注入的 HTML 必须变字面文字
const box = mkEl('div')
T.renderMarkdown(box, '**hi** <img src=x onerror=alert(1)> `code`')
A.ok(box.textContent.includes('hi') && box.textContent.includes('<img') && box.textContent.includes('onerror'), '<img onerror> 应作为字面文字保留')
A.equal(findAll(box, 'img').length, 0, '绝不能创建 img 元素')
A.equal(anyAttr(box, 'onerror'), false, '绝不能设 onerror 属性')

// 结构 + 危险链接
const box2 = mkEl('div')
T.renderMarkdown(box2, '# H\n\n- a\n- b\n\n[good](https://x.com) [bad](javascript:evil)')
A.equal(findAll(box2, 'h1').length, 1)
A.equal(findAll(findAll(box2, 'ul')[0], 'li').length, 2)
const as = findAll(box2, 'a')
A.equal(as[0].attrs.href, 'https://x.com', '安全链接设 href')
A.equal(as[1].attrs.href, undefined, '危险协议不设 href')

// 平台识别 + 内嵌地址
const yt = T.parsePlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
A.equal(yt.platform, 'youtube'); A.equal(yt.videoId, 'dQw4w9WgXcQ')
A.ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/.test(yt.embed(0)), 'YouTube 应给 nocookie 内嵌地址')
A.ok(/start=90&autoplay=1/.test(yt.embed(90)), 'seek 应带 start 跳转并即播')
A.ok(!/autoplay/.test(yt.embed(0)), '首载不自动播放')
const bili = T.parsePlatform('https://www.bilibili.com/video/BV1xx411c7mD')
A.equal(bili.platform, 'bilibili')
A.ok(/player\.bilibili\.com\/player\.html\?bvid=BV1xx411c7mD/.test(bili.embed(0)), 'Bilibili 应给 player.bilibili.com 内嵌地址(宿主 CSP 已放行)')
A.ok(/&t=90&autoplay=1/.test(bili.embed(90)), 'Bilibili seek 应带 &t= 并即播')
A.ok(/autoplay=0/.test(bili.embed(0)), 'Bilibili 首载不自动播放')
A.equal(T.isSupported('https://youtu.be/abc'), true)
A.equal(T.isSupported('https://example.com/x'), false)

// 分享文案抽链接
A.equal(T.extractUrl('看看这个 https://youtu.be/dQw4w9WgXcQ 很不错').includes('youtu.be/dQw4w9WgXcQ'), true)

// 拆 Agent 产出:剥掉 bluebird 数据块
const parsed = T.parseAgentOutput('# 总结\n正文内容\n\n```json bluebird\n{"meta":{"title":"T"},"segments":[{"start":1,"end":2,"text":"hi"}],"tags":["a"]}\n```')
A.ok(!parsed.summary.includes('bluebird') && parsed.summary.includes('正文内容'), '数据块应从总结里剥掉')
A.equal(parsed.data.meta.title, 'T'); A.equal(parsed.data.segments[0].text, 'hi')

// 导出 + 时间
A.equal(T.fmtTime(65), '1:05'); A.equal(T.fmtTime(3665), '1:01:05')
A.ok(T.toSRT([{ start: 0, end: 1.5, text: 'hi' }]).startsWith('1\n00:00:00,000 --> 00:00:01,500\nhi'), 'SRT 格式')
A.equal(T.toTXT([{ start: 65, end: 66, text: 'x' }], true), '[1:05] x')

// ── 运行队列(1.4.0,照原版五态):node 无引擎 → 一路走到 error,验证泵/取消/清除的状态迁移 ──
const q1 = T.qAdd('https://youtu.be/dQw4w9WgXcQ', '通用', 'standard')
A.equal(q1.status, 'pending'); A.equal(q1.progressLabel, '排队中')
const q2 = T.qAdd('https://youtu.be/abc12345678', '通用', 'brief')
T.qCancel(q2.id) // pending 时取消 → 直接标错,不会被泵拾起
await new Promise((r) => setTimeout(r, 40))
A.equal(q1.status, 'error', '无引擎环境应落 error'); A.ok(q1.error.includes('引擎'), q1.error)
A.equal(q2.status, 'error'); A.equal(q2.error, '已取消')
T.queue.items.push({ id: 'done1', status: 'completed' })
T.qClearDone()
A.ok(!T.queue.items.find((i) => i.id === 'done1'), '清除已完成应移除 completed 项')
A.ok(T.queue.items.find((i) => i.id === q1.id), '清除已完成不动 error 项')
T.qRemove(q1.id); T.qRemove(q2.id)
A.equal(T.queue.items.length, 0, '移除后队列应清空')

// 阶段映射:pct 单调有据 + 五态过程枚举(parsing/transcribing)
A.deepEqual(T.stageOf({ type: 'status', payload: { state: 'queued' } }, ''), { pct: 10, label: '排队中', st: 'parsing' })
A.equal(T.stageOf({ type: 'tool_call', payload: { name: 'run_bash' } }, '').st, 'transcribing')
A.equal(T.stageOf({ type: 'token', payload: {} }, 'x'.repeat(60000)).pct, 92, 'token 阶段封顶 92')
A.equal(T.STEPS.length, 5, '步骤路标五段')

// 字数档位(照原版目标区间)
A.equal(T.wordState(500, 'brief'), '字数达标')
A.equal(T.wordState(100, 'brief'), '字数偏少')
A.equal(T.wordState(9999, 'detailed'), '字数偏多')
A.equal(T.wordState(500, ''), null, '无档位不评判')
A.equal(T.countWords('# 标题\n\n**加粗**正文 [1:23](x)'), 10, 'countWords 剥 Markdown 符号计字符')

// ── 首开即建工作文件夹(修「运行后看不到工作区」):索引缺失就写空索引,幂等 ──
await T.ensureWorkFolder()
A.ok(V.has('videos/.bluebird-index.json'), '老宿主(无 workFolder)在 videos/ 建索引')
ctx.app.workFolder = () => '青鸟收藏夹'
await T.ensureWorkFolder()
A.ok(V.has('青鸟收藏夹/.bluebird-index.json'), '新宿主按工作文件夹建索引')
const wN = writes.length
await T.ensureWorkFolder()
A.equal(writes.length, wN, '已有索引不重复写(幂等)')

dispose()
console.log(`check ok — ${reg.views.length} views / ${reg.commands.length} cmds / ${reg.settings.length} settings;XSS+平台+导出+队列状态机+建夹 断言通过`)
