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
const reg = { views: [], commands: [], settings: [], status: [], listSources: [] }
// 语言广播垫片 = 宿主 pluginStore.subscribeLocale 的形状(返回退订函数);emitLocale() 手动播一次。
const localeSubs = new Set()
const emitLocale = () => { for (const f of Array.from(localeSubs)) f() }
const OPENED = { openFile: [], loadPage: [], openNote: [] } // 打开笔记走了哪条路,由下面的断言钉方向
const VAULT = { root: '/Users/x/My Vault' }  // 带空格:存档目录拼出来必须原样带着
const readiness = [] // ctx.registerReadiness 的注册(宿主 2026-09-21+;旧宿主没有,main.js 必须可选链)
const ctx = {
  registerView: (v) => reg.views.push(v), registerCommand: (c) => reg.commands.push(c),
  registerListSource: (x) => reg.listSources.push(x), // 统一左栏数据源(宿主 2026-08-25+)
  registerReadiness: (r) => { readiness.splice(0, readiness.length, ...readiness.filter((o) => o.id !== r.id), r) }, // 宿主同款:同 id 覆盖
  // 宿主同款:设置**同 key 覆盖**(pluginStore.registerSetting 先按 pluginId+key filter 再 append)
  registerSetting: (s) => { reg.settings = reg.settings.filter((o) => o.key !== s.key); reg.settings.push(s) },
  // 宿主同款:状态栏返回 update/dispose 句柄,update 原位改
  registerStatusItem: (s) => { const item = { ...s }; reg.status.push(item); return { update: (p) => Object.assign(item, p), dispose: () => { item.disposed = true } } },
  subscribeLocale: (cb) => { localeSubs.add(cb); return () => localeSubs.delete(cb) },
  notify() {}, activity: { log() {} }, openView() {},
  app: { notify() {}, writeFile: async () => {}, openFile(p) { OPENED.openFile.push(p) }, loadPage(p) { OPENED.loadPage.push(p) }, readFile: async () => null,
    vaultRoot: () => VAULT.root },
}
const dispose = new Function('ctx', src)(ctx)
// 上面 ctx.app 的读写走内存 vault:队列/建夹断言要看落盘轨迹
const V = new Map(); const writes = []
ctx.app.readFile = async (p) => (V.has(p) ? V.get(p) : null)
ctx.app.writeFile = async (p, t) => { V.set(p, t); writes.push(p) }

// ── 贡献点契约 ──
A.equal(typeof dispose, 'function', 'setup 应返回 disposer')
A.ok(reg.views.find((v) => v.id === 'folder' && typeof v.mount === 'function'), '应注册 folder 视图')
// 2.0.0:自绘 library 视图已移除 —— 收藏夹左栏改由宿主统一工作区视图渲染本插件的列表源,
// 只此一套 UI(两套并存会让用户在旧布局里看到旧面)。这里反过来断言它**不再注册**。
A.ok(!reg.views.find((v) => v.id === 'library'), '不应再注册自绘 library 视图(左栏已统一)')
A.ok(reg.listSources && reg.listSources.find((x) => x.id === 'library-list'), '应注册 library-list 列表源(统一左栏数据源)')
A.ok(reg.commands.find((c) => c.id === 'bluebird-open'), '应注册 bluebird-open 命令')
A.ok(reg.commands.find((c) => c.id === 'bluebird-library'), '应注册 bluebird-library 命令')
A.deepEqual(reg.settings.map((s) => s.key).sort(), ['autoSave', 'defaultTemplate', 'detail', 'saveMedia'], '应声明四个设置(存储夹已改用宿主标准 workFolder)')
A.equal(localeSubs.size, 1, '顶层应订一次宿主语言广播(状态栏 + 设置项就地换语言)')

// ── 工作文件夹约定(1.3.0):默认走宿主 workFolder;老宿主退回 videos;saveFolder 一次性迁移 ──
A.equal(_ls.get('plugin.bluebird.workFolder'), 'myvids', '1.2.x 自定义 saveFolder 应迁移为 workFolder')
A.ok(!_ls.has('plugin.bluebird.saveFolder'), '迁移后旧 saveFolder 键应删除')

