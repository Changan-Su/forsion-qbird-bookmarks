/**
 * 青鸟收藏夹 —— Forsion 桌面插件(裸 setup(ctx) 体,宿主 new Function('ctx', code) 装载)。
 *
 * 由 space.json 组合成原生工作台:统一收藏侧栏 + 视频主视图 + Amadeus 文档 + ChatView。
 * plugin:bluebird:folder 在 Space 中只负责链接输入、队列与视频播放；生成的 Markdown 交给
 * Amadeus，追问交给 ChatView。直接从命令打开时保留旧版一体式详情，兼容旧宿主。
 *
 * 视觉:复用 Forsion Genesis 原生 token 与交互层级，作用域全在 .bb-root 并跟随宿主主题。
 *
 * 引擎接入(同 desktop/frontend/src/services/agentRunService.ts):POST /agent/runs(execMode:host,
 *   agentSlug:bluebird)+ SSE /events(累积 token.delta、done.content);token 取 window.tangu.getConfig()。
 * 安全:Agent 产出的 Markdown 一律走自建 renderMarkdown(只 createElement+textContent,绝不 innerHTML 不可信)。
 */
const PLUGIN_ID = 'bluebird'
const AGENT_SLUG = 'bluebird'
const APP_ID = 'tangu'

// ══ 双语(1.5.0)══════════════════════════════════════════════════════════════
// 一份 MSG,两侧键集合必须完全相等(check.mjs 断言);占位符一律 {name},不靠模板串拼(英文语序不同)。
// **只有 UI 文案进词表**:落盘数据(模板值 / 日期 / 索引字段)、用户内容、标签、笔记正文一律不随语言变,
// 否则用户切成英文就像换了个数据目录。发给模型的指令段照旧,只额外告诉它用哪种语言作答。
const MSG = {
  zh: {
    // 设置(注册时取当时语言 —— 宿主贡献点标题不做运行时重解析,见 README「双语」节)
    setTplLabel: '默认总结模板',
    setTplDesc: '通用/学术/访谈/播客/会议/新闻/教程/Vlog/旅行/测评',
    setDetailLabel: '默认详细程度(brief/standard/detailed)',
    setDetailDesc: '简洁/标准/详细',
    setMediaLabel: '存原始素材', setMediaDesc: '把图文帖的图片、视频的原始音频一并下载进收藏夹的 assets/,笔记里内嵌本地文件而不是外链(外链会随平台 CDN 过期失效)。占磁盘,不想要就关掉。',
    setAutoLabel: '增强自动模式',
    setAutoDesc: '在任意 Tangu 对话里单独丢一条链接、语境没有歧义时,不再问一句,直接抓正文存进笔记库',
    // 模板 / 详细度(值是中文 canonical,这里只是显示名)
    tplGeneral: '通用', tplAcademic: '学术', tplInterview: '访谈', tplPodcast: '播客', tplMeeting: '会议',
    tplNews: '新闻', tplTutorial: '教程', tplVlog: 'Vlog', tplTravel: '旅行', tplReview: '测评',
    detailBrief: '简洁', detailStandard: '标准', detailDetailed: '详细',
    // 平台
    platYoutube: 'YouTube', platBilibili: 'Bilibili', platXiaohongshu: '小红书', platDouyin: '抖音',
    platGithub: 'GitHub', platVideo: '视频',
    platNetease: '网易云音乐', platQqmusic: 'QQ 音乐', platApplemusic: 'Apple Music',
    // 贡献点
    viewLibrary: '收藏夹', viewFolder: '青鸟收藏夹',
    cmdOpen: '青鸟收藏夹:打开', cmdLibrary: '青鸟收藏夹:打开侧栏',
    statusText: '🐦 青鸟', statusTitle: '打开青鸟收藏夹',
    // 收藏夹侧栏
    appName: '青鸟收藏夹',
    libNew: '＋ 新建总结', libAddFolder: '＋', libFolders: '文件夹', libHistory: '历史记录', libSearch: '搜索…',
    libAll: '全部', libNone: '未分类', libUntitled: '(无标题)', today: '今天',
    libNoMatch: '未找到匹配的记录',
    libEmpty: '还没有收藏。贴一条视频链接,分析完自动出现在这里 →',
    menuRename: '✏️ 重命名', menuDelete: '🗑 删除', menuMove: '📂 移动到…',
    promptFolderName: '文件夹名', promptNewFolder: '新文件夹名',
    promptMoveTo: '移动到哪个文件夹?可选:{names}',
    ok: '确定', cancel: '取消',
    // 首页
    homeTagline: '收藏链接到你的知识库。有可用的 Tangu 引擎时,还可以抓字幕、生成总结。',
    urlPlaceholder: '粘贴链接,或整段分享文案…',
    saveLink: '收藏链接', savingLink: '保存中…', savedLink: '链接已存入收藏夹',
    linkLabel: '链接', linkContentHint: '仅保存了链接,尚未抓取网页正文。', savedAt: '保存于 {time}',
    linkOnlyHint: '可直接收藏链接;视频分析需要可用的 Tangu 引擎。',
    errInvalidLink: '请输入有效的 HTTP 或 HTTPS 链接',
    addToQueue: '添加到分析队列',
    warnUnsupported: '⚠️ 暂不支持的链接', warnExtracted: '✓ 已从分享文本中提取链接', warnReady: '✓ 可分析',
    warnQueued: '已加入分析队列 ↓', notifyUnsupported: '暂不支持的链接',
    featTranscript: '⚡ 自动抓字幕', featSummary: '🧠 AI 总结', featSave: '💾 自动存进笔记',
    // 队列
    queueTitle: '分析队列', queueClearDone: '清除已完成',
    stQueued: '排队中', stDone: '已完成', stFailed: '失败', stWorking: '处理中…',
    actView: '查看', actRemove: '移除', canceled: '已取消',
    // 阶段(引擎真事件 → 文案)
    stgSubmit: '提交任务', stgPreparing: '准备中', stgFetching: '抓取字幕 / 转录中',
    stgTool: '调用 {name}', stgToolFallback: '工具', stgOrganizing: '整理转录',
    stgSummarizing: '生成总结中', stgAsr: '本机语音识别中', stgSaving: '保存记录', stgDone: '完成',
    stepSubmit: '提交', stepQueue: '排队', stepTranscribe: '转录', stepSummarize: '总结', stepSave: '保存',
    // 错误
    errNoEngine: '未连接到 Tangu 引擎', errNeedLogin: '引擎会话不可用,请先连接或登录当前宿主',
    errRunStart: '起 run 失败 HTTP {code}', errNoRunId: '引擎未返回 runId',
    errSubscribe: '订阅事件失败 HTTP {code}', errAnalyze: '分析失败',
    errStreamCut: '与引擎的连接中断,未收到完成事件(可重试)',
    errNoHostExecution: '当前引擎未提供本机执行能力,无法运行视频抓取。仍可收藏链接和阅读已有记录。',
    readyHostLabel: '本机执行能力(视频抓取与转录)',
    readyHostUnmet: '当前宿主没有本机执行能力,视频抓取与转录无法运行;收藏链接和阅读已有记录不受影响。',
    errNoAsrBridge: '当前宿主未提供音频文件转写能力。可分析有字幕的视频,或配置宿主的语音识别。',
    errAsrEmpty: '语音识别没有识别出内容(检查「设置 → 语音」里选的模型)',
    errAnalyzeFailed: '分析失败:{msg}',
    errAutoSave: '「{title}」已总结,但自动保存失败:{msg}',
    failedPrefix: '失败:{msg}',
    // 详情 / 结果
    back: '返回', resummarize: '重新总结', exportBtn: '导出 ▾',
    openNote: '打开笔记', saveToLibrary: '存入收藏夹',
    qaTitle: 'AI 问答', qaPlaceholderWait: '分析完成后可提问…', qaPlaceholder: '就这个视频提问…', qaSend: '问',
    tabSummary: '总结', tabTranscript: '字幕', tabLyrics: '歌词',
    hintSummary: '正文里的 [MM:SS] 可点击跳转播放器',
    // 量词/复数按语言分键:中文两侧同形,英文 1 条要用单数(见 setHint)
    hintTranscript: '带时间戳的字幕内容{count}', hintLyrics: '带时间戳的歌词{count}', hintCount: ' · 共 {n} 条', hintCountOne: ' · 共 {n} 条',
    analyzing: '分析中…', noSummary: '(无总结)',
    wcOk: '字数达标', wcShort: '字数偏少', wcLong: '字数偏多',
    wcCount: '字数 {n}', wcTarget: ' / 目标 {min}-{max}', wcDetail: ' · 档位:{name}',
    generatedAt: '生成于 {time}',
    noTranscript: '暂无字幕(纯 ASR 或未返回)。', noLyrics: '这首歌没有歌词(纯音乐,或该平台没提供)。', openInBrowser: '在浏览器打开 ↗',
    nativeDocument: '总结已同步到右侧 Amadeus 文档', nativeDocumentPending: '分析完成后，笔记会自动同步到 Amadeus',
    nativeChatHint: 'ChatView 会自动引用这篇笔记，可直接继续追问',
    resummarizeTitle: '重新总结(重新分析并排队)', start: '开始',
    needAnalyzeFirst: '先分析一个视频', noAnswer: '(无回答)',
    nothingToSave: '还没有可保存的总结', savedToLibrary: '已存入收藏夹', saveFailed: '保存失败:{msg}',
    expCopyMd: '📋 复制 Markdown', copied: '已复制', copyFailed: '复制失败',
    expMd: '📄 Markdown', expObsidian: '💎 Obsidian', expSrt: '📝 SRT{suffix}', expTxt: '📄 TXT{suffix}',
    expJson: '🔧 JSON', expSaveNote: '💾 存为笔记', noTranscriptSuffix: '(无字幕)',
    noTranscriptData: '无字幕数据', savedAsNote: '已存为笔记',
    entryMissing: '打不开这条收藏(数据缺失)',
    // 产物里的插件自述(笔记正文本身是用户内容,不动)
    untitledSummary: '视频总结',
    noteHeader: '> 来源:{url}\n> 由「青鸟收藏夹」于 {date} 生成\n\n',
    linkNoteHeader: '> 来源:{url}\n> 由「青鸟收藏夹」于 {date} 收藏\n\n',
  },
  en: {
    setTplLabel: 'Default summary template',
    setTplDesc: 'General / Academic / Interview / Podcast / Meeting / News / Tutorial / Vlog / Travel / Review',
    setDetailLabel: 'Default detail level (brief/standard/detailed)',
    setDetailDesc: 'Brief / Standard / Detailed',
    setMediaLabel: 'Archive media', setMediaDesc: "Download image-post pictures and video audio into the library's assets/ folder and embed the local files, instead of hotlinking (hotlinks die when the platform's CDN expires them). Uses disk; turn off if you'd rather not.",
    setAutoLabel: 'Enhanced auto mode',
    setAutoDesc: 'When a link arrives on its own in any Tangu chat and the intent is unambiguous, file it straight into the vault instead of asking first',
    tplGeneral: 'General', tplAcademic: 'Academic', tplInterview: 'Interview', tplPodcast: 'Podcast', tplMeeting: 'Meeting',
    tplNews: 'News', tplTutorial: 'Tutorial', tplVlog: 'Vlog', tplTravel: 'Travel', tplReview: 'Review',
    detailBrief: 'Brief', detailStandard: 'Standard', detailDetailed: 'Detailed',
    platYoutube: 'YouTube', platBilibili: 'Bilibili', platXiaohongshu: 'Xiaohongshu', platDouyin: 'Douyin',
    platGithub: 'GitHub', platVideo: 'Video',
    platNetease: 'NetEase Music', platQqmusic: 'QQ Music', platApplemusic: 'Apple Music',
    viewLibrary: 'Library', viewFolder: 'Bluebird',
    cmdOpen: 'Bluebird: Open', cmdLibrary: 'Bluebird: Open library',
    statusText: '🐦 Bluebird', statusTitle: 'Open Bluebird',
    appName: 'Bluebird',
    libNew: '+ New summary', libAddFolder: '+', libFolders: 'Folders', libHistory: 'History', libSearch: 'Search…',
    libAll: 'All', libNone: 'Uncategorized', libUntitled: '(Untitled)', today: 'Today',
    libNoMatch: 'No matching items',
    libEmpty: 'Nothing saved yet. Paste a video link — finished analyses land here →',
    menuRename: '✏️ Rename', menuDelete: '🗑 Delete', menuMove: '📂 Move to…',
    promptFolderName: 'Folder name', promptNewFolder: 'New folder name',
    promptMoveTo: 'Move to which folder? Options: {names}',
    ok: 'OK', cancel: 'Cancel',
    homeTagline: 'Save links in your library. With a Tangu engine available, you can also fetch transcripts and generate summaries.',
    urlPlaceholder: 'Paste a link, or the whole share text…',
    saveLink: 'Save link', savingLink: 'Saving…', savedLink: 'Link saved to your library',
    linkLabel: 'Link', linkContentHint: 'Only the link was saved. Page content has not been fetched.', savedAt: 'Saved {time}',
    linkOnlyHint: 'You can save this link. Video analysis needs an available Tangu engine.',
    errInvalidLink: 'Enter a valid HTTP or HTTPS link',
    addToQueue: 'Add to queue',
    warnUnsupported: '⚠️ Link not supported yet', warnExtracted: '✓ Link picked out of the share text', warnReady: '✓ Ready to analyze',
    warnQueued: 'Added to the queue ↓', notifyUnsupported: 'Link not supported yet',
    featTranscript: '⚡ Auto transcript', featSummary: '🧠 AI summary', featSave: '💾 Filed as notes',
    queueTitle: 'Analysis queue', queueClearDone: 'Clear finished',
    stQueued: 'Queued', stDone: 'Done', stFailed: 'Failed', stWorking: 'Working…',
    actView: 'Open', actRemove: 'Remove', canceled: 'Canceled',
    stgSubmit: 'Submitting', stgPreparing: 'Preparing', stgFetching: 'Fetching transcript',
    stgTool: 'Running {name}', stgToolFallback: 'tool', stgOrganizing: 'Processing transcript',
    stgSummarizing: 'Writing summary', stgAsr: 'Transcribing audio', stgSaving: 'Saving', stgDone: 'Done',
    stepSubmit: 'Submit', stepQueue: 'Queue', stepTranscribe: 'Transcribe', stepSummarize: 'Summarize', stepSave: 'Save',
    errNoEngine: 'Not connected to the Tangu engine', errNeedLogin: 'No active engine session. Connect or sign in to this host first.',
    errRunStart: 'Could not start the run (HTTP {code})', errNoRunId: 'The engine returned no runId',
    errSubscribe: 'Could not subscribe to the run events (HTTP {code})', errAnalyze: 'Analysis failed',
    errStreamCut: 'Lost the connection to the engine before it finished — you can retry',
    errNoHostExecution: 'This engine does not provide host execution for video fetching. You can still save links and read existing entries.',
    readyHostLabel: 'Host execution (video fetching and transcription)',
    readyHostUnmet: 'Host execution is unavailable here, so video fetching and transcription can\'t run; saving links and reading existing entries still work.',
    errNoAsrBridge: 'This host does not provide audio file transcription. Use a video with captions or configure speech recognition on the host.',
    errAsrEmpty: 'Speech recognition returned nothing (check Settings → Voice)',
    errAnalyzeFailed: 'Analysis failed: {msg}',
    errAutoSave: '"{title}" was summarized, but saving it failed: {msg}',
    failedPrefix: 'Failed: {msg}',
    back: 'Back', resummarize: 'Re-summarize', exportBtn: 'Export ▾',
    openNote: 'Open note', saveToLibrary: 'Save to library',
    qaTitle: 'Ask AI', qaPlaceholderWait: 'Ask once the analysis finishes…', qaPlaceholder: 'Ask about this video…', qaSend: 'Ask',
    tabSummary: 'Summary', tabTranscript: 'Transcript', tabLyrics: 'Lyrics',
    hintSummary: 'Click any [MM:SS] in the text to jump the player',
    hintTranscript: 'Timestamped transcript{count}', hintLyrics: 'Timestamped lyrics{count}', hintCount: ' · {n} segments', hintCountOne: ' · {n} segment',
    analyzing: 'Analyzing…', noSummary: '(No summary)',
    wcOk: 'On target', wcShort: 'Too short', wcLong: 'Too long',
    wcCount: '{n} characters', wcTarget: ' / target {min}-{max}', wcDetail: ' · Detail: {name}',
    generatedAt: 'Generated {time}',
    noTranscript: 'No transcript here (audio-only recognition, or none returned).', noLyrics: 'No lyrics for this track (instrumental, or the platform provides none).', openInBrowser: 'Open in browser ↗',
    nativeDocument: 'The summary is synced to the Amadeus document pane', nativeDocumentPending: 'The note will sync to Amadeus when analysis finishes',
    nativeChatHint: 'ChatView automatically references this note, ready for follow-up questions',
    // 这行渲染进 .bb-label(text-transform:uppercase)、浮层只有 230px:英文整句大写会折行,故只留动词
    resummarizeTitle: 'Re-summarize', start: 'Start',
    needAnalyzeFirst: 'Analyze a video first', noAnswer: '(No answer)',
    nothingToSave: 'No summary to save yet', savedToLibrary: 'Saved to your library', saveFailed: 'Save failed: {msg}',
    expCopyMd: '📋 Copy Markdown', copied: 'Copied', copyFailed: 'Copy failed',
    expMd: '📄 Markdown', expObsidian: '💎 Obsidian', expSrt: '📝 SRT{suffix}', expTxt: '📄 TXT{suffix}',
    expJson: '🔧 JSON', expSaveNote: '💾 Save as note', noTranscriptSuffix: ' (no transcript)',
    noTranscriptData: 'No transcript data', savedAsNote: 'Saved as a note',
    entryMissing: 'Cannot open this item — its data is missing',
    untitledSummary: 'Video summary',
    noteHeader: '> Source: {url}\n> Generated by Bluebird on {date}\n\n',
    linkNoteHeader: '> Source: {url}\n> Saved by Bluebird on {date}\n\n',
  },
}
/** 宿主 UI 语言;旧宿主(无 getLocale)→ 中文 canonical。**每次取用都现读**,别缓存。 */
const L = () => (ctx.getLocale ? ctx.getLocale() : 'zh')
function t(k, vars) {
  const d = MSG[L()] || MSG.zh
  let s = d[k] != null ? d[k] : (MSG.zh[k] != null ? MSG.zh[k] : k)
  if (vars) for (const n of Object.keys(vars)) s = s.split('{' + n + '}').join(String(vars[n]))
  return s
}
/** 日期/时间的显示 locale(落盘的日期照旧 ISO,不随语言变)。 */
const dateLoc = () => (L() === 'zh' ? 'zh-CN' : 'en-US')
/** 'YYYY-MM-DD' → 本地化日期串;正午锚定,避开 UTC 解析导致的差一天。 */
function fmtDate(iso) {
  const p = String(iso || '').split('-').map((n) => parseInt(n, 10))
  if (p.length !== 3 || p.some((n) => !n)) return String(iso || '')
  return new Date(p[0], p[1] - 1, p[2], 12).toLocaleDateString(dateLoc())
}
/** 给模型的输出语言指令(指令段本身照旧,只钉死它该用哪种语言作答)。 */
const respondIn = () => (L() === 'en' ? '\nRespond in English.' : '\n请用中文输出。')

