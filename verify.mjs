/**
 * 青鸟收藏夹 bundle 契约层验证器(镜像宿主规则)。跑法:node verify.mjs
 * 全绿退出 0;任何违约打 ❌ 并以 1 退出。规则出处见各断言注释,与 20260717/validate.mjs 同源。
 *
 * 2026-07-24 起本仓是**捆绑包(bundle)**布局:插件 manifest.json 在根,内嵌内容按约定子目录放——
 *   agents/<slug>/(config.toml 标志;agent 内可带 skills/<slug>/ agent 级技能)
 *   spaces/<slug>/space.json、tangu-plugins/<pid>/tangu-plugin.json(本包无引擎插件)
 * 宿主按标志文件识别:desktop collectBundleInfo / 引擎 tangu-agent src/plugins/bundles.ts。
 * 真身层(Genesis 真装载 + 桌面真机)见 DEVELOPMENT.md「验证」节。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
let fail = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { fail += 1; console.log(`  ❌ ${m}`) }
const lsDirs = (p) => (existsSync(p) ? readdirSync(p).filter((x) => !x.startsWith('.')) : [])

// 引擎真实内置工具名(与 20260717/validate.mjs 的 TOOLS 同源)
const TOOLS = new Set(['add_muse_todo', 'amadeus_list_notes', 'amadeus_read_note', 'amadeus_write_note',
  'apply_patch', 'ask_user', 'browser_back', 'browser_click', 'browser_console',
  'browser_navigate', 'browser_press', 'browser_screenshot', 'browser_scroll', 'browser_search', 'browser_snapshot',
  'browser_task', 'browser_type', 'calculator', 'delegate', 'display_file', 'exit_plan_mode', 'generate_image',
  'get_datetime', 'glob_files', 'inbox_send', 'kill_process', 'list_files', 'list_processes', 'log_event',
  'manage_agent', 'manage_schedule', 'muse_watch', 'pip_install', 'read_activity', 'read_file', 'read_log',
  'read_process_output', 'remember', 'run_background', 'run_python', 'search_files', 'start_discussion',
  'todo_read', 'todo_write', 'transcribe_audio', 'use_skill', 'wait_discussion', 'web_fetch', 'web_search', 'wechat_send_file',
  'wechat_send_image', 'write_file', 'write_process_input', 'run_bash'])

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    if (/^\s/.test(line)) continue
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    let v = kv[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    meta[kv[1].toLowerCase()] = v
  }
  return { meta, body: raw.slice(m[0].length) }
}

/* ── Bundle 布局(标志文件齐全、旧四目录布局已废) ── */
console.log('\n== Bundle ==')
{
  const errs = []
  if (!existsSync(path.join(ROOT, 'manifest.json'))) errs.push('根缺 manifest.json(bundle 标志)')
  for (const legacy of ['plugin', 'agent', 'skill', 'space']) if (existsSync(path.join(ROOT, legacy))) errs.push(`残留旧布局目录 ${legacy}/`)
  for (const a of lsDirs(path.join(ROOT, 'agents')))
    if (!existsSync(path.join(ROOT, 'agents', a, 'config.toml'))) errs.push(`agents/${a} 缺 config.toml 标志(引擎不认)`)
  for (const s of lsDirs(path.join(ROOT, 'spaces')))
    if (!existsSync(path.join(ROOT, 'spaces', s, 'space.json'))) errs.push(`spaces/${s} 缺 space.json 标志(宿主不认)`)
  for (const t of lsDirs(path.join(ROOT, 'tangu-plugins')))
    if (!existsSync(path.join(ROOT, 'tangu-plugins', t, 'tangu-plugin.json'))) errs.push(`tangu-plugins/${t} 缺 tangu-plugin.json 标志`)
  errs.length ? bad(errs.join(';')) : ok('bundle 布局(manifest 在根;agents/spaces 标志齐全;无旧布局残留)')
}

/* ── Skill(SKILL.md,tangu-agent localSkills 契约)。两处作用域,同一套契约:
 *   agents/<slug>/skills/<id>/  = agent 级(随 agent 播种,只有该 agent 看得见)
 *   skills/<id>/                = bundle 级(bundleSkillRoots 原地读,所有 agent 都看得见) ── */