// ── 纯函数 ──
const T = globalThis.__BLUEBIRD_TEST__
for (const k of ['inline', 'renderMarkdown', 'linkifyTimestamps', 'safeHref', 'deriveTitle', 'sanitizeFileName', 'today', 'parsePlatform', 'extractUrl', 'isSupported', 'parseAgentOutput', 'fmtTime', 'toSRT', 'toTXT', 'toObsidian', 'onColorOf', 'readableOn', 'contrast']) {
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
A.ok(!src.includes('::-webkit-scrollbar'), '插件不得覆盖宿主原生滚动条样式')
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

// 图文剪藏:独占一行的 ![](https://…) 渲染成 <img>;非 https 一律不渲染(宿主 CSP img-src 也是这一档)
const box3 = mkEl('div')
T.renderMarkdown(box3, '# 标题\n\n![图一](https://cdn.x/a.jpg?w=1)\n\n正文\n\n![坏](javascript:alert(1))\n\n![也坏](http://cdn.x/b.jpg)')
const imgs = findAll(box3, 'img')
A.equal(imgs.length, 1, '只应渲染那一张 https 图')
A.equal(imgs[0].attrs.src, 'https://cdn.x/a.jpg?w=1', '图片 src 原样(查询串不能丢,小红书 CDN 靠它取图)')
A.equal(imgs[0].attrs.alt, '图一')
A.equal(findAll(box3, 'h1').length, 1, '图片行不该吃掉标题')

// 铺垫句:标题前那句「我先按技能…」要掐掉(2026-08-22 实跑里模型真写了,会原样存进笔记)
A.equal(T.stripPreamble('我先按技能抓取内容。\n\n# 标题\n\n正文'), '# 标题\n\n正文', '首标题前的铺垫应掐掉')
A.equal(T.stripPreamble('# 标题\n\n正文'), '# 标题\n\n正文', '本来就以标题开头的不动')
A.equal(T.stripPreamble('没有标题的一段话'), '没有标题的一段话', '整篇无标题时不许裁(会吃掉正文)')
A.equal(T.stripPreamble('- 要点一\n- 要点二\n\n## 小节'), '- 要点一\n- 要点二\n\n## 小节', '标题前是列表=正文,不是铺垫')
A.equal(T.stripPreamble('![[cover.jpg]]\n\n# 标题'), '![[cover.jpg]]\n\n# 标题', '标题前是图=正文,不是铺垫')
A.equal(T.stripPreamble(''), '')

// 存档件 ![[名]]:图 → img、音频 → audio(带 controls)、认不出的后缀 → 不造元素
const box4 = mkEl('div')
T.renderMarkdown(box4, '![[bluebird-a-01.jpg]]\n\n![[bluebird-a.m4a]]\n\n![[bluebird-a.mp4]]\n\n![[x.exe]]')
const wlImg = findAll(box4, 'img'), wlAud = findAll(box4, 'audio'), wlVid = findAll(box4, 'video')
A.equal(wlImg.length, 1); A.equal(wlAud.length, 1); A.equal(wlVid.length, 1)
A.equal(wlImg[0].attrs.src, `amadeus-asset://v/${encodeURIComponent(T.assetVaultRel('bluebird-a-01.jpg'))}`,
  '存档件应经 amadeus-asset:// 直出,整条 vault 相对路径 encodeURIComponent(照 toAssetUrl)')
A.equal(wlAud[0].attrs.controls, 'controls', '音频要给播放控件')
A.ok(!findAll(box4, 'embed').length && box4.textContent.includes('x.exe'), '认不出的后缀原样落成文字,不自造文件卡')

// 存档目录:默认开(宿主在「值=默认」时删键 → 判据必须是 !== 'false')
A.equal(T.mediaSaveDir(), `/Users/x/My Vault/${T.folderRoot()}/assets`, '默认应开启存档,且路径里的空格原样保留')
localStorage.setItem('plugin.bluebird.saveMedia', 'false')
A.equal(T.mediaSaveDir(), null, '关掉开关就不存档')
localStorage.setItem('plugin.bluebird.saveMedia', 'true')
VAULT.root = null
A.equal(T.mediaSaveDir(), null, '云端库/未开库没有本机路径,不能存档')
VAULT.root = '/Users/x/My Vault'

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

// 分享页地址(写进笔记正文的时间戳链接用它;播放器地址只给我们自己端内的 iframe)
A.ok(/youtube\.com\/watch\?v=dQw4w9WgXcQ&t=90s/.test(yt.watch(90)), 'YouTube watch() 应给分享页 + t=90s')
A.ok(!/t=/.test(yt.watch(0)), 't=0 不必写进链接')
A.ok(/bilibili\.com\/video\/BV1xx411c7mD\?t=90/.test(bili.watch(90)), 'Bilibili watch() 应给分享页 + ?t=90')
A.ok(!/player\.bilibili/.test(bili.watch(90)), '⚠️ 播放器地址绝不能写进笔记(离开我们端内就是个裸播放器页)')

// ── [MM:SS] 升格成锚点(青鸟升级的核心:此前是纯文本,只在青鸟自绘视图里可点) ──
{
  const md = '# 标题\n\n[01:35] 讲到缓存\n\n[1:02:30] 收尾\n'
  const online = T.linkifyTimestamps(md, bili.watch, '')
  A.ok(/\[01:35\]\(https:\/\/www\.bilibili\.com\/video\/BV1xx411c7mD\?t=95\)/.test(online), '在线源应升格成标准 md 链接')
  A.ok(/\[1:02:30\]\(.*t=3750\)/.test(online), 'HH:MM:SS 也要认')

  const local = T.linkifyTimestamps(md, bili.watch, '存档.m4a')
  A.ok(/\[\[存档\.m4a#t=95\|01:35\]\]/.test(local), '已存档本地素材应走宿主 wiki 锚(可就地 seek)')
  A.ok(!/https:/.test(local), '有本地存档时不该再写外链')

  // 围栏内不许动:日志/数组下标里的 [00:12] 不是时间戳
  const fenced = T.linkifyTimestamps('```\n[00:12] log line\n```\n\n[00:12] 正文\n', bili.watch, '')
  A.ok(/```\n\[00:12\] log line\n```/.test(fenced), '⚠️ 代码围栏内的 [MM:SS] 必须原样保留')
  A.ok(/\[00:12\]\(https:/.test(fenced), '围栏外的仍要升格')

  // 已经是链接的不许二次包装(会把语法拧坏)
  const already = T.linkifyTimestamps('[01:35](https://x.com/a) 尾巴\n', bili.watch, '')
  A.equal(already.trim(), '[01:35](https://x.com/a) 尾巴', '已是链接的时间戳应原样不动')

  // 无 watch()(抖音/小红书/音乐三家)→ 原样保留,绝不造死链接
  A.equal(T.linkifyTimestamps('[01:35] x\n', null, '').trim(), '[01:35] x', '没有分享页地址时原样保留')
}

// 原生跨 View 时间引用:显式条目绑定、严格解析、旧格式不改盘。
{
  A.deepEqual(T.parseTimeReference('#bluebird=entry-1&t=83'), { entryId: 'entry-1', at: 83 })
  A.deepEqual(T.parseTimeReference('#bluebird=entry-1&t=1:02:30'), { entryId: 'entry-1', at: 3750 })
  for (const href of ['#bluebird=../other&t=1', '#bluebird=x&t=', '#bluebird=x&t=-1', '#bluebird=x&t=Infinity', '#bluebird=x&t=1&t=2', '#bluebird=x&t=01:99', 'javascript:alert(1)', 'https://example.com/#bluebird=x&t=2']) A.equal(T.parseTimeReference(href), null, href)
  A.equal(T.linkifyTimestamps('[01:23]', null, '', 'entry-1'), '[01:23](#bluebird=entry-1&t=83)')
  const untouched = '`[01:23]`\n[[01:23]]\n[01:23](https://example.com)\n[01:23]: /url\n\\[01:23]\n[01:99]\n```js\n[01:23]\n```'
  A.equal(T.linkifyTimestamps(untouched, null, '', 'entry-1'), untouched, '代码、wiki、已有链接、引用定义、转义和非法时间不改写')
  A.equal(T.archivedMediaName('![[原片.mp4]]'), '原片.mp4')
  A.equal(T.archivedMediaName('![[../原片.mp4]]'), null)
  const entry = { id: 'entry-1', sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
  A.deepEqual(T.legacyTimeReference('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s', entry), { entryId: 'entry-1', at: 90 })
  A.equal(T.legacyTimeReference('https://www.youtube.com/watch?v=another&t=90s', entry), null)
  A.equal(T.legacyTimeReference('https://evil.example/watch?v=dQw4w9WgXcQ&t=90s', entry), null)
  V.set('videos/.bluebird/time-a.json', JSON.stringify({ id: 'time-a', notePath: 'a.md' }))
  V.set('videos/.bluebird/time-b.json', JSON.stringify({ id: 'time-b', notePath: 'b.md' }))
  V.set('a.md', '---\nbluebird_id: time-a\n---\n[00:14]')
  V.set('b.md', '---\nbluebird_id: time-b\n---\n[00:32]')
  const beforeWrites = writes.length
  A.equal((await T.entryForNote('a.md')).id, 'time-a')
  A.equal((await T.entryForNote('b.md')).id, 'time-b')
  A.equal(await T.entryForNote('unrelated.md'), null)
  A.equal(writes.length, beforeWrites, '旧笔记兼容只读,不重写正文')
  const calls = []
  const scope = T.playbackScope()
  const a = { scope, native: true, visible: () => true, entryId: () => 'time-a', open: ref => calls.push(['a', ref.at]) }
  const b = { scope, native: true, visible: () => true, entryId: () => 'time-b', open: ref => calls.push(['b', ref.at]) }
  T.playbackTargets.add(a); T.playbackTargets.add(b)
  T.requestTimestamp({ entryId: 'time-b', at: 32 })
  T.requestTimestamp({ entryId: '../escape', at: 0 })
  A.deepEqual(calls, [['b', 32]], '多播放器只定位引用对应的条目')
  T.playbackTargets.delete(a); T.playbackTargets.delete(b)
  V.delete('videos/.bluebird/time-a.json'); V.delete('videos/.bluebird/time-b.json'); V.delete('a.md'); V.delete('b.md')
}
A.equal(T.isSupported('https://example.com/x'), false)

// 音乐三家:识别得出、都不内嵌(宿主 CSP frame-src 没放行音乐播放器)、进得了输入框
const wy = T.parsePlatform('https://music.163.com/#/song?id=1330348068')
A.equal(wy.platform, 'netease'); A.equal(wy.videoId, '1330348068')
A.equal(T.parsePlatform('https://music.163.com/song?id=186016').videoId, '186016')
const qq = T.parsePlatform('https://y.qq.com/n/ryqq/songDetail/004Z8Ihr0JIu5s')
A.equal(qq.platform, 'qqmusic'); A.equal(qq.videoId, '004Z8Ihr0JIu5s')
A.equal(T.parsePlatform('https://y.qq.com/n/yqq/song/004Z8Ihr0JIu5s.html').videoId, '004Z8Ihr0JIu5s')
const am = T.parsePlatform('https://music.apple.com/cn/album/x/1444818058?i=1444818070')
A.equal(am.platform, 'applemusic'); A.equal(am.videoId, '1444818070')
A.equal(T.parsePlatform('https://music.apple.com/us/song/hey-jude/1441133101').videoId, '1441133101')
for (const u of ['https://music.163.com/#/song?id=1', 'https://163cn.tv/abc', 'https://y.qq.com/n/ryqq/songDetail/x', 'https://music.apple.com/us/song/x/1']) {
  A.equal(T.isSupported(u), true, `音乐链接应进得了输入框:${u}`)
  A.equal(T.isMusic(T.parsePlatform(u).platform), true, `应判定为音乐平台:${u}`)
  A.equal(T.parsePlatform(u).embed, null, `音乐平台不给内嵌播放器:${u}`)
}
A.equal(T.isMusic('bilibili'), false, '视频平台不许走音乐支线')

// 打开笔记:裸 .md 必须走 loadPage(在 Amadeus 里开)。宿主的 openFile 对没有插件文件类型认领的
// 裸 .md 会回落 openVaultFile = 系统默认程序(TextEdit)。⚠️这条断言的方向就是 bug 本身,别写反。
OPENED.openFile.length = 0; OPENED.loadPage.length = 0
T.openNotePath('青鸟收藏夹/2026-08-21-起风了.md')
A.deepEqual(OPENED.loadPage, ['青鸟收藏夹/2026-08-21-起风了.md'], '裸 .md 应走 loadPage 在 Amadeus 里打开')
A.deepEqual(OPENED.openFile, [], '裸 .md 绝不许走 openFile(会甩给系统默认程序,笔记在 TextEdit 里开)')
T.openNotePath('')
A.deepEqual(OPENED.loadPage.length, 1, '空路径不该触发打开')
ctx.app.openNote = (p, options) => OPENED.openNote.push({ p, options })
T.openNotePath('青鸟收藏夹/2026-09-19-原生分栏.md', false)
A.deepEqual(OPENED.openNote, [{ p: '青鸟收藏夹/2026-09-19-原生分栏.md', options: { reuseKey: 'bluebird-document', activate: false } }],
  '新宿主应把笔记后台同步进 Bluebird 的 Amadeus 伴随栏')
A.equal(OPENED.loadPage.length, 1, '有 openNote 时不应再绕回活动页 loadPage')
delete ctx.app.openNote
A.equal(T.isMusic(''), false)
// 平台名三语键都在(en 侧无中文由下面的词表对齐循环兜)
for (const p of ['netease', 'qqmusic', 'applemusic']) A.ok(T.platLabel(p) && T.platLabel(p) !== T.platLabel('zzz'), `${p} 应有平台显示名`)

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
A.equal(q1.status, 'pending'); A.equal(q1.progressKey, 'stQueued'); A.equal(T.qStageText(q1), '排队中')
const q2 = T.qAdd('https://youtu.be/abc12345678', '通用', 'brief')
T.qCancel(q2.id) // pending 时取消 → 直接标错,不会被泵拾起
await new Promise((r) => setTimeout(r, 40))
A.equal(q1.status, 'error', '无引擎环境应落 error'); A.equal(q1.errKey, 'errNoEngine'); A.ok(T.qErrText(q1).includes('引擎'), T.qErrText(q1))
A.equal(q2.status, 'error'); A.equal(q2.errKey, 'canceled'); A.equal(T.qErrText(q2), '已取消')
// 队列项存的必须是**键**不是渲染好的串(否则入队那一刻的语言会被永久冻住,见 1.5.1)
A.equal(q1.error, '', '有词表键时不许再往 error 里塞成品串')
A.equal(T.qErrText({ errKey: '', error: 'boom from engine' }), 'boom from engine', '引擎回的原始错误没有键 → 裸串照出')
T.queue.items.push({ id: 'done1', status: 'completed' })
T.qClearDone()
A.ok(!T.queue.items.find((i) => i.id === 'done1'), '清除已完成应移除 completed 项')
A.ok(T.queue.items.find((i) => i.id === q1.id), '清除已完成不动 error 项')
T.qRemove(q1.id); T.qRemove(q2.id)
A.equal(T.queue.items.length, 0, '移除后队列应清空')

// 阶段映射:pct 单调有据 + 五态过程枚举(parsing/transcribing);**返回键不返回串**(1.5.1)
A.deepEqual(T.stageOf({ type: 'status', payload: { state: 'queued' } }, ''), { pct: 10, key: 'stQueued', st: 'parsing' })
A.equal(T.stageText('stQueued'), '排队中', 'stageOf 的键渲染时才落地成当前语言')
A.equal(T.stageOf({ type: 'tool_call', payload: { name: 'run_bash' } }, '').st, 'transcribing')
A.equal(T.stageText('stgTool', { name: '' }), '调用 工具', '工具名缺失时的兜底词也得跟着语言走,不许在采集时冻住')
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
{
  const root = VAULT.root, read = ctx.app.readFile
  VAULT.root = null
  let reads = 0
  ctx.app.readFile = async () => { reads++; VAULT.root = root; return null }
  await T.ensureWorkFolder()
  A.equal(reads, 0, '库未就绪时不得把静默 null 当成索引缺失')
  A.equal(writes.length, wN, '冷启期间不能写空索引覆盖收藏')
  VAULT.root = root
  // 模拟读索引期间切库
  ctx.app.readFile = async () => { VAULT.root = '/another-vault'; return null }
  await T.ensureWorkFolder()
  A.equal(writes.length, wN, '索引读取期间换库不能向新库写空索引')
  VAULT.root = root
  ctx.app.readFile = read
  V.set('青鸟收藏夹/.bluebird-index.json', '{broken index')
  await T.ensureWorkFolder()
  A.equal(V.get('青鸟收藏夹/.bluebird-index.json'), '{broken index', '损坏索引也应保留,不能初始化覆盖')
}

// ── 2.0.3 回归闸:订阅时必须重读索引(「明明有记录列表却是空」的根因) ──
// 插件是在宿主**启动期**被激活的,那一刻 vault 根还没恢复(宿主的 vault 引导是懒的),
// 顶层那次 listReload 拿到的是 readFile 的**静默 null**(不抛),lidx 就此定格为空,
// 此后只有 'saved' 才救得回来 —— 冷启进青鸟 Space 谁也不存东西,于是列表恒空。
// 宿主挂载列表面/切库都会重订阅,所以 subscribe() 是重读的正确门。
{
  const LS = reg.listSources.find((x) => x.id === 'library-list')
  V.set(`${T.folderRoot()}/.bluebird-index.json`, JSON.stringify({ folders: [], items: [
    { id: 'boot1', title: '库落地之后才读得到', platform: 'bilibili', date: '2026-08-28' },
  ] }))
  A.ok(!LS.items({}).some((r) => r.key === 'boot1'), '前提:此刻列表源还没读过这份新索引')
  const off = LS.subscribe(() => {})
  await new Promise((r) => setTimeout(r, 10))
  A.ok(LS.items({}).some((r) => r.key === 'boot1'), 'subscribe() 必须触发一次 listReload,否则启动期读空的列表永远回不来')
  A.equal(typeof off, 'function', 'subscribe() 仍须返回退订函数')
  off()
}

// ── 2.0.2 列表源行首图标:平台官方 favicon(iconUrl),取不到才退词表键 ──
// lidx 是列表源的闭包私有态,外面只能借一条**会 listReload** 的动作把索引灌进去:
// 删一个不存在的 key = 索引原样重写 + reload,无副作用。
{
  const LS = reg.listSources.find((x) => x.id === 'library-list')
  V.set(`${T.folderRoot()}/.bluebird-index.json`, JSON.stringify({ folders: [], items: [
    { id: 'i1', title: 'B 站视频', platform: 'bilibili', date: '2026-08-28' },
    { id: 'i2', title: '网易云单曲', platform: 'netease', date: '2026-08-28' },
    { id: 'i3', title: '不认识的来源', platform: '', date: '2026-08-28' },
  ] }))
  LS.itemMenu({ key: '__absent__' }).find((a) => a.id === 'delete').run()
  await new Promise((r) => setTimeout(r, 10))
  const rows = LS.items({})
  const by = (k) => rows.find((r) => r.key === k)
  A.equal(rows.length, 3, '列表源应投出三条(索引已灌进去)')
  A.equal(by('i1').iconUrl, 'https://www.bilibili.com/favicon.ico', 'bilibili 条目应带平台官方 favicon')
  A.equal(by('i2').iconUrl, 'https://s1.music.126.net/style/favicon.ico', '音乐平台同样走 favicon,不是只有视频站')
  A.equal(by('i3').iconUrl, undefined, '无平台的条目不给 iconUrl —— 留空才会退到词表图标')
  A.equal(by('i1').icon, 'link', '词表键必须仍在:老宿主不认 iconUrl,靠它兜底')
  A.equal(by('i2').icon, 'bookmark', '音乐的词表兜底仍是书签')
}

// ── 双语(1.5.0)①词表:两侧键集合必须完全相等;en 侧不许留中文;占位符两侧对齐 ──
const zhKeys = Object.keys(T.MSG.zh).sort(), enKeys = Object.keys(T.MSG.en).sort()
A.deepEqual(enKeys, zhKeys, 'MSG.zh 与 MSG.en 的键集合必须完全相等(漏翻一条就红)')
const CJK_RE = /[一-鿿]/
const phOf = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',')
for (const k of zhKeys) {
  A.ok(String(T.MSG.zh[k]).length > 0 && String(T.MSG.en[k]).length > 0, `MSG.${k} 两侧都不许是空串`)
  A.ok(!CJK_RE.test(String(T.MSG.en[k])), `MSG.en.${k} 里还有中文:${T.MSG.en[k]}`)
  A.equal(phOf(T.MSG.en[k]), phOf(T.MSG.zh[k]), `MSG.${k} 两侧的 {占位符} 不一致`)
}

// ── 双语 ②切 en:渲染层真的吐英文(mock ctx 的 getLocale 就是宿主那个接缝) ──
// 先在中文界面下灌一条**已存在**的失败队列项:切语言后它必须跟着换语言(1.5.1 回归闸;
// 此前 error/progressLabel 存的是入库那一刻渲染好的串 → 英文界面里永久残留「请先登录 Forsion」)
const stale = T.qAdd('https://youtu.be/dQw4w9WgXcQ', '通用', 'standard')
await new Promise((r) => setTimeout(r, 40))
A.equal(T.qErrText(stale), '未连接到 Tangu 引擎', '入队时应是中文')
ctx.getLocale = () => 'en'
A.equal(T.qErrText(stale), 'Not connected to the Tangu engine', '**已在队列里**的旧错误项必须跟着切语言')
A.equal(T.qStageText(stale), 'Queued', '**已在队列里**的旧阶段文案必须跟着切语言')
T.qRemove(stale.id)
A.equal(T.L(), 'en', 'L() 应现读 ctx.getLocale,不缓存')
// 语言广播:状态栏就地更新;设置项同 key 重注册(宿主是覆盖不是 append,所以不许长出重复行)
emitLocale()
A.equal(reg.status[0].text, '🐦 Bluebird', '状态栏项应经 update() 就地换成英文')
A.equal(reg.status[0].title, 'Open Bluebird')
A.deepEqual(reg.settings.map((s) => s.key), ['defaultTemplate', 'detail', 'saveMedia', 'autoSave'], '切语言重注册设置不许长出重复行,顺序也不许变')
A.equal(reg.settings[0].label, 'Default summary template', '设置项标签应跟着切语言(宿主 registerSetting 同 key 覆盖)')
A.equal(reg.settings[1].label, 'Default detail level (brief/standard/detailed)')
A.equal(reg.settings[2].label, 'Archive media')
A.equal(reg.settings[3].label, 'Enhanced auto mode')

// ── 增强自动模式:开关必须落进 vault 镜像文件 ───────────────────────────────
// 引擎进程里的「青鸟链接收藏」技能读不到渲染进程的 localStorage,只能读这个文件。
{
  const before = writes.length
  A.equal(await T.mirrorLinkMode(), false, '值没变不该重复落盘(30s 轮询不许每跳都写)')
  _ls.set('plugin.bluebird.autoSave', 'true')
  A.equal(await T.mirrorLinkMode(), true, '开关翻开必须写镜像文件')
  A.deepEqual(JSON.parse(V.get(T.MODE_FILE)), { autoSave: true }, '镜像内容 = {autoSave:true}')
  _ls.set('plugin.bluebird.autoSave', 'false')
  await T.mirrorLinkMode()
  A.deepEqual(JSON.parse(V.get(T.MODE_FILE)), { autoSave: false }, '关掉必须回写 false —— 留着 true 会让技能一直自动存')
  A.equal(writes.length, before + 2, '两次真变更 = 两次落盘')
  // 关着 + 库里没有这个文件(例:切到一个没用过本功能的库)→ 不许凭空造
  _ls.set('plugin.bluebird.autoSave', 'true'); await T.mirrorLinkMode()
  V.delete(T.MODE_FILE)
  _ls.set('plugin.bluebird.autoSave', 'false')
  A.equal(await T.mirrorLinkMode(), false, '关着且库里没有该文件 → 不许凭空造(没用过本功能的库应保持干净)')
  A.equal(V.has(T.MODE_FILE), false, '上一条不许顺手写出文件')
}
A.equal(T.t('queueTitle'), 'Analysis queue', 'en 下 t() 应给英文串')
A.equal(T.badge('xiaohongshu').textContent, 'Xiaohongshu', 'en 下平台徽标(真 DOM 节点)应渲染英文')
A.equal(T.wordState(100, 'brief'), 'Too short', 'en 下字数横幅应是英文')
A.equal(T.stageText(T.stageOf({ type: 'status', payload: { state: 'queued' } }, '').key), 'Queued', 'en 下进度阶段文案应是英文')
A.equal(T.stageText('stgTool', { name: '' }), 'Running tool', 'en 下工具名兜底也应是英文')
A.equal(T.tplLabel('学术'), 'Academic', 'en 下模板显示名是英文,而值仍是中文 canonical')
A.equal(T.detailLabel('detailed'), 'Detailed', 'en 下详细度显示名应是英文')
A.equal(T.deriveTitle(''), 'Video summary', 'en 下产出标题兜底应是英文')
A.equal(T.t('hintCountOne', { n: 1 }), ' · 1 segment', 'en 下 1 条字幕要用单数(不许硬拼 "1 segments")')
A.ok(!/[＋]/.test(T.MSG.en.libNew + T.MSG.en.libAddFolder), 'en 侧不许用全角＋(在拉丁文本里撑一格)')
const enQ = T.qAdd('https://youtu.be/dQw4w9WgXcQ', '通用', 'brief')
A.equal(T.qStageText(enQ), 'Queued', 'en 下新入队项的阶段文案应是英文')
await new Promise((r) => setTimeout(r, 40))
A.equal(T.qErrText(enQ), 'Not connected to the Tangu engine', 'en 下队列错误文案应是英文')
T.qRemove(enQ.id)
A.equal(T.queue.items.length, 0)

// ── 双语 ②′ 切语言重画不许吞掉用户正在编辑的现场(1.5.1 回归闸:repaint 整树重建前后搬运) ──
// QA 记录只活在 DOM 里(没有 state 备份),抹了就是真丢 —— 所以这里断言的是节点**同一性**。
const snapHome = T.snapshotStage({ querySelector: (s) => ({
  '[data-url]': { value: 'https://www.bilibili.com/video/BV1xx411c7mD' },
  '[data-tpl]': { value: '学术' }, '[data-detail]': { value: 'detailed' },
}[s] || null) }, 'home')
const freshHome = { '[data-url]': { value: '' }, '[data-tpl]': { value: '通用' }, '[data-detail]': { value: 'standard' } }
T.restoreStage({ querySelector: (s) => freshHome[s] || null }, snapHome)
A.equal(freshHome['[data-url]'].value, 'https://www.bilibili.com/video/BV1xx411c7mD', '切语言不许吞掉刚粘的链接')
A.equal(freshHome['[data-tpl]'].value, '学术', '切语言不许把模板打回默认')
A.equal(freshHome['[data-detail]'].value, 'detailed', '切语言不许把详细度打回默认')
const qaAsk = { m: 'q1' }, qaAns = { m: 'a1' }
const snapDetail = T.snapshotStage({ querySelector: (s) => ({
  '[data-qalog]': { children: [qaAsk, qaAns] }, '[data-qin]': { value: '正在打字的下一个问题' },
}[s] || null) }, 'detail')
const freshLog = { children: [], appendChild(n) { this.children.push(n) } }
const freshQin = { value: '' }
T.restoreStage({ querySelector: (s) => (s === '[data-qalog]' ? freshLog : s === '[data-qin]' ? freshQin : null) }, snapDetail)
A.equal(freshLog.children.length, 2, '切语言必须把整段 QA 记录搬过去')
A.equal(freshLog.children[0], qaAsk, '搬的应是原节点本身(不是复制,时间戳 handler 才还能用)')
A.equal(freshLog.children[1], qaAns)
A.equal(freshQin.value, '正在打字的下一个问题', '切语言不许吞掉还没发出去的那句提问')
// 纯函数绿了但调用点被删掉,用户照样丢内容 → 连调用点一起钉住(node 里挂不起真视图,只能盯源码)
const repaintSrc = /function repaint\(\) \{[\s\S]*?\n  \}/.exec(src)
A.ok(repaintSrc, '应能定位到 repaint()')
A.ok(/snapshotStage\(/.test(repaintSrc[0]) && /restoreStage\(/.test(repaintSrc[0]), 'repaint() 必须先快照现场再回填,不许整树重建了事')
A.ok(!/progressLabel/.test(src), '队列项不许再存渲染好的阶段串(progressLabel):存 progressKey,渲染时才 t()')

// ── 双语 ③切回中文:中文界面必须原样还在(不许为了过门禁把中文串删掉了事) ──
ctx.getLocale = () => 'zh'
A.equal(T.badge('xiaohongshu').textContent, '小红书', '切回 zh 后中文界面必须原样还在')
A.equal(T.wordState(100, 'brief'), '字数偏少')
A.equal(T.tplLabel('学术'), '学术')
delete ctx.getLocale
A.equal(T.L(), 'zh', '旧宿主(无 getLocale)必须回退中文 canonical')
A.equal(T.t('queueTitle'), '分析队列')

// ── Unit / Web: local collection is independent of Server, engine and account ──
{
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Network must not be used for a plain bookmark') }
  globalThis.window = { tangu: { unitPage: true, executionCapabilities: { host: false }, getConfig: async () => ({}) } }
  _ls.set('forsion_token', 'unrelated-old-account-token')
  try {
    A.equal((await T.getCfg()).backendUrl, '', 'an unavailable Unit engine must not silently fall back to /api')
    A.equal((await T.getCfg()).token, '', 'Unit must never borrow the legacy global account token')
    const a = await T.saveLink('https://example.test/offline?one=1')
    const b = await T.saveLink('https://example.test/offline?two=2')
    A.notEqual(a.notePath, b.notePath, 'bookmarks with the same title must not overwrite each other')
    A.ok(V.get(a.notePath).includes('https://example.test/offline?one=1'))
    A.ok(V.get(b.notePath).includes('https://example.test/offline?two=2'))
    const bookmark = await T.loadEntry(a.id)
    A.equal(bookmark.kind, 'link', 'bookmark sidecar must survive a fresh read')
    A.ok(bookmark.savedAt, 'bookmark stores its actual save time')
    A.equal(bookmark.generatedAt, undefined, 'a plain link was saved, not generated by AI')
    A.ok(V.get(a.notePath).includes('收藏'), 'plain bookmark note header must say saved')
    A.ok((await T.readIndex()).items.some((item) => item.id === b.id && item.kind === 'link'), 'bookmark kind is retained in the normal index')
    A.equal(T.httpLink('Read this https://example.test/offline?one=1 later').href, 'https://example.test/offline?one=1', 'generic links also support share text')
    await A.rejects(T.saveLink('javascript:alert(1)'), /HTTP/)
    A.equal(requests, 0, 'saving, reading and invalid link rejection must make zero network requests')
    for (const locale of ['zh', 'en']) {
      ctx.getLocale = () => locale
      const markup = T.bookmarkDetailMarkup()
      A.ok(markup.includes(T.t('linkContentHint')), 'bookmark states that page content was not fetched')
      A.ok(markup.includes('data-summary') && markup.includes('data-gen'), 'bookmark retains content and saved-time surfaces')
      for (const selector of ['data-media', 'data-qin', 'data-ask', 'data-transcript', 'data-tab', 'data-hint', 'data-restart']) {
        A.ok(!markup.includes(selector), 'bookmark must not show video/AI controls: ' + selector)
      }
      A.ok(!markup.includes(T.t('hintSummary')))
      A.ok(!markup.includes(T.t('qaPlaceholder')))
      A.equal(T.t('linkLabel'), locale === 'en' ? 'Link' : '链接')
      A.equal(T.t('savedAt', { time: 'fixture' }), locale === 'en' ? 'Saved fixture' : '保存于 fixture')
    }
    delete ctx.getLocale

    VAULT.root = 'cloud://tenant-vault'
    A.equal(T.mediaSaveDir(), null, 'cloud root is not a writable host path')
    VAULT.root = '/vault'
    A.equal(T.mediaSaveDir(), null, 'Unit virtual/remote roots need an explicit same-host path mapping')
    ctx.app.hostPath = () => null
    A.equal(T.mediaSaveDir(), null, 'explicit unavailable host mapping must not trigger desktop fallback')
    ctx.app.hostPath = (p) => '/unit/local-vault/' + p
    A.equal(T.mediaSaveDir(), '/unit/local-vault/' + T.folderRoot() + '/assets')
    delete ctx.app.hostPath

    A.equal(T.archivedAssetUrl('cover.jpg'), '', 'browser without an asset bridge must not emit Electron-only URLs')
    ctx.app.assetUrl = (p) => '/web/vault/asset?path=' + encodeURIComponent(p) + '&token=asset-scope'
    const box = mkEl('div')
    T.renderMarkdown(box, '![[cover.jpg]]\n\n![[audio.m4a]]')
    A.equal(findAll(box, 'img')[0].attrs.src, '/web/vault/asset?path=' + encodeURIComponent(T.assetVaultRel('cover.jpg')) + '&token=asset-scope')
    A.equal(findAll(box, 'audio')[0].attrs.controls, 'controls')
    for (const p of ['../cover.jpg', '..\\cover.jpg', '/cover.jpg']) A.equal(T.archivedAssetUrl(p), '', 'archive names may not escape their folder')
    delete ctx.app.assetUrl

    window.tangu.getConfig = async () => ({ backendUrl: '/web/engine/', token: 'unit-owner-session', modelId: 'fixture' })
    let cfg = await T.getCfg()
    A.equal(T.engineError(cfg), 'errNoHostExecution')
    await A.rejects(T.runAgent(cfg, 'session', 'Analyze', null), /本机执行/)
    A.equal(requests, 0, 'unsupported execution must fail before submitting a task')
    window.tangu.executionCapabilities.host = true
    cfg = await T.getCfg()
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      if (calls.length === 1) return new Response(JSON.stringify({ runId: 'local-run' }), { status: 200 })
      return new Response('data: {"seq":1,"type":"done","payload":{"content":"# Local engine result"}}\n\n', { status: 200 })
    }
    A.equal(await T.runAgent(cfg, 'session', 'Analyze', null), '# Local engine result')
    A.equal(calls[0].url, '/web/engine/agent/runs')
    A.equal(calls[0].options.headers.Authorization, 'Bearer unit-owner-session')
    A.equal(JSON.parse(calls[0].options.body).agent_config.agentSlug, 'bluebird')
    A.equal(JSON.parse(calls[0].options.body).agent_config.execMode, 'host')
    A.equal(calls[1].url, '/web/engine/agent/runs/local-run/events?fromSeq=0')
    await A.rejects(T.asrTranscribeFile('/unit/audio.wav'), /未提供音频文件转写/)
    window.tangu.transcribeAudioFile = async (p, options) => {
      A.equal(p, '/unit/audio.wav'); A.equal(options.timestamps, true)
      return { text: 'Caption', segments: [{ start: 0, end: 2, text: 'Caption' }] }
    }
    A.deepEqual(await T.asrTranscribeFile('/unit/audio.wav'), { text: 'Caption', segments: [{ start: 0, end: 2, text: 'Caption' }] })
  } finally {
    globalThis.fetch = originalFetch
    delete globalThis.window
    _ls.delete('forsion_token')
    VAULT.root = '/Users/x/My Vault'
    delete ctx.app.hostPath; delete ctx.app.assetUrl
    delete ctx.getLocale
  }
  // Legacy desktop fallback remains available, while a cloud URI is never treated as a path.
  VAULT.root = 'cloud://vault-id'
  A.equal(T.mediaSaveDir(), null)
  VAULT.root = 'relative-vault'
  A.equal(T.mediaSaveDir(), null)
  VAULT.root = 'C:\\Users\\A\\Vault'
  A.equal(T.mediaSaveDir(), 'C:\\Users\\A\\Vault/' + T.folderRoot() + '/assets')
  VAULT.root = '/Users/x/My Vault'
}

// ── 就绪检查 host:manifest onboarding.requires 的闸。只读 window.tangu,拿不准一律 unknown(宿主不拿 unknown 催用户) ──
{
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
  const ob = manifest.onboarding
  const checkIds = (ob.requires || []).filter((r) => r.kind === 'check').map((r) => r.id)
  A.deepEqual(checkIds, ['host'], 'manifest 应声明 onboarding.requires:[{kind:"check",id:"host"}]')
  for (const id of checkIds) A.ok(readiness.some((r) => r.id === id), `requires 里的 check "${id}" 必须在 setup 里 registerReadiness,否则宿主那一行恒 unknown`)
  // 宿主 sanitizeOnboarding 把 intro / 步骤描述截到 500 字:超了静默截断半句
  for (const s of [ob.intro, ob.en.intro, ...ob.steps.map((x) => x.description), ...ob.en.steps.map((x) => x.description)]) {
    A.ok(String(s).length <= 500, `onboarding 文案超过宿主 500 字上限会被截断:${String(s).slice(0, 40)}…`)
  }
  A.ok(/增强自动模式/.test(ob.intro) && /Enhanced auto mode/.test(ob.en.intro), 'intro 中英都要讲到增强自动模式')
  const r = readiness.find((x) => x.id === 'host')
  A.equal(typeof r.label, 'function', 'label 传函数,切语言即时跟上')
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('readiness must not hit the network') }
  const unmetDetail = (v) => (v && typeof v === 'object' && v.state === 'unmet' ? v.detail : null)
  try {
    for (const locale of ['zh', 'en']) {
      ctx.getLocale = () => locale
      A.equal(r.label(), locale === 'en' ? 'Host execution (video fetching and transcription)' : '本机执行能力(视频抓取与转录)')
      delete globalThis.window
      A.equal(await r.check(), 'unknown', '没有 window.tangu → unknown')
      globalThis.window = { tangu: { executionCapabilities: { host: true } } }
      A.equal(await r.check(), 'ok')
      window.tangu.executionCapabilities.host = false
      A.equal(unmetDetail(await r.check()), T.t('readyHostUnmet'), '明确 host:false → unmet + 当前语言的 detail')
      A.ok(locale === 'en' ? !/[一-鿿]/.test(T.t('readyHostUnmet')) : /本机执行/.test(T.t('readyHostUnmet')))
      window.tangu.executionCapabilities = {}
      A.equal(await r.check(), 'unknown', 'executionCapabilities 里没有布尔 host → unknown')
      // ⚠ 设备页 / 云端 Web / 手机:本机执行在这些形态下本来就不存在,用户也修不了 —— 必须 unknown。
      //   回 unmet 会挂一个永远清不掉的「待引导」徽标(宿主 pluginOnboardingStore 文件头点名的就是这种情形)。
      window.tangu = { unitPage: true }
      A.equal(await r.check(), 'unknown', '设备页:本端没有这项能力 → unknown,不是 unmet')
      window.tangu = { cloudWeb: true }
      A.equal(await r.check(), 'unknown', '云端 Web / 手机:同上')
      // ⚠ 真实 shim 是**两者都给**的:unitPage/cloudWeb + executionCapabilities:{host:false}。
      //   只测不带 capabilities 的那半 → 形态判断挪到能力判断之后也照样绿(2026-09-21 Codex 评审实证)。
      window.tangu = { unitPage: true, executionCapabilities: { host: false } }
      A.equal(await r.check(), 'unknown', '设备页 + 明确 host:false:仍是「本端没有」,不许催')
      window.tangu = { cloudWeb: true, executionCapabilities: { host: false } }
      A.equal(await r.check(), 'unknown', '云端 Web / 手机 + 明确 host:false:同上')
      // 桌面宿主(Electron 不注 executionCapabilities):托管引擎 = 本机;external / 读不到配置 = 拿不准
      window.tangu = { getConfig: async () => ({ mode: 'managed', backendUrl: 'http://127.0.0.1:1' }) }
      A.equal(await r.check(), 'ok')
      window.tangu = { getConfig: async () => ({ mode: 'external', backendUrl: 'https://remote.example' }) }
      A.equal(await r.check(), 'unknown', 'external 引擎可能在别的机器上,不许判 ok 也不许催')
      window.tangu = { getConfig: async () => { throw new Error('ipc down') } }
      A.equal(await r.check(), 'unknown')
      window.tangu = {}
      A.equal(await r.check(), 'unknown')
    }
    A.equal(requests, 0, '就绪检查只读宿主能力,不发网络请求')
  } finally {
    globalThis.fetch = originalFetch
    delete globalThis.window
    delete ctx.getLocale
  }
}

// ── 停用即收干净:顶层语言订阅 + 状态栏项(此前 mock 没有 subscribeLocale,那几行退订代码从没被执行过) ──
A.equal(localeSubs.size, 1, 'dispose 前应还挂着顶层语言订阅')
dispose()
A.equal(localeSubs.size, 0, 'dispose() 必须退掉顶层语言订阅(否则插件停用后还在改状态栏/设置)')
A.ok(reg.status[0].disposed, 'dispose() 必须收掉状态栏项')
console.log(`check ok — ${reg.views.length} views / ${reg.commands.length} cmds / ${reg.settings.length} settings;XSS+平台+导出+队列状态机+建夹+双语(${zhKeys.length} 键 ×2)+切语言保现场+Unit 离线收藏/资源/执行断言通过`)