// 模板值 = 中文 canonical:进提示词、进落盘数据,**永不随语言变**;界面上只换显示名。
const TEMPLATES = ['通用', '学术', '访谈', '播客', '会议', '新闻', '教程', 'Vlog', '旅行', '测评']
const TPL_KEY = {
  通用: 'tplGeneral', 学术: 'tplAcademic', 访谈: 'tplInterview', 播客: 'tplPodcast', 会议: 'tplMeeting',
  新闻: 'tplNews', 教程: 'tplTutorial', Vlog: 'tplVlog', 旅行: 'tplTravel', 测评: 'tplReview',
}
const tplLabel = (v) => (TPL_KEY[v] ? t(TPL_KEY[v]) : String(v || ''))
const DETAILS = { brief: '简洁', standard: '标准', detailed: '详细' } // 进提示词的中文档位名
const DETAIL_KEY = { brief: 'detailBrief', standard: 'detailStandard', detailed: 'detailDetailed' }
const detailLabel = (k) => (DETAIL_KEY[k] ? t(DETAIL_KEY[k]) : '')

/** 设置项:宿主 registerSetting 是**同 key 覆盖**(pluginStore.registerSetting 按 pluginId+key 先 filter 再 append),
 *  所以切语言时原地重注册一次即可就地换语言,顺序也不变(宿主自动的「工作文件夹」行仍在最前)。
 *  ⚠️ 命令面板 / 视图标签页没有这个待遇 —— 那两处是直接 append 不去重,重注册会长出重复项,别照抄。 */
function registerSettings() {
  ctx.registerSetting({ key: 'defaultTemplate', label: t('setTplLabel'), type: 'text', default: '通用', description: t('setTplDesc') })
  ctx.registerSetting({ key: 'detail', label: t('setDetailLabel'), type: 'text', default: 'standard', description: t('setDetailDesc') })
  ctx.registerSetting({ key: 'saveMedia', label: t('setMediaLabel'), type: 'boolean', default: true, description: t('setMediaDesc') })
  ctx.registerSetting({ key: 'autoSave', label: t('setAutoLabel'), type: 'boolean', default: false, description: t('setAutoDesc') })
}
registerSettings()
// 存储文件夹改用宿主标准「工作文件夹」设置(1.3.0 起,每个插件自动就有,默认=插件名「青鸟收藏夹」)。
// 1.2.x 自定义过 saveFolder 的一次性迁移成 workFolder,此后单一真源;旧键删除。
try {
  const o = localStorage.getItem(`plugin.${PLUGIN_ID}.saveFolder`)
  if (o && !localStorage.getItem(`plugin.${PLUGIN_ID}.workFolder`)) localStorage.setItem(`plugin.${PLUGIN_ID}.workFolder`, o)
  if (o) localStorage.removeItem(`plugin.${PLUGIN_ID}.saveFolder`)
} catch { /* ignore */ }

// ── 纯函数(经文末 __BLUEBIRD_TEST__ 暴露给 check.mjs) ────────────────────────

const getSetting = (k, d) => { try { return localStorage.getItem(`plugin.${PLUGIN_ID}.${k}`) || d } catch { return d } }

/** 素材存档目录(绝对路径),关了开关 / 云端库 / 没开库 → null(退回外链,笔记照样成立)。
 *  ⚠️默认开 → 宿主在「值=默认」时会把键删掉,所以判据是 `!== 'false'` 而不是 `=== 'true'`。
 *  ⚠️每次跑现算,不缓存:运行时可以切库,`vaultRoot()` 是渲染进程 store 的当下值。 */
const ASSETS_SUBDIR = 'assets'
function mediaSaveDir() {
  if (getSetting('saveMedia', 'true') === 'false') return null
  if (ctx.app && typeof ctx.app.hostPath === 'function') return ctx.app.hostPath(`${folderRoot()}/${ASSETS_SUBDIR}`)
  // Older desktop hosts have a real local vault path. A browser projection must use the
  // explicit host mapping: its vault and its execution engine may be on different devices.
  const tg = globalThis.window && window.tangu
  if (tg && (tg.unitPage || tg.cloudWeb || tg.hostFiles === false)) return null
  const root = (ctx.app && ctx.app.vaultRoot && ctx.app.vaultRoot()) || null
  if (!root || !/^(?:\/|[a-z]:[\\/])/i.test(root) || String(root).includes('://')) return null
  return `${String(root).replace(/[/\\]+$/, '')}/${folderRoot()}/${ASSETS_SUBDIR}`
}
/** 存档件在 vault 里的相对路径;URL 由宿主统一转换。 */
const assetVaultRel = (name) => `${folderRoot()}/${ASSETS_SUBDIR}/${name}`
function archivedAssetUrl(name) {
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..') return ''
  const path = assetVaultRel(name)
  if (ctx.app && typeof ctx.app.assetUrl === 'function') return ctx.app.assetUrl(path)
  const tg = globalThis.window && window.tangu
  if (tg && (tg.unitPage || tg.cloudWeb)) return ''
  return `amadeus-asset://v/${encodeURIComponent(path)}`
}

// ── 增强自动模式:把开关镜像进 vault 的一个小文件 ─────────────────────────────
// 为什么要镜像:开关值住在**渲染进程的 localStorage**,读它的却是**引擎进程**里的「青鸟链接收藏」
// 技能(跑在任意 Tangu 对话里)。两个进程没有共享内存,唯一都够得着的地方就是 vault。
// 为什么是轮询:宿主的设置行直接写 localStorage 且**不通知插件**(pluginStore 的既定语义
// 「插件在使用处自行读取——轮询型插件下一轮生效」);同一个 document 内 storage 事件不触发,
// 所以没有回调可订。30s 一跳,值没变就不落盘。
const MODE_FILE = '.bluebird/link-mode.json'
let modeStamp = null // `${vaultRoot}|${on}`:切库也要重写一次(writeFile 跟随当前活动库)
async function mirrorLinkMode() {
  const on = getSetting('autoSave', 'false') === 'true' // 宿主存 'true'/'false' 字符串,别用真值判断
  const root = (ctx.app.vaultRoot && ctx.app.vaultRoot()) || '' // 老宿主没有 vaultRoot → 退化成只看值
  const stamp = `${root}|${on}`
  if (stamp === modeStamp) return false
  // 关着、且库里本来就没这个文件 → 什么都不写:别往没用过这功能的库里凭空塞文件
  // (技能读不到 = 默认模式,与写一份 false 语义相同)。有旧文件才必须回写,否则陈旧的 true 会一直自动存。
  if (!on && (await ctx.app.readFile(MODE_FILE)) === null) { modeStamp = stamp; return false }
  await ctx.app.writeFile(MODE_FILE, `${JSON.stringify({ autoSave: on }, null, 2)}\n`)
  modeStamp = stamp
  return true
}
const mirrorSoon = () => { mirrorLinkMode().catch(() => { /* 无活动库/写失败:下一跳再试。技能读不到文件=默认模式 */ }) }
mirrorSoon()
const modeTick = setInterval(mirrorSoon, 30_000)
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

/** 平台识别 + 两种地址:
 *  - `embed(t)` = **可内嵌的播放器**地址(宿主 CSP frame-src 只放行 youtube-nocookie 与
 *    player.bilibili.com);青鸟自己的 folder 视图用它。
 *  - `watch(t)` = **分享页**地址,写进笔记正文的时间戳链接用它。两者不能混:播放器 URL 写进
 *    笔记 = 用户在 Obsidian / 浏览器里点开是个裸播放器页,而 CSP 白名单只在我们自己端内有效。
 *  ⚠️ 两家都**没有运行期 seek 通道**(B 站无官方 postMessage;YouTube IFrame API 要正确 origin,
 *  而渲染层 file:// 的 origin 是 "null")—— 换时刻只能重挂播放器,这是外部约束不是我们能修的。 */
