# 青鸟收藏夹 · Bluebird(Forsion 生态版)

把 [Bluebird Folder](../../apps/Bluebird-Folder) 视频分析应用做成 **Forsion Genesis 的原生插件** —— 调用 LCL 引擎(工作台视图)与 Tangu 生态(引擎 + 技能),而不是搬一个独立 Web 应用进来。

贴一条视频链接(Bilibili / YouTube / 抖音 / 小红书),在 Forsion 工作台里抓字幕、出结构化 Markdown 总结、追问、翻译,并一键存进 Amadeus 笔记库。**转录/AI 全在本机**,数据不出机。

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

**真身层(需真机,手动验收):** 转录要跑本机 yt-dlp + 真实网络,只能在跑着的桌面上验:`install.sh dev` → 重启 desktop → 命令面板「青鸟收藏夹:打开」→ 贴一条有字幕的视频(如任意 YouTube)→ 看总结直播出来 → 「保存到笔记」确认落到 `videos/`。

## 边界(v1 刻意不做)

- 超长视频的 ASR 分片并发(Bluebird 原有 ffmpeg 切片)未做;原生字幕无此限制。
- 视图内 Markdown 预览不渲染表格(降级为文本);存进 Amadeus 的笔记表格正常。
- 依赖本机 Tangu 与 yt-dlp;小红书等随 yt-dlp 支持度变化。