console.log('\n== Skill ==')
{
  const scopes = [['bundle', path.join(ROOT, 'skills')]]
  for (const a of lsDirs(path.join(ROOT, 'agents'))) scopes.push([a, path.join(ROOT, 'agents', a, 'skills')])
  for (const [label, base] of scopes) {
    for (const d of lsDirs(base)) {
      try {
        const raw = readFileSync(path.join(base, d, 'SKILL.md'), 'utf8')
        const { meta, body } = parseFrontmatter(raw)
        const errs = []
        if (!SLUG.test(d)) errs.push('slug 不合法')
        if (!meta.name) errs.push('frontmatter 缺 name')
        if (!meta.description || meta.description.length < 15) errs.push('description 缺失或太短')
        if (raw.split('\n').length < 50) errs.push('正文太薄(<50 行)')
        if (!/^##\s/m.test(body)) errs.push('正文无 ## 分节')
        // 笔记文件名 = 正文第一个标题(main.js deriveTitle)。模板首标题若是固定小节名,
        // 同一天收的第二条就会算出同名文件把第一条覆盖掉 —— 必须是 # 级的可变标题。
        for (const tpl of body.match(/```markdown\n[\s\S]*?```/g) || []) {
          const h1 = /^(#{1,6})\s/m.exec(tpl.replace(/^```markdown\n/, ''))
          if (h1 && h1[1] !== '#') errs.push(`模板首标题是 ${h1[1]} 级(固定小节名)→ 落盘同名互相覆盖,须以 # {可变标题} 开头`)
        }
        // snake_case 词默认按「工具名」查,但技能正文里也会出现数据字段名/环境变量。
        // 白名单只收本技能自定协议里的字段,别拿它掩盖真的编造工具名。
        const DATA_FIELDS = new Set(['needs_asr', 'audio_path', 'image_text'])  // 本技能自定协议里的 source 取值
        const scan = body.replace(/\b[a-z]+(?:_[a-z]+)+\.py\b/g, '') // 随技能分发的脚本文件名不是工具名
        for (const t of new Set(scan.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || []))
          if (!TOOLS.has(t) && !DATA_FIELDS.has(t)) errs.push(`疑似编造工具名 "${t}"`)
        errs.length ? bad(`${label}/${d}: ${errs.join(';')}`) : ok(`${label}/${d}(${meta.name}, ${raw.split('\n').length} 行)`)
      } catch (e) { bad(`${label}/${d}: ${e.message}`) }
    }
  }
}

/* ── Agent(agents/<slug>/config.toml + SOUL.md,forsion-sample-agent 契约) ── */
console.log('\n== Agent ==')
for (const a of lsDirs(path.join(ROOT, 'agents'))) {
  const base = path.join(ROOT, 'agents', a)
  try {
    const toml = readFileSync(path.join(base, 'config.toml'), 'utf8')
    const errs = []
    if (!SLUG.test(a)) errs.push('slug 不合法(引擎 seedBundleAgents 会拒播)')
    if (!/^version\s*=\s*"\d+\.\d+\.\d+"\s*$/m.test(toml)) errs.push('version 必须带引号的 semver')
    if (!/^name\s*=\s*"/m.test(toml)) errs.push('缺 name')
    if (!/^description\s*=\s*"/m.test(toml)) errs.push('缺 description')
    if (/^created_at\s*=/m.test(toml)) errs.push('禁带 created_at')
    if (/^cloud_sync\s*=/m.test(toml)) errs.push('禁带 cloud_sync')
    const di = toml.match(/developer_instructions\s*=\s*'''([\s\S]*?)'''/)
    if (!di) errs.push("developer_instructions 缺失或 ''' 未闭合")
    else if (di[1].trim().split('\n').length < 8) errs.push('developer_instructions 太薄(<8 行)')
    if (!existsSync(path.join(base, 'SOUL.md'))) errs.push('缺 SOUL.md')
    for (const banned of ['MEMORY.md', 'LOG']) if (existsSync(path.join(base, banned))) errs.push(`禁带运行时文件 ${banned}`)
    const lo = toml.match(/library_order\s*=\s*\[([^\]]*)\]/)
    if (lo) for (const item of lo[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean))
      if (!existsSync(path.join(base, 'Library', item))) errs.push(`library_order 引用不存在的 Library/${item}`)
    errs.length ? bad(`${a}: ${errs.join(';')}`) : ok(`${a}(${(toml.match(/^name\s*=\s*"([^"]*)"/m) || [])[1]})`)
  } catch (e) { bad(`${a}: ${e.message}`) }
}

/* ── Python 转录脚本自检(纯解析逻辑,不联网) ── */
console.log('\n== Python ==')
try {
  for (const script of ['transcribe.py', 'music_meta.py']) {
    const out = execFileSync('python3', [script, '--selftest'],
      { cwd: path.join(ROOT, 'agents', 'bluebird', 'skills', 'bluebird-video', 'scripts'), encoding: 'utf8', timeout: 20_000 })
    out.includes('selftest ok') ? ok(`${script} — ${out.trim()}`) : bad(`${script} 自检输出异常: ${out.trim()}`)
  }
} catch (e) { bad(`python 自检: ${String(e.message).split('\n')[0]}`) }

/* ── Plugin(根 manifest.json + main.js,shared/amadeus/ipc.ts gatePluginManifest + pluginStore 装载契约) ── */
console.log('\n== Plugin ==')
{
  try {
    const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'))
    const errs = []
    if (!SLUG.test(m.id)) errs.push('id 不合法')
    if (!m.name || !m.description) errs.push('缺 name/description')
    if (!/^\d+\.\d+\.\d+$/.test(String(m.version || ''))) errs.push('version 非 semver')
    if ((m.apiVersion ?? 1) !== 1) errs.push(`apiVersion=${m.apiVersion} 会被 gatePluginManifest 拒载`)
    if (m.main !== 'main.js') errs.push('main 必须是 main.js')
    // 捆绑包语义下 onboarding 不该再 recommends 自家已内嵌的 agent/skill(会引导去市场重复装)
    for (const rec of m.onboarding?.recommends || [])
      if (existsSync(path.join(ROOT, 'agents', rec.slug))) errs.push(`recommends 重复推荐已内嵌的 "${rec.slug}"`)
    const src = readFileSync(path.join(ROOT, 'main.js'), 'utf8')
    if (/^\s*(import|export)\s/m.test(src)) errs.push('main.js 必须是裸 setup 体,不得有顶层 import/export')
    new Function('ctx', src) // 语法闸
    if (errs.length) { bad(`plugin: ${errs.join(';')}`) }
    else {
      const out = execFileSync('node', ['check.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 20_000 })
      ok(`plugin(${m.id}) — ${out.trim().split('\n').at(-1)}`)
    }
  } catch (e) { bad(`plugin: ${String(e.message).split('\n')[0]}`) }
}

/* ── Space(spaces/<slug>/space.json,desktop bootstrapEngine 视图注册表 + sample-space 契约) ── */
console.log('\n== Space ==')
{
  const ICONS = new Set(['bot', 'inbox', 'mail', 'notebook-text', 'book-open', 'briefcase', 'calendar-days',
    'message-circle', 'folder', 'folder-open', 'file-text', 'star', 'heart', 'home', 'target', 'zap', 'globe',
    'music', 'image', 'video', 'code', 'terminal', 'layout-grid', 'sparkles', 'boxes', 'list-tree'])
  const PLUGIN_VIEW = /^plugin:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/
  const NATIVE_VIEWS = new Set(['workspace', 'amadeus-editor', 'chat-panel'])
  for (const sd of lsDirs(path.join(ROOT, 'spaces'))) {
    try {
      const s = JSON.parse(readFileSync(path.join(ROOT, 'spaces', sd, 'space.json'), 'utf8'))
      const errs = []
      if (!SLUG.test(s.id)) errs.push('id 不合法')
      if (!(typeof s.name === 'string' || (s.name && typeof s.name.zh === 'string' && typeof s.name.en === 'string'))) errs.push('name 形态不对')
      if (s.icon !== undefined && !ICONS.has(s.icon)) errs.push(`icon "${s.icon}" 不在 26 白名单`)
      if (!/^\d+\.\d+\.\d+$/.test(String(s.version || ''))) errs.push('version 非 semver(发布必填)')
      if (!Array.isArray(s.layout?.main) || s.layout.main.length < 1) errs.push('layout.main 必须 ≥1 视图')
      const used = new Set()
      for (const pane of ['main', 'left', 'right']) for (const v of s.layout?.[pane] || []) {
        if (v.split !== undefined && (pane !== 'main' || !['right', 'down'].includes(v.split))) errs.push(`视图 "${v.type}" 的 split 只能在 main 使用 right/down`)
        if (v.type === 'workspace') continue
        if (NATIVE_VIEWS.has(v.type)) { used.add(v.type); continue }
        used.add(v.type)
        if (!PLUGIN_VIEW.test(v.type)) errs.push(`视图 "${v.type}" 既不是合法插件视图，也不在原生视图白名单`)
      }
      if (s.layout.main[0]?.split) errs.push('layout.main 第一项不能声明 split')
      const declared = new Set(s.requires?.views || [])
      for (const u of used) if (!declared.has(u)) errs.push(`requires.views 漏声明 "${u}"`)
      // 交叉核:space 引用的插件视图必须真在 main.js 里注册了(否则装 space 白屏)
      const mainSrc = readFileSync(path.join(ROOT, 'main.js'), 'utf8')
      for (const u of [...used].filter((type) => PLUGIN_VIEW.test(type))) {
        const vid = u.split(':')[2]
        if (!new RegExp(`registerView\\(\\{[^}]*id:\\s*'${vid}'`).test(mainSrc)) errs.push(`插件未注册视图 "${vid}"(space 引用了 ${u})`)
      }
      errs.length ? bad(`${sd}: ${errs.join(';')}`) : ok(`${sd} space(${used.size} 个原生/插件视图,已交叉核注册)`)
    } catch (e) { bad(`${sd}: ${e.message}`) }
  }
}

console.log(`\n${fail === 0 ? '🟢 全部通过' : `🔴 ${fail} 项违约`}`)
process.exit(fail === 0 ? 0 : 1)