function parsePlatform(url) {
  const u = String(url || '')
  let m
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/))) {
    const id = m[1]
    return {
      platform: 'youtube', videoId: id,
      embed: (t) => `https://www.youtube-nocookie.com/embed/${id}?rel=0${t ? `&start=${Math.floor(t)}&autoplay=1` : ''}`,
      watch: (t) => `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.floor(t)}s` : ''}`,
    }
  }
  if ((m = u.match(/bilibili\.com\/video\/(BV[\w]+)/i)) || (m = u.match(/\b(BV[\w]{10})\b/))) {
    const id = m[1]
    return {
      platform: 'bilibili', videoId: id,
      embed: (t) => `https://player.bilibili.com/player.html?bvid=${id}&page=1&high_quality=1&controls=1${t ? `&t=${Math.floor(t)}&autoplay=1` : '&autoplay=0'}`,
      watch: (t) => `https://www.bilibili.com/video/${id}${t ? `?t=${Math.floor(t)}` : ''}`,
    }
  }
  if (/xiaohongshu\.com|xhslink/.test(u)) return { platform: 'xiaohongshu', videoId: '', embed: null }
  if (/douyin\.com/.test(u)) return { platform: 'douyin', videoId: '', embed: null }
  if (/github\.com/.test(u)) return { platform: 'github', videoId: '', embed: null }
  // 音乐三家:只剪藏不放音(宿主 CSP frame-src 没放行它们的播放器,且音源都有版权闸)
  if ((m = u.match(/music\.163\.com.*?[?&#/]id=(\d+)/)) || (m = u.match(/music\.163\.com\/song\/(\d+)/))) {
    return { platform: 'netease', videoId: m[1], embed: null }
  }
  if (/music\.163\.com|163cn\.tv/.test(u)) return { platform: 'netease', videoId: '', embed: null }
  if ((m = u.match(/y\.qq\.com\/n\/(?:ryqq\/songDetail|yqq\/song)\/([\w]+)/))) {
    return { platform: 'qqmusic', videoId: m[1].replace(/\.html$/, ''), embed: null }
  }
  if (/y\.qq\.com/.test(u)) return { platform: 'qqmusic', videoId: '', embed: null }
  if ((m = u.match(/music\.apple\.com\/.*?[?&]i=(\d+)/)) || (m = u.match(/music\.apple\.com\/[a-z]{2}\/song\/[^/]*\/(\d+)/))) {
    return { platform: 'applemusic', videoId: m[1], embed: null }
  }
  if (/music\.apple\.com/.test(u)) return { platform: 'applemusic', videoId: '', embed: null }
  return { platform: '', videoId: '', embed: null }
}
const PLATFORM_META = {
  youtube: { key: 'platYoutube', badge: 'pink' }, bilibili: { key: 'platBilibili', badge: 'b' },
  xiaohongshu: { key: 'platXiaohongshu', badge: 'pink' }, douyin: { key: 'platDouyin', badge: 'slate' },
  github: { key: 'platGithub', badge: 'slate' }, '': { key: 'platVideo', badge: 'slate' },
  netease: { key: 'platNetease', badge: 'pink' }, qqmusic: { key: 'platQqmusic', badge: 'slate' },
  applemusic: { key: 'platApplemusic', badge: 'slate' },
}
/** 音乐平台走「剪藏」支线:抓歌词/热评/封面,不下音频、不走语音识别。 */
const MUSIC_PLATFORMS = ['netease', 'qqmusic', 'applemusic']
const isMusic = (platform) => MUSIC_PLATFORMS.includes(platform)
const platLabel = (p) => t((PLATFORM_META[p] || PLATFORM_META['']).key)

const SUPPORTED = /(?:youtu\.?be|youtube\.com|bilibili\.com|b23\.tv|xiaohongshu\.com|xhslink\.com|douyin\.com|github\.com|music\.163\.com|163cn\.tv|y\.qq\.com|music\.apple\.com)/i
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
  const summary = stripPreamble(raw.replace(re, '').replace(/\n{3,}/g, '\n\n').trim())
  return { summary, data }
}

/** 掐掉正文首个标题之前的铺垫句。提示词里写了「不要寒暄」,模型照样常写一句
 *  「我先按技能抓取…随后生成总结」—— 那句会原样存进用户的笔记。
 *  只在**确有标题**时裁(没标题就说明整篇都是散文,裁了会吃掉正文);
 *  裁掉的部分里若含 markdown 结构(列表/引用/代码/图),说明那不是铺垫,不动。 */
function stripPreamble(md) {
  const text = String(md || '')
  const at = text.search(/^#{1,6}\s+\S/m)
  if (at <= 0) return text
  const head = text.slice(0, at)
  if (/^\s*(?:[-*+>|]|\d+\.|```|!\[|\[\[)/m.test(head)) return text
  return text.slice(at)
}

function deriveTitle(md) {
  const m = /^#{1,6}\s+(.+)$/m.exec(String(md || ''))
  const first = m ? m[1] : (String(md || '').split('\n').find((l) => l.trim()) || t('untitledSummary'))
  return first.replace(/[*`#>\[\]()]/g, '').trim().slice(0, 60) || t('untitledSummary')
}
function sanitizeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || t('untitledSummary')
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
  const fm = ['---', `title: ${JSON.stringify(m.title || t('untitledSummary'))}`, `platform: ${m.platform || ''}`,
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
    // ![[文件名]] = 落进收藏夹 assets/ 的存档件。浏览器和桌面的 URL 由同一宿主桥生成。
    // 认不出的后缀不自作主张造文件卡,原样当文字落到段落里。
    const wl = /^!\[\[([^\]|]+?)(?:\|\d+)?\]\]$/.exec(t)
    if (wl) {
      const name = wl[1].trim()
      const kind = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name) ? 'img'
        : /\.(mp3|wav|ogg|m4a|flac)$/i.test(name) ? 'audio'
          : /\.(mp4|webm|mov|m4v)$/i.test(name) ? 'video' : ''
      const assetUrl = kind ? archivedAssetUrl(name) : ''
      if (kind && assetUrl) {
        flushPara(); flushList()
        const el = document.createElement(kind)
        el.className = kind === 'img' ? 'bb-md-img' : 'bb-md-av'
        el.setAttribute('src', assetUrl)
        if (kind === 'img') el.setAttribute('alt', name)
        else el.setAttribute('controls', 'controls')
        el.addEventListener('error', () => el.remove())
        container.appendChild(el)
        i++; continue
      }
    }
    const im = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t)
    if (im) {
      flushPara(); flushList()
      const src = safeHref(im[2])
      if (/^https:/i.test(src)) {   // 只放行 https(宿主 CSP img-src 也是这一档);拿不到就当没有
        const img = document.createElement('img'); img.className = 'bb-md-img'
        img.setAttribute('src', src); img.setAttribute('alt', im[1] || '')
        img.addEventListener('error', () => img.remove())
        container.appendChild(img)
      }
      i++; continue
    }
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
  const tg = globalThis.window && window.tangu
  const empty = { backendUrl: '', token: '', modelId: '', cwd: '', hostExecution: false }
  try {
    const c = await (tg && tg.getConfig ? tg.getConfig() : null)
    if (c && c.backendUrl) return { backendUrl: c.backendUrl.replace(/\/$/, ''), token: c.token || '', modelId: c.modelId || '', cwd: c.defaultWorkspaceDir || c.homeDir || '',
      hostExecution: tg.executionCapabilities ? tg.executionCapabilities.host === true : !(tg.unitPage || tg.cloudWeb) }
  } catch { /* The selected host is unavailable; never borrow another account's token. */ }
  return empty
}
const engineError = (cfg) => !cfg.backendUrl ? 'errNoEngine' : !cfg.token ? 'errNeedLogin' : !cfg.hostExecution ? 'errNoHostExecution' : ''
/** 就绪检查 `host`(manifest onboarding.requires 里的 {kind:'check',id:'host'}):宿主能不能给转录跑 run_bash。
 *  判据同 getCfg 的 hostExecution;只在桌面宿主不给 executionCapabilities 时多看一眼它自己的配置 ——
 *  托管引擎(mode:'managed')= 本机,同宿主 tanguProbe.hostExecution 的口径;external 是用户自接的引擎,
 *  可能在别的机器上,拿不准。**拿不准一律 unknown**:宿主不会拿 unknown 去催用户。
 *  只读:不 spawn、不探 yt-dlp / ffmpeg(yt-dlp 是引擎内置 Python 的模块、技能会自己 pip 装;ffmpeg 只在无字幕分支用)。
 *  detail 在调用时才取词表,跟着当时的界面语言走。 */
async function hostReadiness() {
  const tg = globalThis.window && window.tangu
  if (!tg) return 'unknown'
  const unmet = () => ({ state: 'unmet', detail: t('readyHostUnmet') })
  // ⚠ 顺序要紧:真实的 Unit / 云端 Web shim **同时**给 unitPage/cloudWeb 和 executionCapabilities:{host:false}。
  //   先看能力再看形态的话,这两端永远落进 unmet —— 那是本端压根没有、用户也修不了的东西,会挂一个
  //   永远清不掉的「待引导」徽标(宿主 pluginOnboardingStore 文件头点名的就是这种情形)。形态判断必须在前。
  if (tg.unitPage || tg.cloudWeb) return 'unknown'
  const caps = tg.executionCapabilities
  if (caps && typeof caps === 'object') return caps.host === true ? 'ok' : caps.host === false ? unmet() : 'unknown'
  try {
    const c = tg.getConfig ? await tg.getConfig() : null
    return c && c.mode === 'managed' ? 'ok' : 'unknown'
  } catch { return 'unknown' }
}
ctx.registerReadiness?.({ id: 'host', label: () => t('readyHostLabel'), check: hostReadiness })
/** 无字幕视频:音频交给 **Forsion 自己的语音链路**(设置 → 语音:本地 SenseVoice 离线 / 自带 key
 *  的 provider / Forsion 云)。插件不自带 ASR 供应商,也就不需要第二个 key。
 *  timestamps:true → 拿分段时间戳,字幕面板与 [MM:SS] 跳播放器才有得用;拿不到就只回文本(不编时间点)。 */
async function asrTranscribeFile(audioPath) {
  const tg = globalThis.window && window.tangu
  if (!tg || !tg.transcribeAudioFile) throw new Error(t('errNoAsrBridge'))
  const r = await tg.transcribeAudioFile(audioPath, { timestamps: true })
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
/** ⚠️ 返回的是**词表键**不是渲染好的串:阶段文案会落进队列项、活到用户切语言之后 —— 存成品串就会冻在旧语言里。 */
function stageOf(ev, content) {
  const p = ev.payload || {}
  if (ev.type === 'status') return p.state === 'queued' ? { pct: 10, key: 'stQueued', st: 'parsing' } : p.state === 'running' ? { pct: 16, key: 'stgPreparing', st: 'parsing' } : null
  if (ev.type === 'tool_call') return p.name === 'run_bash' ? { pct: 38, key: 'stgFetching', st: 'transcribing' } : { pct: 28, key: 'stgTool', vars: { name: p.name || '' }, st: 'transcribing' }
  if (ev.type === 'tool_result') return { pct: 58, key: 'stgOrganizing', st: 'transcribing' }
  if (ev.type === 'token') return { pct: Math.min(92, 68 + content.length / 120), key: 'stgSummarizing', st: 'transcribing' }
  return null
}
/** {键, 占位符} → 当前语言的成品串(**渲染时**才落地)。工具名缺失时的兜底也得跟着语言走。 */
function stageText(key, vars) {
  if (!key) return ''
  if (!vars) return t(key)
  const v = { ...vars }
  if ('name' in v && !v.name) v.name = t('stgToolFallback')
  return t(key, v)
}
/** 分析进度的阶段路标(详情页步骤条用):按已到百分比点亮。文案是**词表键**,渲染时才落地成当前语言。 */
const STEPS = [['stepSubmit', 6], ['stepQueue', 10], ['stepTranscribe', 38], ['stepSummarize', 68], ['stepSave', 96]]

async function runAgent(cfg, sessionId, message, onTick, signal, onStage) {
  const unavailable = engineError(cfg)
  if (unavailable) throw new Error(t(unavailable))
  const stage = (pct, key, vars, st) => { if (onStage) onStage(pct, key, vars, st) }
  stage(6, 'stgSubmit', null, 'parsing')
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }
  const start = await fetch(`${cfg.backendUrl}/agent/runs`, {
    method: 'POST', headers: h, signal,
    body: JSON.stringify({ session_id: sessionId, model_id: cfg.modelId || undefined, app_id: APP_ID, message, attachments: [], agent_config: { agentSlug: AGENT_SLUG, execMode: 'host', cwd: cfg.cwd || undefined } }),
  })
  if (!start.ok) throw new Error((await start.text().catch(() => '')) || t('errRunStart', { code: start.status }))
  const { runId } = await start.json()
  if (!runId) throw new Error(t('errNoRunId'))
  const res = await fetch(`${cfg.backendUrl}/agent/runs/${encodeURIComponent(runId)}/events?fromSeq=0`, { headers: h, signal })
  if (!res.ok || !res.body) throw new Error(t('errSubscribe', { code: res.status }))
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
      const st = stageOf(ev, content); if (st) stage(st.pct, st.key, st.vars, st.st)
      if (ev.type === 'token') continue
      if (ev.type === 'done') { stage(100, 'stgDone'); return (ev.payload && ev.payload.content) || content }
      if (ev.type === 'error') throw new Error((ev.payload && ev.payload.error) || t('errAnalyze'))
    }
  }
  throw new Error(t('errStreamCut'))
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
const NATIVE_NOTE_REUSE_KEY = 'bluebird-document'
/** 打开青鸟自己写的那篇**裸 `.md`** 笔记。新版宿主优先走 `openNote`，这样 Space 里的
 *  Amadeus 伴随栏能按 reuseKey 原地换文档；`activate:false` 时不会从视频面板抢焦点。
 *  老宿主一律 `loadPage`,**不许用 `openFile`**。
 *  宿主 `openFile` 只认插件注册过的后缀与内置那几类(`.excalidraw.md`/`.mindmap.md`/`.db`/`.pdf`/图片/`.html`),
 *  裸 `.md` 落 `amadeus.openVaultFile()` = 交给系统默认程序,笔记会在 TextEdit 里打开。
 *  (真源 `desktop/frontend/src/amadeusNav.ts` 的 `openFile`:`if (!matchFileType(path)) openVaultFile(path)`。)
 *  ⚠️反过来同样是事故:`loadPage` 吃到插件文件类型会把它当普通笔记导进 v3 = 毁档 —— 本函数只喂青鸟自己写的裸 .md。
 *  ⚠️`loadPage` 对不存在的路径会凭空造一篇空白笔记,所以只在 `saveEntry` 成功之后调用。 */
function openNotePath(path, activate = true) {
  if (!path) return
  if (ctx.app && typeof ctx.app.openNote === 'function') {
    ctx.app.openNote(path, { reuseKey: NATIVE_NOTE_REUSE_KEY, activate })
    return
  }
  if (ctx.app && typeof ctx.app.loadPage === 'function') { ctx.app.loadPage(path); return }
  if (ctx.app && typeof ctx.app.openFile === 'function') ctx.app.openFile(path) // 老宿主没有 loadPage 时的兜底
}
/** 正文里独立的 `[MM:SS]` → 可点锚点链接。
 *  新宿主写带 entryId 的青鸟引用,由编辑器扩展跨 View 定位;旧宿主保留可移植链接:
 *  - 已存档本地素材 → `[[文件名#t=95|01:35]]`(宿主 wiki 锚,能就地 seek 顶部播放器)
 *  - 在线源 → `[01:35](分享页?t=95)`(标准 md 链接,任何编辑器都点得开)
 *  ⚠️ 跳过代码块(``` 围栏内的 `[00:12]` 可能是日志/数组下标,不是时间戳),也跳过已经在
 *  链接文本位里的那些(`[[01:35]](…)` 会把语法拧坏)。 */
