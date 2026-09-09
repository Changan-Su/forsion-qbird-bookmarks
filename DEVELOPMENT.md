# 青鸟收藏夹 · Bluebird(Forsion 生态版)

把 [Bluebird Folder](../../apps/Bluebird-Folder) 视频分析应用做成 **Forsion Genesis 的原生插件** —— 调用 LCL 引擎(工作台视图)与 Tangu 生态(引擎 + 技能),而不是搬一个独立 Web 应用进来。

贴一条视频链接(Bilibili / YouTube / 抖音 / 小红书),在 Forsion 工作台里抓字幕、出结构化 Markdown 总结、追问、翻译,并存进 Amadeus 笔记库。任务由宿主 Tangu 执行;模型数据流取决于其供应商配置。仅收藏链接不需要 Tangu 或网络。

### Unit / Web 宿主契约(2026-09-09)

同一个 bundle 可由桌面或 Unit 的 Web 投射加载。纯收藏动作 `saveLink` 只调用 `ctx.app.readFile/writeFile`,不碰引擎、账号或 HTTP;笔记、sidecar 与索引沿用既有格式,链接条目的文件名包含唯一 id,避免同标题覆盖。

- `ctx.app.assetUrl(vaultRelativePath): string` 复用宿主的资源 URL 构造器,保留 Unit 临时资源令牌/云端资产处理。
- `ctx.app.hostPath(vaultRelativePath): string | null` 只返回与当前执行引擎同机的真实路径;null 表示素材不落本机,不能再拿 `vaultRoot()` 猜。
- `window.tangu.executionCapabilities.host` 是显式 Unit / Web 本机执行能力声明;`getConfig()` 返回 Unit 代理地址与当前会话令牌。没有配置时不回落 `/api`,也不读取旧全局 `forsion_token`。
- 旧桌面无新契约时保留原有引擎接入,素材目录只接受真实绝对路径,不会把 `cloud://` 当本机目录。
- 不提供 `transcribeAudioFile` 的宿主会在无字幕分支显示真实能力缺口,不会把错误当作成功的总结。

**English:** A single bundle serves Desktop and Unit Web projection. `saveLink` uses only the host's normal vault file APIs. Asset URLs, same-engine host paths and host execution availability are explicit capabilities; unavailable Unit configuration never falls back to another account's token. Audio transcription is optional and reports its absence when needed.

## 架构(捆绑包 bundle:一个目录,四件内容)

> 修订 2026-07-24:随插件体系捆绑包机制上线,本仓从「三件套分装三处」改为 **bundle 单目录**——
> manifest 在根,Agent(含技能)与 Space 内嵌在约定子目录,宿主按标志文件识别。

```
你贴链接
  │  LCL 视图(根 main.js)——「脸」
  ▼
桌面插件 bluebird ──POST /agent/runs (execMode:host, agentSlug:bluebird)──▶ 本机 Tangu 引擎
                                                                              │
              「青鸟收藏夹」Agent(agents/bluebird/)──use_skill──▶「青鸟视频分析」技能(agents/bluebird/skills/)
                                                                              │  run_bash
                                                                              ▼
                                                          scripts/transcribe.py(yt-dlp 取字幕 / 无字幕交音频)
  ◀──SSE token/done(总结正文,AI 由 Tangu 直连 Forsion 完成)──────────────────┘
  │
  ▼  ctx.app.writeFile
Amadeus 笔记(videos/{日期}-{标题}.md)
```