function linkifyTimestamps(md, watch, localName, entryId) {
  const lines = String(md || '').split('\n')
  let fence = false
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line }
    if (fence) return line
    return line.replace(/(`+)[\s\S]*?\1|!?\[\[[^\n]*?\]\]|!?\[[^\n]*?\]\([^\n]*?\)|\[(\d{1,3}:\d{2}(?::\d{2})?)\]/g, (whole, code, ts, offset) => {
      if (!ts || line[offset - 1] === '\\' || /^\s*:/.test(line.slice(offset + whole.length))) return whole
      const sec = citationSeconds(ts)
      if (sec == null) return whole
      if (validEntryId(entryId)) return `[${ts}](#bluebird=${entryId}&t=${sec})`
      if (localName) return `[[${localName}#t=${sec}|${ts}]]`
      const href = watch ? watch(sec) : ''
      return href ? `[${ts}](${href})` : whole
    })
  }).join('\n')
}

async function saveEntry(full) {
  const id = full.id || uuid()
  const idx = await readIndex()
  const title = deriveTitle(full.summaryMarkdown)
  // Plain bookmarks often share a host/title. Keep each new bookmark's path distinct.
  const suffix = full.kind === 'link' ? `-${id}` : ''
  const notePath = `${folderRoot()}/${today()}-${sanitizeFileName(title)}${suffix}.md`
  const header = t(full.kind === 'link' ? 'linkNoteHeader' : 'noteHeader', { url: full.sourceUrl || (full.meta && full.meta.videoUrl) || '', date: today() })
  const src = full.sourceUrl || (full.meta && full.meta.videoUrl) || ''
  const plat = parsePlatform(src)
  // 已存档的本地素材优先:走宿主的 `#t=` 锚 = 真·就地 seek(不重挂播放器、不联网)。
  // 存档件在正文里的形态就是 `![[文件名]]`(开了「存原始素材」时由技能写出,落在收藏夹 assets/)。
  // 没有独立字段可读,所以从正文里认第一条音视频存档件 —— 宿主按裸 basename 全库定位。
  const localName = (/!\[\[([^\]|#]+\.(?:mp3|wav|ogg|m4a|flac|mp4|webm|mov|m4v))\]\]/i
    .exec(full.summaryMarkdown || '') || [])[1] || ''
  // frontmatter:笔记 ↔ 收藏条目的双向可寻址(索引里存 notePath,笔记里存 bluebird_id);
  // 没有它,"这篇笔记是哪条收藏" 只能靠遍历旁挂 json 反查。
  const fm = ['---', `bluebird_id: ${id}`, `source: ${src}`, `platform: ${(full.meta && full.meta.platform) || plat.platform || ''}`, '---', ''].join('\n')
  // 顶部播放器块:在线源写裸 URL 一行(宿主的书签卡就地渲成播放器),已存档写 wiki 嵌入。
  // 有了它,"点正文时间戳 → 本笔记内的播放器就地跳过去" 这条最舒服的路径天然成立。
  const player = full.kind === 'link' ? '' : localName ? `![[${localName}]]\n\n` : (plat.embed && src ? `${src}\n\n` : '')
  const body = linkifyTimestamps(full.summaryMarkdown, plat.watch, localName, ctx.registerEditorExtension ? id : null)
  await ctx.app.writeFile(notePath, fm + header + player + body)
  const time = full.kind === 'link' ? { savedAt: full.savedAt || new Date().toISOString() } : { generatedAt: full.generatedAt || new Date().toISOString() }
  await ctx.app.writeFile(dataPath(id), JSON.stringify({ ...full, id, notePath, date: today(), ...time }))
  const m = full.meta || {}
  idx.items = [{ id, notePath, title, kind: full.kind, platform: m.platform || '', videoId: m.videoId || '', videoUrl: full.sourceUrl || m.videoUrl || '', folderId: full.folderId || null, date: today(), duration: m.duration || 0, author: m.author || '', thumbnail: m.thumbnail || '' }, ...idx.items.filter((it) => it.id !== id)]
  await writeIndex(idx)
  return { id, notePath }
}
const loadEntry = async (id) => {
  try {
    const t = (await ctx.app.readFile(dataPath(id))) || (folderRoot() !== LEGACY_ROOT ? await ctx.app.readFile(`${LEGACY_ROOT}/.bluebird/${id}.json`) : null)
    return t ? JSON.parse(t) : null
  } catch { return null }
}
function httpLink(raw) {
  try {
    const text = String(raw || '').trim()
    const match = text.match(/https?:\/\/[^\s<>"']+/i)
    const url = new URL(match ? match[0] : text)
    return /^(http:|https:)$/.test(url.protocol) ? url : null
  } catch { return null }
}

// Amadeus 时间引用是普通 Markdown 锚点,无需放开宿主的外链协议白名单。
const validEntryId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
function citationSeconds(raw) {
  if (typeof raw !== 'string') return null
  if (/^\d+(?:\.\d+)?$/.test(raw)) { const n = Number(raw); return Number.isFinite(n) && n <= 864000 ? n : null }
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(raw)) return null
  const parts = raw.split(':').map(Number)
  if (parts.slice(1).some(n => n >= 60)) return null
  return parts.reduce((n, part) => n * 60 + part, 0)
}
function parseTimeReference(href) {
  if (typeof href !== 'string' || !href.startsWith('#bluebird=')) return null
  const p = new URLSearchParams(href.slice(1)), id = p.get('bluebird'), at = citationSeconds(p.get('t'))
  if (p.getAll('bluebird').length !== 1 || p.getAll('t').length !== 1 || !validEntryId(id) || at == null) return null
  return { entryId: id, at }
}
function archivedMediaName(summary) {
  const name = (/!\[\[([^\]|#]+\.(?:mp3|wav|ogg|m4a|flac|mp4|webm|mov|m4v))\]\]/i.exec(summary || '') || [])[1]
  return name && !/[\/\\]/.test(name) ? name : null
}
const playbackTargets = new Set()
const playbackScope = () => `${ctx.app.vaultRoot ? ctx.app.vaultRoot() : ''}\n${folderRoot()}`
function requestTimestamp(ref) {
  if (!ref || !validEntryId(ref.entryId) || citationSeconds(String(ref.at)) == null) return
  const targets = [...playbackTargets].filter(p => p.scope === playbackScope())
  const visible = targets.filter(p => p.visible())
  const target = visible.find(p => p.entryId() === ref.entryId) || visible.find(p => p.native) || visible[0]
    || targets.find(p => p.entryId() === ref.entryId) || targets.find(p => p.native) || targets[0]
  if (target) { target.open(ref); if (!target.visible()) ctx.openView('folder'); return }
  pendingOpen = { ...ref, playbackOnly: true, scope: playbackScope() }
  ctx.openView('folder')
}
async function entryForNote(path) {
  if (!path || !/\.md$/i.test(path)) return null
  const text = await ctx.app.readFile(path)
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text || '')
  const id = fm && /^bluebird_id:\s*["']?([\w-]+)["']?\s*$/m.exec(fm[1])?.[1]
  if (validEntryId(id)) { const full = await loadEntry(id); return full ? { ...full, id } : null }
  // 早期总结没有 frontmatter。只读 sidecar 反查,不批量改写用户笔记。
  const index = await readIndex()
  for (const item of index.items) {
    if (!validEntryId(item.id) || (item.notePath && item.notePath !== path)) continue
    if (!item.notePath && !path.startsWith(`${folderRoot()}/`) && !path.startsWith(`${LEGACY_ROOT}/`)) continue
    const full = await loadEntry(item.id)
    if (full && full.notePath === path) return { ...full, id: item.id }
  }
  return null
}
function legacyTimeReference(href, entry) {
  if (!entry || !href) return null
  try {
    const url = new URL(href), source = new URL(entry.sourceUrl || entry.meta?.videoUrl)
    const identity = u => {
      if (!/^https?:$/.test(u.protocol)) return null
      if (/^(www\.|m\.)?bilibili\.com$/.test(u.hostname)) return /\/video\/(BV[\w]+)/.exec(u.pathname)?.[1]
      if (/^(www\.|m\.)?youtube\.com$/.test(u.hostname)) return u.searchParams.get('v')
      if (u.hostname === 'youtu.be') return u.pathname.slice(1)
      return null
    }
    const raw = url.searchParams.get('t')
    const at = citationSeconds(raw && /^\d+s$/.test(raw) ? raw.slice(0, -1) : raw)
    const samePlatform = parsePlatform(url.href).platform === parsePlatform(source.href).platform
    return at != null && samePlatform && identity(url) && identity(url) === identity(source) ? { entryId: entry.id, at } : null
  } catch { return null }
}
/** 每篇文档独立绑定来源,不读「当前活动页面」:多分屏/引用另一篇笔记也不会跳错视频。 */
function timestampEditorExtension(pm, editor) {
  let binding = null, scope = null, path = null, generation = 0, destroyed = false
  const key = new pm.PluginKey('bluebird-time-reference')
  function sync(view) {
    const nextPath = editor?.pagePath?.(), nextScope = playbackScope()
    if (nextPath === path && nextScope === scope) return
    path = nextPath; scope = nextScope; binding = null
    const token = ++generation
    entryForNote(path).then(entry => {
      if (destroyed || token !== generation || scope !== playbackScope() || path !== editor?.pagePath?.()) return
      binding = entry
      view.dispatch(view.state.tr.setMeta(key, true).setMeta('addToHistory', false))
    }).catch(() => {})
  }
  function reference(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (event.button != null && event.button !== 0)) return null
    const target = event.target?.closest?.('[data-bluebird-time], a[href]')
    if (!target) return null
    const href = target.getAttribute('href')
    const explicit = parseTimeReference(href)
    if (explicit) return explicit
    if (scope !== playbackScope() || path !== editor?.pagePath?.()) return null
    if (target.hasAttribute('data-bluebird-time') && binding) return { entryId: binding.id, at: Number(target.getAttribute('data-bluebird-time')) }
    return legacyTimeReference(href, binding)
  }
  function activate(view, event) {
    const ref = reference(event)
    if (!ref) return false
    event.preventDefault(); requestTimestamp(ref); return true
  }
  return [new pm.Plugin({
    key,
    props: {
      decorations(state) {
        if (!binding || scope !== playbackScope() || path !== editor?.pagePath?.()) return null
        const marks = []
        state.doc.descendants((node, pos) => {
          if (node.type.spec.code) return false
          if (!node.isTextblock) return
          let text = ''
          node.forEach(child => { text += child.isText && !child.marks.some(m => m.type.name === 'link' || m.type.spec.code) ? child.text : ' '.repeat(child.nodeSize) })
          for (const hit of text.matchAll(/\[(\d{1,3}:\d{2}(?::\d{2})?)\]/g)) {
            const at = citationSeconds(hit[1]), before = text[hit.index - 1], after = text.slice(hit.index + hit[0].length)
            if (at == null || before === '[' || before === '\\' || /^[\](]|^\s*:/.test(after)) continue
            marks.push(pm.Decoration.inline(pos + 1 + hit.index, pos + 1 + hit.index + hit[0].length, {
              'data-bluebird-time': String(at), role: 'link', tabindex: '0',
              title: L() === 'en' ? `Play at ${hit[1]}` : `跳转到 ${hit[1]}`,
              style: 'color:var(--accent);cursor:pointer;text-decoration:underline;text-underline-offset:3px',
            }))
          }
          return false
        })
        return pm.DecorationSet.create(state.doc, marks)
      },
      handleDOMEvents: {
        mousedown(view, event) { if (!reference(event)) return false; event.preventDefault(); return true },
        click: activate,
        keydown(view, event) { return ['Enter', ' '].includes(event.key) ? activate(view, event) : false },
      },
    },
    view(view) { sync(view); return { update: sync, destroy() { destroyed = true; generation++ } } },
  })]
}
ctx.registerEditorExtension?.(timestampEditorExtension, { priority: 'high' })
/** Bookmark layout has no player, transcript, or AI controls without fetched content. */
function bookmarkDetailMarkup() {
  return `
<div class="bb-app">
  <div class="bb-hdr">
    <button class="bb-btn ghost sm" data-back title="${t('back')}">←</button>
    <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-title></div><div class="bb-muted" style="font-size:11px" data-metaline></div></div>
    <a class="bb-btn ghost sm" data-browser target="_blank" rel="noopener noreferrer">${t('openInBrowser')}</a>
    <button class="bb-btn ghost sm" data-export>${t('exportBtn')}</button>
    <button class="bb-btn primary sm" data-save>${t('openNote')}</button>
  </div>
  <div class="bb-body">
    <p class="bb-muted" style="font-size:12px;margin:0 0 12px">${t('linkContentHint')}</p>
    <div class="bb-panel" style="padding:14px">
      <div class="bb-out" data-summary></div>
      <div class="bb-gen" data-gen></div>
    </div>
  </div>
</div>`
}
/** A plain bookmark is entirely local: no metadata request, engine, model or account. */
async function saveLink(raw) {
  const url = httpLink(raw)
  if (!url) throw new Error(t('errInvalidLink'))
  const sourceUrl = url.href
  let label = url.host + (url.pathname === '/' ? '' : url.pathname)
  try { label = decodeURIComponent(label) } catch { /* A URL may contain an invalid escape. */ }
  label = label.replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/[\[\]*`#>]/g, '').trim()
  const plat = parsePlatform(sourceUrl)
  const saved = await saveEntry({ kind: 'link', summaryMarkdown: `# ${label}\n\n${sourceUrl}\n`,
    sourceUrl, meta: { title: label, platform: plat.platform, videoId: plat.videoId, videoUrl: sourceUrl },
    segments: [], chapters: [], tags: [], folderId: null })
  bus.emit({ type: 'saved' })
  return saved
}
/** 眼见为实:打开插件就把工作文件夹落进库(写空索引),不必等第一次保存才出现在文件树。 */
async function ensureWorkFolder() {
  // 冷启动时主进程尚未激活库,readFile 会暂时返回 null。不能把它当成「不存在」:
  // 等 writeFile 到达时库可能已经恢复,空索引会覆盖用户的收藏。切库/改工作夹期间同样不写。
  const root = ctx.app.vaultRoot && ctx.app.vaultRoot()
  if (!root) return // 老宿主没有库就绪信号时也不预建;首次保存会自然建立目录。
  const folder = folderRoot()
  try {
    const existing = await ctx.app.readFile(`${folder}/.bluebird-index.json`)
    if (existing !== null || ctx.app.vaultRoot() !== root || folderRoot() !== folder) return
    await ctx.app.writeFile(`${folder}/.bluebird-index.json`, JSON.stringify({ folders: [], items: [] }, null, 2))
  } catch { /* ignore:只做建夹,读取失败不能覆盖已有数据 */ }
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
// 队列项上**存词表键不存成品串**(1.5.1):队列项活得比一次语言切换长,存串就会永远冻在入队那一刻的语言里
// (英文界面里残留一行「请先登录 Forsion」)。引擎回的原始错误/异常没有键 → 落 error 裸串,渲染时原样出。
const qStageText = (it) => stageText(it.progressKey, it.progressVars)
const qErrText = (it) => (it.errKey ? t(it.errKey) : it.error || '')
function qAdd(url, tpl, detail) {
  const it = {
    id: uuid(), url, tpl, detail, plat: parsePlatform(url), sessionId: uuid(),
    status: 'pending', progress: 0, progressKey: 'stQueued', progressVars: null, errKey: '', error: '',
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
  else if (it.status === 'pending') { it.status = 'error'; it.errKey = 'canceled'; it.error = ''; qEmit() }
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
// 音乐剪藏的输出契约:沿用同一套 meta/segments 形状(segments=歌词行),
// 保存/索引/导出/问答那一整条链就一行都不用改。多带个 album 进 sidecar。
const musicSpec = (it) => `输出两部分:①给用户看的音乐收藏卡片 Markdown 正文(照技能里的模板;不要寒暄、不要问是否保存)。②正文之后另起一行追加一个机器可读代码块(我拿它做歌词面板,不展示给用户;segments = 脚本回的 lyrics 数组**原样搬过来**,别改时间也别重写句子):
\`\`\`json bluebird
{"meta":{"title":"","platform":"${it.plat.platform}","videoId":"${it.plat.videoId}","videoUrl":"${it.url}","author":"","album":"","duration":0,"thumbnail":""},"segments":[{"start":0,"end":0,"text":""}],"chapters":[],"tags":[]}
\`\`\``
const runEntry = (it) => ({ id: it.entryId, summaryMarkdown: it.summary, meta: (it.data && it.data.meta) || { platform: it.plat.platform, videoId: it.plat.videoId, videoUrl: it.url }, segments: (it.data && it.data.segments) || [], chapters: (it.data && it.data.chapters) || [], tags: (it.data && it.data.tags) || [], sourceUrl: it.url, folderId: null, tpl: it.tpl, detail: it.detail })
async function qRun(it) {
  const cfg = await getCfg()
  const unavailable = engineError(cfg)
  if (unavailable) { Object.assign(it, { status: 'error', errKey: unavailable, error: '' }); qEmit(); return }
  it.controller = new AbortController()
  Object.assign(it, { status: 'parsing', progress: 4, progressKey: 'stgSubmit', progressVars: null, startedAt: Date.now() })
  qEmit()
  const onStage = (pct, key, vars, st) => {
    it.progress = Math.max(it.progress, pct) // 单调不回退(ASR 接力会再来一轮 tool_call)
    if (key) { it.progressKey = key; it.progressVars = vars || null }
    if (st && it.status !== 'completed' && it.status !== 'error') it.status = st
    qEmit()
  }
  const onTick = (full) => { const p = parseAgentOutput(full); it.summary = p.summary || full; bus.emit({ type: 'run-delta', id: it.id }) }
  const music = isMusic(it.plat.platform)
  const SPEC = music ? musicSpec(it) : outSpec(it)
  // 素材存档:脚本跑在真实文件系统上,只有 vault 相对路径喂不进去 —— 这正是 ctx.app.vaultRoot() 的用途。
  // 现算不缓存(运行时可切库);关了开关/云端库 → 空串,整段指令不出现,agent 照旧只抓不存。
  const saveDir = music ? null : mediaSaveDir()
  const saveArg = saveDir ? `
跑脚本时**带上存档参数**:\`--save-to "${saveDir}"\`(路径含空格,引号不能去)。脚本回的 \`assets\` 是已经落进收藏夹的文件名 —— 正文里一律用 \`![[文件名]]\` 引用它们(宿主会内嵌渲染:图直接显示、音频/视频出播放器),**别再写平台的原始外链**(CDN 会过期)。脚本没回 \`assets\`(存档失败或没素材)才退回外链。` : ''
  // 音乐:不下音频、不走语音识别 —— 歌词是现成的,抓来就是 ground truth。模板/详细度对收藏卡不适用,忽略。
  const msg = music ? `请把这条音乐链接做成一条收藏。按「青鸟视频分析」技能里的「音乐剪藏」一节:host 模式 run_bash 跑 scripts/music_meta.py 抓元数据/歌词/简介/热评,再按那一节的音乐收藏模板产出 Markdown 正文。
${SPEC}
音乐链接:${it.url}${respondIn()}` : `请分析这个视频。按「青鸟视频分析」技能:host 模式 run_bash 跑 transcribe.py 抓转录,再产出结构化 Markdown 总结(模板:${it.tpl},详细度:${DETAILS[it.detail] || '标准'})。
${SPEC}
若脚本回的是 source:"needs_asr"(该视频没有字幕),**不要自己想办法转写**:直接只输出这一个代码块、不要总结正文——
\`\`\`json bluebird
{"needs_asr":true,"audio_path":"脚本给的路径","meta":{...脚本给的 meta...}}
\`\`\`
我会用 Forsion 自己的语音识别转好再回来找你。
若脚本回的是 source:"image_text"(这是一篇**图文帖**,没有音轨,图和正文就是全部内容),照技能里「图文剪藏」一节的模板产出正文,**别提转录也别提字幕**;数据块照给,meta 里多带一个 images 数组(脚本给的原样搬),segments 放正文(整段一条 {"start":0,"end":0,"text":"正文全文"},后续问答要靠它)。
视频链接:${it.url}${saveArg}${respondIn()}`
  try {
    let out = await runAgent(cfg, it.sessionId, msg, onTick, it.controller.signal, onStage)
    let parsed = parseAgentOutput(out)
    // 无字幕 → 本机(或用户选的云)语音识别接力,转好再让同一会话出总结。
    if (parsed.data && parsed.data.needs_asr && parsed.data.audio_path) {
      onStage(45, 'stgAsr', null, 'transcribing')
      const asr = await asrTranscribeFile(parsed.data.audio_path)
      if (!asr.text.trim()) throw new Error(t('errAsrEmpty'))
      onStage(62, 'stgSummarizing', null, 'transcribing')
      const m2 = `这是该视频的语音转写${asr.segments.length ? '(行首 [MM:SS] 是真实时间戳,可直接引用)' : '(该识别通道未提供时间戳,正文里就别标 [MM:SS] 了)'}:
${transcriptForPrompt(asr)}

按上面的要求(模板:${it.tpl},详细度:${DETAILS[it.detail] || '标准'})产出总结。
${SPEC}${respondIn()}`
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
      onStage(96, 'stgSaving', null, 'transcribing')
      try {
        const r = await saveEntry(runEntry(it))
        it.entryId = r.id; it.notePath = r.notePath; bus.emit({ type: 'saved' })
      } catch (e) { it.saveError = (e && e.message) || String(e); say(t('errAutoSave', { title: it.title, msg: it.saveError }), { level: 'warning' }) }
    }
    Object.assign(it, { status: 'completed', progress: 100, progressKey: 'stgDone', progressVars: null, endedAt: Date.now() }); qEmit()
  } catch (e) {
    const aborted = it.controller && it.controller.signal.aborted
    Object.assign(it, { status: 'error', errKey: aborted ? 'canceled' : '', error: aborted ? '' : ((e && e.message) || String(e)), endedAt: Date.now() }); qEmit()
    if (!aborted) say(t('errAnalyzeFailed', { msg: qErrText(it) }), { level: 'error' })
  } finally { it.controller = null }
}

// ── 字数档位(照原版 DETAIL_LEVEL_CONFIG 的目标区间;字数=剥 Markdown 符号后的字符数) ──
const WORD_RANGES = { brief: [300, 800], standard: [700, 1800], detailed: [1500, 5000] }
const countWords = (md) => String(md || '').replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>\-|\s]/g, '').length
const wordState = (n, detail) => { const r = WORD_RANGES[detail]; if (!r || !n) return null; return n < r[0] ? t('wcShort') : n > r[1] ? t('wcLong') : t('wcOk') }

// ── 平台图标:官方 favicon(照原版侧栏),加载失败退回文字徽标 ──
const PLATFORM_FAVICON = { youtube: 'https://www.youtube.com/favicon.ico', bilibili: 'https://www.bilibili.com/favicon.ico', xiaohongshu: 'https://www.xiaohongshu.com/favicon.ico', douyin: 'https://www.douyin.com/favicon.ico', github: 'https://github.com/favicon.ico', netease: 'https://s1.music.126.net/style/favicon.ico', qqmusic: 'https://y.qq.com/favicon.ico', applemusic: 'https://music.apple.com/favicon.ico' }
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
.bb-panel{border-radius:14px;background:var(--bb-surf);border:1px solid var(--bb-border);box-shadow:var(--bb-shadow)}
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
.bb-lib{display:flex;flex-direction:column;height:100%;background:var(--bb-sidebar)}
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
.bb-hdr{flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bb-border-sub);background:var(--bb-header)}
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
/* Space 原生三分栏中的视频面板:自身不滚动，文档滚动完全交给隔壁 Amadeus。 */
.bb-native .bb-hdr{align-items:flex-start;flex-wrap:wrap;padding:10px 12px}
.bb-native-title{flex:1;min-width:160px;padding-top:2px}
.bb-native-actions{display:flex;gap:4px;align-items:center;margin-left:auto}
.bb-native .bb-body{display:flex;flex-direction:column;gap:12px;overflow:hidden;padding:12px}
.bb-native-stage{min-height:0;display:flex;flex:1;flex-direction:column;justify-content:center;gap:12px}
.bb-native .bb-media{width:100%;max-height:min(58vh,540px);flex:0 1 auto}
.bb-native-note{padding:12px 13px;background:var(--bb-surf);border:1px solid var(--bb-border-sub);border-radius:12px}
.bb-native-note strong{display:block;margin-bottom:3px;font-size:12.5px;font-weight:600;color:var(--bb-text)}
.bb-native-note span{display:block;color:var(--bb-text-muted);font-size:11.5px}
@media(max-width:520px){.bb-native-actions{width:100%;justify-content:flex-end}.bb-native .bb-media{max-height:42vh}}
.bb-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--bb-surf-sub);margin-bottom:10px}
.bb-tab{flex:1;padding:7px;text-align:center;border-radius:9px;cursor:pointer;font-size:12.5px;color:var(--bb-text-sec)}
.bb-tab.on{background:var(--bb-tint);color:var(--bb-primary);font-weight:500}
.bb-out{line-height:1.65}
.bb-out h1,.bb-out h2,.bb-out h3,.bb-out h4{margin:.9em 0 .4em;line-height:1.3}
.bb-out h1{font-size:1.5em}.bb-out h2{font-size:1.25em}.bb-out h3{font-size:1.08em}
.bb-out pre{background:var(--bb-surf-sub);padding:10px 12px;border-radius:10px;overflow:auto}
.bb-md-img{display:block;max-width:100%;height:auto;border-radius:10px;margin:.6em 0}
.bb-md-av{display:block;width:100%;max-width:100%;border-radius:10px;margin:.6em 0}
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
  const b = document.createElement('span'); b.className = `bb-badge ${meta.badge}`; b.textContent = t(meta.key); return b
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
let _menuCleanup = null
function closeMenus() { root_all('.bb-menu').forEach((m) => m.remove()) }
function root_all(sel) { return Array.from(document.querySelectorAll(sel)) }
document.addEventListener('click', (e) => { if (!(e.target.closest && e.target.closest('.bb-menu'))) closeMenus() }, true)

/** 极简输入框(Electron 无 window.prompt);返回字符串或 null。 */
function askStr(title, def) {
  return new Promise((resolve) => {
    closeMenus()
    const ov = document.createElement('div'); ov.className = 'bb-menu'; ov.style.left = '50%'; ov.style.top = '30%'; ov.style.transform = 'translateX(-50%)'; ov.style.minWidth = '280px'; ov.style.padding = '14px'
    const cap = document.createElement('div'); cap.style.cssText = 'font-size:12px;margin-bottom:8px'; cap.textContent = esc(title) // 标题可含文件夹名(用户输入)→ textContent
    const inp = document.createElement('input'); inp.className = 'bb-input'; inp.value = def || ''
    const row = document.createElement('div'); row.className = 'bb-row'; row.style.marginTop = '10px'; row.style.justifyContent = 'flex-end'
    const ok = document.createElement('button'); ok.className = 'bb-btn primary sm'; ok.textContent = t('ok')
    const no = document.createElement('button'); no.className = 'bb-btn ghost sm'; no.textContent = t('cancel')
    const done = (v) => { ov.remove(); resolve(v) }
    ok.addEventListener('click', () => done(inp.value.trim() || null))
    no.addEventListener('click', () => done(null))
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null) })
    row.appendChild(no); row.appendChild(ok); ov.appendChild(cap); ov.appendChild(inp); ov.appendChild(row); showMenu(ov); inp.focus()
  })
}

// ── 切语言重画的「现场」搬运(1.5.1)────────────────────────────────────────
// 切语言是用户随手一按,不该顺手吞掉刚粘的链接、刚选的模板,更不该抹掉整段 QA 记录 ——
// QA 记录只活在 DOM 里(没有任何 state 备份),重建一次就是真丢。
/** kind='home' → 链接输入框 + 模板/详细度两个选择器;'detail' → QA 记录节点 + 还没发出去的那句提问。 */
function snapshotStage(root, kind) {
  const q = (s) => root.querySelector(s)
  const val = (s) => { const e = q(s); return e ? e.value : null }
  if (kind === 'home') return { kind: 'home', url: val('[data-url]'), tpl: val('[data-tpl]'), det: val('[data-detail]') }
  const log = q('[data-qalog]')
  return { kind: 'detail', qa: log ? Array.from(log.children) : [], qin: val('[data-qin]') }
}
/** 回填。QA 气泡直接 appendChild 搬移(DOM 里 appendChild 就是移动):气泡里的时间戳走挂载作用域的
 *  seekHandler,renderDetail 每次都会重新赋值,所以搬过去的旧气泡照样能跳播放器。 */
function restoreStage(root, snap) {
  if (!snap) return
  const q = (s) => root.querySelector(s)
  if (snap.kind === 'home') {
    const u = q('[data-url]'); if (u && snap.url) u.value = snap.url
    const tp = q('[data-tpl]'); if (tp && snap.tpl) tp.value = snap.tpl
    const dt = q('[data-detail]'); if (dt && snap.det) dt.value = snap.det
    return
  }
  const log = q('[data-qalog]')
  if (log && snap.qa) for (const n of snap.qa) log.appendChild(n)
  const inp = q('[data-qin]'); if (inp && snap.qin) inp.value = snap.qin
  if (log) log.scrollTop = log.scrollHeight
}

// ══ 分析 / 详情视图 ═════════════════════════════════════════════════════════
function mountAnalyze(el, viewCtx) {
  el.innerHTML = ''
  const style = document.createElement('style'); style.textContent = STYLE; el.appendChild(style)
  const root = document.createElement('div'); root.className = 'bb-root'; el.appendChild(root)
  const off = themeObserver(root)
  // 只在新版 Bluebird Space 的原生工作台中收窄职责。直接命令打开、Mini/Floating、旧宿主继续用
  // 一体式详情，避免升级后丢掉旧入口的总结/字幕/问答能力。
  let initialParams = {}
  try { initialParams = viewCtx && viewCtx.getParams ? viewCtx.getParams() : {} } catch { /* disposed/old host */ }
  const nativeWorkbench = !!(initialParams.nativeWorkbench && ctx.app && typeof ctx.app.openNote === 'function')

  // 视图态:home | run(队列项:直播与结果同一张脸)| entry(已存收藏)。
  // 分析本体在模块级队列 —— 切走/关掉视图照跑,回来还在。
  let cur = { kind: 'home', id: null, live: false }
  let view = null // { title, summary, data, sourceUrl, plat, sessionId, entryId, notePath, detail, generatedAt, runId }
  let qaController = null, seekHandler = null
  let openGeneration = 0, disposed = false
  let mediaScope = playbackScope()
  let homeCheck = null // 首页链接提示行的重算入口(切语言回填链接后要重跑一次)
  const say2 = say

  // ── 首页:输入面板 + 分析队列面板(照原版 LinkInputPanel + AnalysisQueueList 同屏) ──
  function renderHome() {
    openGeneration++
    seekHandler = null
    cur = { kind: 'home', id: null, live: false }
    // option 的 **value 恒为中文 canonical**(进提示词/落盘),只有显示名跟着语言换
    const tplOpts = TEMPLATES.map((v) => `<option value="${v}"${v === getSetting('defaultTemplate', '通用') ? ' selected' : ''}>${tplLabel(v)}</option>`).join('')
    const detOpts = Object.keys(DETAILS).map((k) => `<option value="${k}"${k === getSetting('detail', 'standard') ? ' selected' : ''}>${detailLabel(k)}</option>`).join('')
    root.innerHTML = `
<div class="bb-app">
  <div class="bb-body">
    <div class="bb-hero">
      <h1>${t('appName')}</h1>
      <p>${t('homeTagline')}</p>
      <div class="bb-panel" style="padding:16px;text-align:left">
        <input class="bb-input" data-url placeholder="${t('urlPlaceholder')}" />
        <div class="bb-row" style="margin-top:10px">
          <select class="bb-sel" data-tpl>${tplOpts}</select>
          <select class="bb-sel" data-detail>${detOpts}</select>
          <button class="bb-btn" data-bookmark>${t('saveLink')}</button>
          <button class="bb-btn primary" data-go style="flex:1">${t('addToQueue')}</button>
        </div>
        <div class="bb-muted" data-warn style="font-size:11px;margin-top:8px;min-height:14px"></div>
      </div>
      <div class="bb-row" style="justify-content:center;gap:16px;margin-top:14px;font-size:11px;color:var(--bb-text-subtle)">
        <span>${t('featTranscript')}</span><span>${t('featSummary')}</span><span>${t('featSave')}</span>
      </div>
    </div>
    <div data-queue style="max-width:640px;margin:18px auto 0"></div>
  </div>
</div>`
    const urlEl = root.querySelector('[data-url]'), warnEl = root.querySelector('[data-warn]')
    const check = () => {
      const raw = urlEl.value, u = extractUrl(raw)
      warnEl.textContent = !raw ? '' : !httpLink(u) ? t('errInvalidLink') : !isSupported(u) ? t('linkOnlyHint') : (u !== raw.trim() ? t('warnExtracted') : t('warnReady'))
    }
    homeCheck = check
    urlEl.addEventListener('input', check)
    urlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
    root.querySelector('[data-go]').addEventListener('click', go)
    const saveButton = root.querySelector('[data-bookmark]')
    saveButton.addEventListener('click', async () => {
      if (saveButton.disabled) return
      saveButton.disabled = true; saveButton.textContent = t('savingLink')
      try {
        await saveLink(urlEl.value)
        urlEl.value = ''; warnEl.textContent = t('savedLink')
      } catch (e) { say2(t('saveFailed', { msg: (e && e.message) || String(e) }), { level: 'error' }) }
      finally { saveButton.disabled = false; saveButton.textContent = t('saveLink') }
    })
    function go() {
      const url = extractUrl(urlEl.value.trim()); if (!url) return
      if (!isSupported(url)) { say2(t('notifyUnsupported'), { level: 'warning' }); return }
      qAdd(url, root.querySelector('[data-tpl]').value, root.querySelector('[data-detail]').value)
      urlEl.value = ''; warnEl.textContent = t('warnQueued')
    }
    renderQueue()
  }

  function renderQueue() {
    const box = root.querySelector('[data-queue]'); if (!box) return
    if (!queue.items.length) { box.innerHTML = ''; return }
    box.innerHTML = `
<div class="bb-panel" style="padding:12px;text-align:left">
  <div class="bb-row" style="justify-content:space-between;margin-bottom:2px">
    <span class="bb-label">${t('queueTitle')}</span>
    ${queue.items.some((i) => i.status === 'completed') ? `<button class="bb-btn ghost sm" data-cleardone>${t('queueClearDone')}</button>` : ''}
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
    const ttl = document.createElement('div'); ttl.className = 'ttl'; ttl.textContent = it.title || it.url; ttl.title = it.url
    const sub = document.createElement('div'); sub.className = 'sub'
    const lbl = it.status === 'pending' ? t('stQueued') : it.status === 'completed' ? t('stDone') : it.status === 'error' ? t('stFailed') : (qStageText(it) || t('stWorking'))
    sub.textContent = lbl + (active && it.progress > 0 ? ` · ${Math.round(it.progress)}%` : '') + (active && it.startedAt ? ` · ${Math.round((Date.now() - it.startedAt) / 1000)}s` : '')
    mid.appendChild(ttl); mid.appendChild(sub)
    const errText = it.status === 'error' ? qErrText(it) : ''
    if (errText) { const er = document.createElement('div'); er.className = 'err'; er.textContent = errText; er.title = errText; mid.appendChild(er) }
    if (active && it.progress > 0) {
      const tr = document.createElement('div'); tr.className = 'bb-prog-track'; tr.style.marginTop = '5px'
      const f = document.createElement('div'); f.className = 'bb-prog-fill'; f.style.width = Math.min(100, it.progress) + '%'
      tr.appendChild(f); mid.appendChild(tr)
    }
    const acts = document.createElement('div'); acts.className = 'acts'
    const btn = (txt, fn) => { const b = document.createElement('button'); b.className = 'bb-btn ghost sm'; b.textContent = txt; b.addEventListener('click', (e) => { e.stopPropagation(); fn() }); acts.appendChild(b) }
    if (it.status === 'completed') btn(t('actView'), () => openRun(it))
    else if (active) btn(t('cancel'), () => qCancel(it.id))
    if (it.status === 'completed' || it.status === 'error') btn(t('actRemove'), () => qRemove(it.id))
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
      title: it.title || (live ? t('analyzing') : t('platVideo')), summary: it.summary || '', data: it.data,
      sourceUrl: it.url, plat: it.plat, sessionId: it.sessionId, entryId: it.entryId, notePath: it.notePath,
      detail: it.detail, generatedAt: it.endedAt || null, runId: it.id,
    }
    renderDetail(live, it.status === 'error' ? qErrText(it) : '')
    if (live) syncRunUI(it)
  }

  /** 直播态只刷数字与文案,不整页重绘(不打断 QA 输入/滚动位置)。 */
  function syncRunUI(it) {
    const box = root.querySelector('[data-prog]'); if (!box) return
    box.style.display = ''
    const sec = it.startedAt ? ` · ${Math.round((Date.now() - it.startedAt) / 1000)}s` : ''
    const statusEl = root.querySelector('[data-status]'), pctEl = root.querySelector('[data-pct]'), bar = root.querySelector('[data-bar]')
    if (statusEl) statusEl.textContent = it.status === 'error' ? t('failedPrefix', { msg: qErrText(it) }) : qStageText(it) + sec
    if (pctEl) pctEl.textContent = it.status === 'error' ? '' : `${Math.round(it.progress)}%`
    if (bar) bar.style.width = `${Math.min(100, it.progress)}%`
    if (it.status === 'error') box.classList.add('err')
    const steps = root.querySelector('[data-steps]')
    if (steps) for (let i = 0; i < steps.children.length; i++) {
      const th = STEPS[i][1], next = STEPS[i + 1] ? STEPS[i + 1][1] : 101
      steps.children[i].className = 'bb-step' + (it.progress >= next ? ' done' : it.progress >= th ? ' on' : '')
    }
  }

  function renderMedia(media, meta) {
    const localName = archivedMediaName(view.summary)
    if (localName) {
      const player = document.createElement(/\.(mp4|webm|mov|m4v)$/i.test(localName) ? 'video' : 'audio')
      player.controls = true; player.preload = 'metadata'; player.src = archivedAssetUrl(localName)
      player.style.cssText = 'width:100%;height:100%;object-fit:contain'
      let pendingSeek = null
      const applySeek = () => {
        if (pendingSeek == null || !player.readyState) return
        player.currentTime = Number.isFinite(player.duration) ? Math.min(pendingSeek, player.duration) : pendingSeek
        pendingSeek = null
        player.play().catch(() => {})
      }
      seekHandler = sec => { pendingSeek = sec; applySeek() }
      player.addEventListener('loadedmetadata', applySeek)
      player.addEventListener('error', () => say2(L() === 'en' ? 'Archived media is unavailable. Check the file in the library assets folder.' : '存档媒体不可用，请检查收藏夹 assets 文件夹中的原始文件。', { level: 'warning' }))
      media.replaceChildren(player)
      return
    }
    const seek = (sec) => {
      if (view.plat.embed) { media.innerHTML = ''; const f = document.createElement('iframe'); f.src = view.plat.embed(sec); f.allow = 'autoplay; fullscreen'; media.appendChild(f) }
      else say2(L() === 'en' ? 'This source cannot seek in-app. Archive the original media to enable timestamp playback.' : '此平台暂不支持应用内定位；存档原始媒体后即可点击时间引用跳转。', { level: 'warning' })
    }
    seekHandler = seek
    if (view.plat.embed) { const f = document.createElement('iframe'); f.src = view.plat.embed(0); f.allow = 'autoplay; fullscreen'; media.appendChild(f); return }
    media.innerHTML = ''
    const thumb = safeHref(meta.thumbnail || '')
    const hasThumb = /^https:/i.test(thumb)
    if (hasThumb) { const img = document.createElement('img'); img.className = 'bb-thumb'; img.src = thumb; img.addEventListener('error', () => img.remove()); media.appendChild(img) }
    const ph = document.createElement('div'); ph.className = 'bb-ph' + (hasThumb ? ' ov' : '')
    const icon = document.createElement('div'); icon.style.fontSize = '28px'; icon.textContent = '▶'
    const lab = document.createElement('div'); lab.textContent = view.plat.platform ? platLabel(view.plat.platform) : t('linkLabel')
    ph.appendChild(icon); ph.appendChild(lab)
    if (view.sourceUrl) { const a = document.createElement('a'); a.href = safeHref(view.sourceUrl); a.target = '_blank'; a.rel = 'noopener'; a.textContent = t('openInBrowser'); a.style.fontSize = '12px'; if (!hasThumb) a.style.color = 'var(--bb-primary)'; ph.appendChild(a) }
    media.appendChild(ph)
  }

  /** 新版 Space 中，插件 pane 只保留媒体和任务控制。文档与问答分别由 Amadeus / ChatView
   *  原生 pane 承担，因此这里没有第二层滚动容器，也不复制 Markdown/聊天 UI。 */
  function renderNativeDetail(loading, errText) {
    const meta = (view.data && view.data.meta) || {}
    const title = meta.title || view.title || deriveTitle(view.summary) || (view.kind === 'link' ? t('linkLabel') : t('platVideo'))
    const metaLine = [view.plat.platform ? platLabel(view.plat.platform) : t('linkLabel'), meta.author, meta.duration ? fmtTime(meta.duration) : ''].filter(Boolean).join(' · ')
    root.innerHTML = `
<div class="bb-app bb-native">
  <div class="bb-hdr">
    <button class="bb-btn ghost sm" data-back title="${t('back')}">←</button>
    <div class="bb-native-title"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-title></div><div class="bb-muted" style="font-size:11px" data-metaline></div></div>
    <div class="bb-native-actions">
      ${view.kind === 'link' ? '' : `<button class="bb-btn ghost sm" data-restart ${loading ? 'disabled' : ''}>${t('resummarize')}</button>`}
      <button class="bb-btn ghost sm" data-export ${loading ? 'disabled' : ''}>${t('exportBtn')}</button>
      <button class="bb-btn primary sm" data-save ${loading ? 'disabled' : ''}>${view.entryId ? t('openNote') : t('saveToLibrary')}</button>
    </div>
  </div>
  <div class="bb-body">
    <div class="bb-prog" data-prog style="display:none">
      <div class="bb-prog-head"><span data-status></span><span data-pct></span></div>
      <div class="bb-prog-track"><div class="bb-prog-fill" data-bar></div></div>
      <div class="bb-steps" data-steps>${STEPS.map((s) => `<span class="bb-step">${t(s[0])}</span>`).join('')}</div>
    </div>
    <div class="bb-native-stage">
      <div class="bb-media" data-media></div>
      <div class="bb-native-note">
        <strong data-native-note></strong>
        <span>${t('nativeChatHint')}</span>
      </div>
    </div>
  </div>
</div>`
    const $ = (s) => root.querySelector(s)
    $('[data-title]').textContent = title
    $('[data-metaline]').textContent = metaLine
    $('[data-native-note]').textContent = view.notePath ? t('nativeDocument') : t('nativeDocumentPending')
    $('[data-back]').addEventListener('click', renderHome)
    const restart = $('[data-restart]'); if (restart) restart.addEventListener('click', (e) => { if (view.sourceUrl) resummarize(e.currentTarget) })
    $('[data-save]').addEventListener('click', doSave)
    $('[data-export]').addEventListener('click', (e) => exportMenu(e.currentTarget))
    renderMedia($('[data-media]'), meta)
    if (errText) { const box = $('[data-prog]'); box.style.display = ''; box.classList.add('err'); $('[data-status]').textContent = t('failedPrefix', { msg: errText }) }
    if (view.notePath && !view.playbackOnly) openNotePath(view.notePath, false)
  }

  // ── 详情(直播 / 结果 / 收藏共用一张脸) ──
  function renderDetail(loading, errText) {
    if (nativeWorkbench) { renderNativeDetail(loading, errText); return }
    if (view.kind === 'link') { renderBookmarkDetail(); return }
    const meta = (view.data && view.data.meta) || {}
    const title = meta.title || view.title || deriveTitle(view.summary) || t('platVideo')
    const metaLine = [platLabel(view.plat.platform), meta.author, meta.duration ? fmtTime(meta.duration) : ''].filter(Boolean).join(' · ')
    root.innerHTML = `
<div class="bb-app">
  <div class="bb-hdr">
    <button class="bb-btn ghost sm" data-back title="${t('back')}">←</button>
    <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-title></div><div class="bb-muted" style="font-size:11px" data-metaline></div></div>
    <button class="bb-btn ghost sm" data-restart ${loading ? 'disabled' : ''}>${t('resummarize')}</button>
    <button class="bb-btn ghost sm" data-export ${loading ? 'disabled' : ''}>${t('exportBtn')}</button>
    <button class="bb-btn primary sm" data-save ${loading ? 'disabled' : ''}>${view.entryId ? t('openNote') : t('saveToLibrary')}</button>
  </div>
  <div class="bb-body">
    <div class="bb-prog" data-prog style="display:none">
      <div class="bb-prog-head"><span data-status></span><span data-pct></span></div>
      <div class="bb-prog-track"><div class="bb-prog-fill" data-bar></div></div>
      <div class="bb-steps" data-steps>${STEPS.map((s) => `<span class="bb-step">${t(s[0])}</span>`).join('')}</div>
    </div>
    <div class="bb-cols">
      <div class="bb-col-l">
        <div class="bb-media" data-media></div>
        <div class="bb-panel" style="padding:10px;flex:1;display:flex;flex-direction:column;min-height:220px">
          <div class="bb-label" style="margin-bottom:6px">${t('qaTitle')}</div>
          <div class="bb-qa">
            <div class="bb-qa-log" data-qalog></div>
            <div class="bb-row" style="margin-top:8px"><input class="bb-input" data-qin placeholder="${loading ? t('qaPlaceholderWait') : t('qaPlaceholder')}" ${loading ? 'disabled' : ''} style="flex:1;padding:7px 10px"/><button class="bb-btn primary sm" data-ask ${loading ? 'disabled' : ''}>${t('qaSend')}</button></div>
          </div>
        </div>
      </div>
      <div class="bb-col-r">
        <div class="bb-tabs"><div class="bb-tab on" data-tab="s">${t('tabSummary')}</div><div class="bb-tab" data-tab="t">${t('tabTranscript')}</div></div>
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
    renderMedia($('[data-media]'), meta)
    // 标签切换 + 提示行(照原版 RightPanelTabs 的 hint)
    const outEl = $('[data-summary]'), trEl = $('[data-transcript]'), hintEl = $('[data-hint]')
    const music = isMusic(view.plat.platform)
    const tabT = root.querySelector('[data-tab="t"]'); if (tabT) tabT.textContent = t(music ? 'tabLyrics' : 'tabTranscript')
    const setHint = (s) => {
      const n = (view.data && view.data.segments && view.data.segments.length) || 0
      // 量词按语言取:英文 1 条要用单数(中文两键同形),别让英文界面出现 "1 segments"
      hintEl.textContent = s ? t('hintSummary') : t(music ? 'hintLyrics' : 'hintTranscript', { count: n ? t(n === 1 ? 'hintCountOne' : 'hintCount', { n }) : '' })
    }
    setHint(true)
    root.querySelectorAll('[data-tab]').forEach((tabEl) => tabEl.addEventListener('click', () => {
      root.querySelectorAll('[data-tab]').forEach((x) => x.classList.remove('on')); tabEl.classList.add('on')
      const s = tabEl.getAttribute('data-tab') === 's'
      outEl.style.display = s ? '' : 'none'; trEl.style.display = s ? 'none' : ''
      for (const sel of ['[data-wc]', '[data-tags]', '[data-chapters]', '[data-gen]']) $(sel).style.display = s ? '' : 'none'
      setHint(s)
    }))
    if (errText) { const box = $('[data-prog]'); box.style.display = ''; box.classList.add('err'); $('[data-status]').textContent = t('failedPrefix', { msg: errText }) }
    fillSummary(loading); fillTranscript(); wireQA(loading)
  }

  function renderBookmarkDetail() {
    const meta = (view.data && view.data.meta) || {}
    root.innerHTML = bookmarkDetailMarkup()
    const $ = (s) => root.querySelector(s)
    $('[data-title]').textContent = meta.title || view.title || deriveTitle(view.summary)
    $('[data-metaline]').textContent = view.plat.platform ? platLabel(view.plat.platform) : t('linkLabel')
    $('[data-back]').addEventListener('click', renderHome)
    $('[data-browser]').setAttribute('href', safeHref(view.sourceUrl))
    $('[data-save]').addEventListener('click', doSave)
    $('[data-export]').addEventListener('click', (event) => exportMenu(event.currentTarget))
    seekHandler = null
    renderMarkdown($('[data-summary]'), view.summary)
    const time = view.savedAt || view.generatedAt
    $('[data-gen]').textContent = time ? t('savedAt', { time: new Date(time).toLocaleString(dateLoc()) }) : ''
  }

  function fillSummary(loading) {
    const outEl = root.querySelector('[data-summary]'); if (!outEl) return
    if (loading && !view.summary) outEl.textContent = '…'
    else renderMarkdown(outEl, view.summary || t('noSummary'), (sec) => seekHandler && seekHandler(sec))
    // 字数横幅(照原版:达标/偏少/偏多 + 目标区间 + 档位)
    const wc = root.querySelector('[data-wc]'); wc.innerHTML = ''
    if (view.summary && !loading) {
      const n = countWords(view.summary), st = wordState(n, view.detail)
      if (st) { const b = document.createElement('span'); b.className = 'st' + (st === t('wcOk') ? '' : ' warn'); b.textContent = st; wc.appendChild(b) }
      const r = WORD_RANGES[view.detail]
      const tx = document.createElement('span')
      tx.textContent = t('wcCount', { n }) + (r ? t('wcTarget', { min: r[0], max: r[1] }) : '') + (DETAIL_KEY[view.detail] ? t('wcDetail', { name: detailLabel(view.detail) }) : '')
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
    gen.textContent = view.generatedAt && !loading ? t('generatedAt', { time: new Date(view.generatedAt).toLocaleString(dateLoc()) }) : ''
  }

  function fillTranscript() {
    const trEl = root.querySelector('[data-transcript]'); if (!trEl) return
    trEl.innerHTML = ''
    const segs = (view.data && Array.isArray(view.data.segments)) ? view.data.segments : []
    if (!segs.length) { const em = document.createElement('div'); em.className = 'bb-empty'; em.textContent = t(isMusic(view.plat.platform) ? 'noLyrics' : 'noTranscript'); trEl.appendChild(em); return }
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
      if (!view.sessionId) { say2(t('needAnalyzeFirst'), { level: 'warning' }); return }
      const cfg = await getCfg(), unavailable = engineError(cfg)
      if (unavailable) { say2(t(unavailable), { level: 'error' }); return }
      inp.value = ''
      const u = document.createElement('div'); u.className = 'bb-msg u'; u.textContent = q; log.appendChild(u)
      const a = document.createElement('div'); a.className = 'bb-msg a'; a.textContent = '…'; log.appendChild(a); log.scrollTop = log.scrollHeight
      ask.disabled = true
      if (qaController) qaController.abort(); qaController = new AbortController(); const sig = qaController.signal
      try { const ans = await runAgent(cfg, view.sessionId, q + respondIn(), (full) => { a.textContent = full; log.scrollTop = log.scrollHeight }, sig); renderMarkdown(a, ans || t('noAnswer'), (sec) => seekHandler && seekHandler(sec)) }
      catch (e) { if (!sig.aborted) a.textContent = t('failedPrefix', { msg: (e && e.message) || e }) } finally { ask.disabled = false }
    }
    ask.addEventListener('click', send); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
  }

  // ── 重新总结:小弹层选模板+档位 → 重新排队(照原版 GenerateSummaryModal 的精简版) ──
  function resummarize(anchor) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'; box.style.minWidth = '230px'; box.style.padding = '12px'
    const r = anchor.getBoundingClientRect(); box.style.left = Math.max(8, r.right - 240) + 'px'; box.style.top = (r.bottom + 4) + 'px'
    const cap = document.createElement('div'); cap.className = 'bb-label'; cap.style.marginBottom = '8px'; cap.textContent = t('resummarizeTitle')
    const s1 = document.createElement('select'); s1.className = 'bb-sel'; s1.style.width = '100%'
    for (const v of TEMPLATES) { const o = document.createElement('option'); o.value = v; o.textContent = tplLabel(v); if (v === getSetting('defaultTemplate', '通用')) o.selected = true; s1.appendChild(o) }
    const s2 = document.createElement('select'); s2.className = 'bb-sel'; s2.style.width = '100%'; s2.style.marginTop = '6px'
    for (const k of Object.keys(DETAILS)) { const o = document.createElement('option'); o.value = k; o.textContent = detailLabel(k); if (k === (view.detail || getSetting('detail', 'standard'))) o.selected = true; s2.appendChild(o) }
    const goBtn = document.createElement('button'); goBtn.className = 'bb-btn primary sm'; goBtn.style.cssText = 'margin-top:10px;width:100%'; goBtn.textContent = t('start')
    goBtn.addEventListener('click', () => { closeMenus(); renderRun(qAdd(view.sourceUrl, s1.value, s2.value)) })
    box.appendChild(cap); box.appendChild(s1); box.appendChild(s2); box.appendChild(goBtn); showMenu(box)
  }

  // 当前视图态 → saveEntry 载荷(自动保存在 qRun 里;这里是手动保存/导出存笔记)
  const currentEntry = () => ({ id: view.entryId, kind: view.kind, savedAt: view.savedAt, summaryMarkdown: view.summary, meta: (view.data && view.data.meta) || { platform: view.plat.platform, videoId: view.plat.videoId, videoUrl: view.sourceUrl }, segments: (view.data && view.data.segments) || [], chapters: (view.data && view.data.chapters) || [], tags: (view.data && view.data.tags) || [], sourceUrl: view.sourceUrl, folderId: null, detail: view.detail })
  const markSaved = (r) => {
    view.entryId = r.id; view.notePath = r.notePath
    if (view.runId) { const it = qFind(view.runId); if (it) { it.entryId = r.id; it.notePath = r.notePath } }
    bus.emit({ type: 'saved' })
    const b = root.querySelector('[data-save]'); if (b) b.textContent = t('openNote')
    const noteState = root.querySelector('[data-native-note]'); if (noteState) noteState.textContent = t('nativeDocument')
    if (nativeWorkbench) openNotePath(r.notePath, false)
  }
  async function doSave() {
    if (view.entryId && view.notePath) { openNotePath(view.notePath); return } // 已保存 → 在 Amadeus 里打开笔记
    if (!view.summary.trim()) { say2(t('nothingToSave'), { level: 'warning' }); return }
    try { const r = await saveEntry(currentEntry()); markSaved(r); say2(t('savedToLibrary'), { level: 'success' }) }
    catch (e) { say2(t('saveFailed', { msg: (e && e.message) || e }), { level: 'error' }) }
  }
  function exportMenu(anchor) {
    closeMenus()
    const box = document.createElement('div'); box.className = 'bb-menu'; const r = anchor.getBoundingClientRect(); box.style.left = r.left + 'px'; box.style.top = (r.bottom + 4) + 'px'
    const segs = (view.data && view.data.segments) || []
    const dl = (name, text, mime) => { const b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = sanitizeFileName(deriveTitle(view.summary)) + name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); closeMenus() }
    const add = (label, fn) => { const d = document.createElement('div'); d.textContent = label; d.addEventListener('click', fn); box.appendChild(d) }
    const noSeg = segs.length ? '' : t('noTranscriptSuffix')
    add(t('expCopyMd'), async () => { try { await navigator.clipboard.writeText(view.summary); say2(t('copied'), { level: 'success' }) } catch { say2(t('copyFailed'), { level: 'error' }) } closeMenus() })
    add(t('expMd'), () => dl('.md', view.summary, 'text/markdown'))
    add(t('expObsidian'), () => dl('.md', toObsidian((view.data && view.data.meta), view.summary, view.sourceUrl), 'text/markdown'))
    if (view.kind !== 'link') {
      add(t('expSrt', { suffix: noSeg }), () => segs.length ? dl('.srt', toSRT(segs)) : say2(t('noTranscriptData'), { level: 'warning' }))
      add(t('expTxt', { suffix: noSeg }), () => segs.length ? dl('.txt', toTXT(segs, true)) : say2(t('noTranscriptData'), { level: 'warning' }))
    }
    add(t('expJson'), () => dl('.json', JSON.stringify({ kind: view.kind, savedAt: view.savedAt, meta: (view.data && view.data.meta) || {}, summaryMarkdown: view.summary, segments: segs, chapters: (view.data && view.data.chapters) || [], tags: (view.data && view.data.tags) || [], exportedAt: new Date().toISOString() }, null, 2), 'application/json'))
    add(t('expSaveNote'), async () => { closeMenus(); try { const r = await saveEntry(currentEntry()); markSaved(r); openNotePath(r.notePath); say2(t('savedAsNote'), { level: 'success' }) } catch (e) { say2(t('failedPrefix', { msg: (e && e.message) || e }), { level: 'error' }) } })
    showMenu(box)
  }

  async function openSaved(id, options = {}) {
    const generation = ++openGeneration
    const requestedScope = playbackScope()
    if (options.playbackOnly && mediaScope === requestedScope && cur.kind === 'entry' && cur.id === id && seekHandler) { seekHandler(options.at); return }
    const full = await loadEntry(id)
    if (disposed || generation !== openGeneration || requestedScope !== playbackScope()) return
    mediaScope = requestedScope
    if (!full) { say2(t('entryMissing'), { level: 'error' }); renderHome(); return }
    const sourceUrl = full.sourceUrl || (full.meta && full.meta.videoUrl) || ''
    cur = { kind: 'entry', id, live: false }
    view = {
      title: (full.meta && full.meta.title) || '', summary: full.summaryMarkdown || '', kind: full.kind,
      data: { meta: full.meta || {}, segments: full.segments || [], chapters: full.chapters || [], tags: full.tags || [] },
      sourceUrl, plat: parsePlatform(sourceUrl), sessionId: uuid(), entryId: id, notePath: full.notePath || null,
      detail: full.detail || '', generatedAt: full.generatedAt || null, savedAt: full.savedAt || null, runId: null,
      playbackOnly: !!options.playbackOnly,
    }
    renderDetail(false)
    if (options.playbackOnly) { if (seekHandler) seekHandler(options.at); return }
    // 给新会话垫一句字幕上下文,之后追问 Agent 就记得了
    // ⚠️ 这条也要带 respondIn():否则英文界面下模型先回一句中文「好的记住了」,这轮中文 assistant 进了会话历史,会把后续问答带回中文
    if (view.kind !== 'link' && view.data.segments.length) { const cfg = await getCfg(); if (!engineError(cfg)) runAgent(cfg, view.sessionId, `以下是视频《${(full.meta && full.meta.title) || ''}》的字幕,后续我会基于它提问,先记住不必回复长篇:\n${view.data.segments.slice(0, 400).map((s) => `[${fmtTime(s.start)}] ${s.text}`).join('\n')}${respondIn()}`, null).catch(() => {}) }
  }

  // ── 总线消费:library 打开请求 / 队列变更 / 直播 token ──
  const consume = (e) => { if (!e || (e.scope && e.scope !== playbackScope())) return; if (e.fresh) renderHome(); else if (e.entryId) openSaved(e.entryId, e) }
  const playbackTarget = { get scope() { return playbackScope() }, native: nativeWorkbench, entryId: () => mediaScope === playbackScope() && cur.kind === 'entry' ? cur.id : null,
    visible: () => root.isConnected && root.getClientRects().length > 0, open: ref => openSaved(ref.entryId, { ...ref, playbackOnly: true }) }
  playbackTargets.add(playbackTarget)
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
      if (it) {
        view.summary = it.summary
        if (outEl) outEl.textContent = it.summary
      }
    }
  })
  // 秒表:活动 run 的耗时逐秒走(首页队列行 + 直播页);无活动任务时空转,开销可忽略
  const tick = setInterval(() => {
    if (!qActive().length) return
    if (cur.kind === 'home') renderQueue()
    else if (cur.kind === 'run' && cur.live) { const it = qFind(cur.id); if (it) syncRunUI(it) }
  }, 1000)

  /** 语言变更:按当前视图态原地重画(**不重挂视图**),重建前后把用户的现场原样搬过去
   *  (链接/模板/详细度、整段 QA 记录、没发出去的那句提问)。运行中的队列/直播态不受影响 —— 只是换一套字。
   *  注意快照/回填只放在这里,不放进 renderHome —— 后者同时是「返回」按钮的路径,那里重置才是对的。 */
  function repaint() {
    closeMenus()
    const snap = snapshotStage(root, cur.kind === 'home' ? 'home' : 'detail')
    if (cur.kind === 'run') { const it = qFind(cur.id); if (it) { renderRun(it); restoreStage(root, snap); return } }
    else if (cur.kind === 'entry' && view) { renderDetail(false); restoreStage(root, snap); return }
    renderHome(); restoreStage(root, snap); if (homeCheck) homeCheck()
  }
  const offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(() => repaint()) : null

  ensureWorkFolder() // folder 视图可单独打开(状态栏/命令),不能只靠 library 建夹
  if (pendingOpen) { const p = pendingOpen; pendingOpen = null; consume(p) } else renderHome()

  return () => { disposed = true; openGeneration++; playbackTargets.delete(playbackTarget); off(); offBus(); if (offLocale) offLocale(); clearInterval(tick); if (qaController) qaController.abort() } // 队列不随视图死:分析继续、自动落盘
}

// ── 注册 ──
// ⚠️ 视图标签页 / 命令面板的标题是**单字符串**,宿主那两处是直接 append 不去重(pluginStore registerView/registerCommand),
//    重注册会长出重复项 —— 所以它们取的是**注册那一刻**的语言,切语言后要等重启才跟上(不许为它做重注册/自我 teardown)。
//    两个例外,下面订了语言就地更新:状态栏有 update() 句柄;设置项是**同 key 覆盖**,重注册一次即可。
// workspaceSource(2026-08-25 宿主 P2):folder/library 做主视图时,统一工作区左栏自动切到下面的
// 收藏条目列表源(仅在左栏是统一 workspace 视图的 Space 生效;青鸟自己的 Space 左栏=完整 library 面,不受影响)。
ctx.registerView({ id: 'folder', title: t('viewFolder'), mount: mountAnalyze, singleton: true, workspaceSource: 'library-list' })
// 统一左栏列表源(宿主 2026-08-25+ 才有;老宿主可选调用即静默跳过):收藏条目的**平面投影**——
// 完整体验(搜索/文件夹管理/卡片/新建)仍在 library 视图,这里只供统一工作区联动列条目、一键打开。
if (ctx.registerListSource) {
  // ── 统一左栏数据源(宿主 2026-08-25+):把收藏夹整面交给统一工作区 UI 渲染 ──
  // 青鸟只出**数据与动作**,不出 UI:搜索词/选中文件夹由宿主持有并经 items({query,group}) 回传,
  // 故这里对界面状态完全无状态。空间配方(spaces/bluebird/space.json)左栏因此改用 workspace 视图。
  let lidx = { folders: [], items: [] }
  const listSubs = new Set()
  const fire = () => listSubs.forEach((f) => { try { f() } catch { /* ignore */ } })
  const listReload = async () => {
    try { lidx = (await readIndex()) || { folders: [], items: [] } } catch { lidx = { folders: [], items: [] } }
    fire()
  }
  void listReload()
  // 收藏落盘 / 条目改动即刷新(队列进度噪音不重载)
  bus.on((e) => { if (e.type === 'saved') void listReload() })
  const NONE = '__none' // 「未分类」的分组键(folderId 为空的条目)
  ctx.registerListSource({
    id: 'library-list',
    title: t('viewLibrary'),
    search: true,
    items: (f) => {
      const q = ((f && f.query) || '').trim().toLowerCase()
      const g = f && f.group
      return (lidx.items || [])
        .filter((it) => (g == null ? true : g === NONE ? !it.folderId : it.folderId === g))
        .filter((it) => !q || String(it.title || '').toLowerCase().includes(q) || String(it.author || '').toLowerCase().includes(q))
        .map((it) => ({
          key: it.id,
          title: it.title || it.videoUrl || t('libUntitled'),
          hint: it.date || '',
          // 行首图标:平台官方 favicon(与详情页/旧侧栏同一张 PLATFORM_FAVICON 表),
          // 宿主 2026-08-28+ 认 iconUrl。取不到(老宿主 / 断网 / CDN 404)就退下面这行的
          // 词表键 —— 词表无平台专属图标,故按**内容类型**分:音乐=书签、图文=图片、其余=链接。
          iconUrl: PLATFORM_FAVICON[it.platform] || undefined,
          icon: isMusic(it.platform) ? 'bookmark' : it.platform === 'xiaohongshu' ? 'image' : 'link',
        }))
    },
    groups: () => {
      const c = {}
      for (const it of lidx.items || []) { const k = it.folderId || NONE; c[k] = (c[k] || 0) + 1 }
      const out = (lidx.folders || []).map((f) => ({ key: f.id, title: f.name, count: c[f.id] || 0, icon: 'folder' }))
      if (c[NONE]) out.push({ key: NONE, title: t('libNone'), count: c[NONE] })
      return out
    },
    actions: [{ id: 'new', label: t('libNew'), run: () => { pendingOpen = { fresh: true }; bus.emit({ type: 'open', fresh: true }); ctx.openView('folder') } }],
    groupActions: [{
      id: 'new-folder',
      label: t('promptNewFolder'),
      run: () => { void (async () => {
        const name = await askStr(t('promptNewFolder'), '')
        if (!name) return
        const idx = await readIndex(); idx.folders.push({ id: uuid(), name }); await writeIndex(idx); await listReload()
      })() },
    }],
    itemMenu: (item) => [
      { id: 'move', label: t('menuMove'), run: () => { void (async () => {
        const idx = await readIndex()
        const names = [t('libNone'), ...(idx.folders || []).map((f) => f.name)]
        const pick = await askStr(t('promptMoveTo', { names: names.join(' / ') }), '')
        if (pick == null) return
        const f = (idx.folders || []).find((x) => x.name === pick)
        const hit = (idx.items || []).find((x) => x.id === item.key)
        if (!hit) return
        hit.folderId = f ? f.id : null
        await writeIndex(idx); await listReload(); bus.emit({ type: 'saved' })
      })() } },
      { id: 'delete', label: t('menuDelete'), run: () => { void (async () => {
        const idx = await readIndex()
        idx.items = (idx.items || []).filter((x) => x.id !== item.key)
        await writeIndex(idx); await listReload(); bus.emit({ type: 'saved' })
      })() } },
    ],
    // ⚠️订阅时**必重读一次**:插件是在宿主**启动期**激活的(bootstrapEngine 装插件),而 vault 根的
    //   恢复是懒的(ensureAmadeusReady,要等笔记/聊天类视图挂载)—— 上面那次 listReload 几乎必然
    //   撞在「还没有活动库」上,宿主 readFile 此时**静默返回 null**(不抛),于是 lidx 恒空、列表恒空,
    //   只有下一次 'saved' 才救得回来。1.7.x 的自绘面没这毛病:它是每次 mount 都 refresh 一遍。
    //   宿主挂载/切库都会重订阅(WorkspaceView 的 effect 以 vaultRoot 为键),这里顺势重读。
    subscribe: (cb) => { listSubs.add(cb); void listReload(); return () => listSubs.delete(cb) },
    open: (item) => { pendingOpen = { entryId: item.key }; bus.emit({ type: 'open', entryId: item.key }); ctx.openView('folder') },
  })
}