| 件 | 包内位置 | 干什么 |
|---|---|---|
| 插件(manifest + main.js) | 根 | 工作台视图:输入链接、直播总结、存笔记。驱动 Tangu,自身不碰 Python/网络抓取。 |
| Tangu 文件夹 Agent `bluebird` | `agents/bluebird/` | 引擎侧智能体,视图靠 `agent_config.agentSlug` 选它;串起转录→总结→问答。`full-auto`(host run_bash 无人值守),run_bash 用途死限在「跑转录脚本 + 装 yt-dlp」。引擎启动/重扫时**播种一次**到 `tangu/agents/`(bundles.ts),已存在永不覆盖。 |
| 技能 + Python | `agents/bluebird/skills/bluebird-video/` | 转录工作流(host 模式 `run_bash` 跑 `scripts/transcribe.py`)+ 10 套总结模板 + 问答/翻译规则,agent 级随播种就位。 |
| 技能(链接收藏) | `skills/bluebird-link/` | **bundle 级作用域**:引擎 `bundleSkillRoots()` 原地读 `plugins/<id>/skills/`,不播种、所有 agent 都列得到(优先级 内置 < bundle < 用户)。所以「日常对话里丢个链接就入库」这件事必须放这儿——放 `agents/bluebird/skills/` 只有青鸟 agent 看得见。纯提示词,无脚本。 |
| Space | `spaces/bluebird/` | 工作台一键布局;desktop spaces:list 汇入,随插件启停显隐。 |

### 为什么转录用 run_bash 而不是 run_python
`run_python` 跑在 **Docker 沙箱**里:`--network none`(yt-dlp 下载不了)且看不到技能自带的脚本文件。视频抓取必须在 **host 模式**用 `run_bash` 跑本机 Python —— 所以插件驱动 run 时带 `execMode:'host'`。(依据见 Genesis `tangu-agent/src/services/agentLoop.ts`、`tools/builtin/sandboxPython.ts`。)

## 部署

一条命令(见 `install.sh`):

```bash
sh install.sh dev     # → ~/.forsion-dev  (开发中的桌面 npm run dev)
sh install.sh prod    # → ~/.forsion
```

它把**整个 bundle 拷到一处**:`<home>/plugins/bluebird/`(dev=`~/.forsion-dev`,prod=`~/.forsion`),并清掉旧版遗留的顶层 `spaces/bluebird`(否则以「用户 Space 优先」遮蔽内嵌版)。

之后各件自动就位:桌面读根 manifest(UI 插件)与 `spaces/`;引擎启动/重扫时从 `agents/` 播种 Agent(含 agent 级技能,该 agent 激活时技能自动可用)。已播种的 agent 活体(MEMORY/LOG/用户改过的 SOUL)不受重装影响。装完重开应用(dev 重启 desktop)。

## 依赖与配置

- **yt-dlp**:技能会用 `run_bash python3 -m pip install -U yt-dlp` 按需装/升级(平台改版失效先升级它)。
- **ffmpeg**:仅「无字幕 → ASR 兜底」路径需要;只分析有字幕的视频不需要。
- **语音识别**:无原生字幕时,脚本只交出 16k 单声道 WAV 的路径,转写由插件调 `window.tangu.transcribeAudioFile(path, {timestamps:true})` 走 Forsion 语音链路完成(设置 → 语音)。插件侧**没有** ASR key 这回事。B 站高清/会员可给 `BLUEBIRD_COOKIE`。

## 验证(两层)

**契约层(自动,已绿):**

```bash
node verify.mjs      # 校验 skill/agent/plugin 契约 + 跑 plugin check.mjs(含 XSS 防护)+ transcribe.py 自检
```

`check.mjs` 还断言零网络收藏/重新读取、同标题不覆盖、云端/虚拟路径拒绝、资源 URL 桥、本机执行门控及 Unit 会话令牌原样传递。验证器允许 Space 使用宿主的 `workspace` 视图,并识别现有 `transcribe_audio` 工具;它们是宿主能力,不是本插件捏造的贡献点。完整 Unit 浏览器验收还需要使用 Genesis 的独立安装产物,本脚本的内存文件桥不等同于真实持久化验证。

**真身层(需真机,手动验收):** 转录要跑本机 yt-dlp + 真实网络,只能在跑着的桌面上验:`install.sh dev` → 重启 desktop → 命令面板「青鸟收藏夹:打开」→ 贴一条有字幕的视频(如任意 YouTube)→ 看总结直播出来 → 「保存到笔记」确认落到 `videos/`。

## 边界(v1 刻意不做)

- 超长视频的 ASR 分片并发(Bluebird 原有 ffmpeg 切片)未做;原生字幕无此限制。
- 视图内 Markdown 预览不渲染表格(降级为文本);存进 Amadeus 的笔记表格正常。
- 依赖本机 Tangu 与 yt-dlp;小红书等随 yt-dlp 支持度变化。