ctx.registerCommand({ id: 'bluebird-open', title: t('cmdOpen'), keywords: 'bluebird 青鸟 视频 总结 字幕 video summary transcript', run: () => ctx.openView('folder') })
// 「打开侧栏」= 打开工作台(青鸟 Space 的左栏配方本身就是统一工作区 + 本插件列表源)。
// 自绘 library 视图已于 2.0.0 移除:收藏夹左栏只此一套 UI,用户不会再看到旧面。
ctx.registerCommand({ id: 'bluebird-library', title: t('cmdLibrary'), keywords: 'bluebird 青鸟 收藏 library history', run: () => ctx.openView('folder') })
const sb = ctx.registerStatusItem && ctx.registerStatusItem({ id: 'open', side: 'right', text: t('statusText'), title: t('statusTitle'), onClick: () => ctx.openView('folder') })
const offLocaleTop = ctx.subscribeLocale ? ctx.subscribeLocale(() => {
  if (sb && sb.update) sb.update({ text: t('statusText'), title: t('statusTitle') })
  registerSettings() // 同 key 覆盖 → 设置页两行就地换语言;顺序不变(宿主的「工作文件夹」行仍在最前)
}) : null

if (globalThis.__BLUEBIRD_TEST__) {
  Object.assign(globalThis.__BLUEBIRD_TEST__, { citationSeconds, parseTimeReference, legacyTimeReference, archivedMediaName, entryForNote, timestampEditorExtension, requestTimestamp, playbackTargets, playbackScope, saveEntry })
  Object.assign(globalThis.__BLUEBIRD_TEST__, { inline, renderMarkdown, linkifyTimestamps, safeHref, deriveTitle, sanitizeFileName, today, parsePlatform, isMusic, openNotePath, stripPreamble, mediaSaveDir, assetVaultRel, archivedAssetUrl, getCfg, engineError, runAgent, asrTranscribeFile, saveLink, loadEntry, readIndex, httpLink, bookmarkDetailMarkup, extractUrl, isSupported, parseAgentOutput, fmtTime, parseTs, toSRT, toTXT, toObsidian, onColorOf, readableOn, contrast, folderRoot, stageOf, stageText, countWords, wordState, STEPS, queue, qAdd, qCancel, qRemove, qClearDone, qStageText, qErrText, snapshotStage, restoreStage, ensureWorkFolder, MSG, L, t, badge, platLabel, tplLabel, detailLabel, fmtDate, mirrorLinkMode, MODE_FILE })
}

return () => { // 插件停用才断分析
  if (sb && sb.dispose) sb.dispose()
  if (offLocaleTop) offLocaleTop()
  clearInterval(modeTick) // 不清会吊住 node 事件循环(check.mjs 直接挂住),插件停用后也不该再写盘
  queue.items.forEach((i) => { if (i.controller) i.controller.abort() })
}
