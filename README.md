# 青鸟收藏夹(Forsion 插件)

把一条视频链接变成可读、可检索、可入库的知识笔记 —— 直接在 Forsion 工作台里完成。

**2.2.1:** Amadeus 时间引用可定位对应视频，兼容旧时间码；工作台保持左上视频、左下 ChatView、右侧文档通高。**English:** Amadeus timestamps seek the corresponding video, including legacy timecodes. Video and ChatView stay on the left, with a full-height document on the right. See [CHANGELOG.md](CHANGELOG.md).

这是 Bluebird Folder 视频分析应用的 Forsion 原生插件:工作台视图与收藏数据使用宿主的 LCL / Amadeus 能力,分析任务使用宿主的 **Tangu** 引擎。转录用开源 `yt-dlp`,无字幕时需要宿主提供音频转写;总结、问答和翻译使用 Tangu 配置的模型。选择云端模型时,相关内容会发送给所选供应商。

## Forsion Unit / Web

- **收藏和阅读**:安装到提供本地 Amadeus 存储的 Unit 后,使用「收藏链接」即可把任意 HTTP(S) 链接存成笔记,并出现在正常的收藏列表中。不请求网页元数据、不调用模型、不要求 Forsion Server 或 Forsion 登录;断网时也能保存与重新打开。网页和视频本身仍可能需要网络。
- **分析**:需要同一宿主提供 Tangu 本机执行能力、包内 Agent / 技能以及所需 Python / yt-dlp。未配置引擎时,收藏功能仍可用,分析会明确报告缺失能力。无字幕的视频还需要 ffmpeg 与宿主音频转写能力。
- **资源**:插件通过 `ctx.app.assetUrl(relativePath)` 使用宿主统一资源 URL,通过 `ctx.app.hostPath(relativePath)` 获取同一执行宿主的真实素材目录。云端库地址和浏览器虚拟根不会被传给本机脚本。旧桌面宿主保留本地路径与资源协议回退。

**English:** On a Unit with local Amadeus storage, **Save link** creates a normal library entry and Markdown note without a network request, model, Forsion Server or Forsion account. Existing entries remain readable offline. Video analysis additionally needs Tangu host execution, the bundled agent and skills, and Python / yt-dlp; videos without captions also need ffmpeg and host-provided audio transcription. Cloud models receive the content required for their tasks. Media URLs and execution paths come from the host APIs, so a cloud vault or virtual browser path is never treated as a local directory.

## 捆绑包(装一处,全就位)

本插件是一个 **bundle**:整个目录装进 `~/.forsion/plugins/bluebird/` 即完成,内含——

| 组件 | 包内位置 | 作用 |
|---|---|---|
| 插件 `bluebird` | 根(`manifest.json` + `main.js`) | 视频/队列面板；总结与追问交给宿主原生 Amadeus / ChatView |
| 「青鸟收藏夹」Agent | `agents/bluebird/` | 引擎侧智能体,视图驱动它跑分析;引擎启动时**播种一次**到 `tangu/agents/`,之后独立存在(升级不覆盖你的改动) |
| 「青鸟视频分析」技能 | `agents/bluebird/skills/bluebird-video/` | 转录(yt-dlp)+ 总结/问答/翻译工作流(agent 级,随 Agent 播种);另带**音乐剪藏**支线 `scripts/music_meta.py`(网易云 / QQ 音乐 / Apple Music 单曲 → 歌词+热评+封面收藏卡,不下音频不走 ASR) |
| 「青鸟链接收藏」技能 | `skills/bluebird-link/` | 文章/文档链接 → 抓正文 → 笔记存进 vault `Links/`(**bundle 级,原地读,所有 agent 可见**,所以在任意 Tangu 对话里说「存一下」就能用;视频链接不接,引导去工作台)。设置项「增强自动模式」经 `<vault>/.bluebird/link-mode.json` 镜像给它 —— 设置值在渲染进程的 localStorage,技能在引擎进程,只有 vault 是两边都够得着的地方 |
| 「青鸟收藏夹」Space | `spaces/bluebird/` | 收藏侧栏 + 视频 + Amadeus + ChatView 原生分栏,随插件启停显隐 |

## 转录依赖

- **yt-dlp**:运行 Tangu 的环境需能 `pip install yt-dlp`(技能会按需自动装;平台改版失效时升级它)。
- **ffmpeg**:仅「无字幕 → ASR 兜底」路径需要(下载音频转 mp3)。只分析有字幕的视频则不需要。
- **语音识别**:无原生字幕的视频走 Forsion 自己的语音链路(设置 → 语音:本地离线模型 / 自带 key 的 provider / Forsion 云),**不需要给本插件配 ASR key**;要抠音频则系统需装 `ffmpeg`。B 站高清/会员可设 `BLUEBIRD_COOKIE`。

## 用法

1. 从 Ribbon 打开「青鸟收藏夹」Space，可看到收藏侧栏、视频、Amadeus 与 ChatView 原生分栏；三块主视图可独立滚动和拖动宽度。命令面板(⌘/Ctrl-K)「青鸟收藏夹:打开」仍可单独打开兼容版一体式视图。
2. 贴链接后可直接点「收藏链接」保存。需要分析时,贴视频链接、选总结模板(默认「通用」)、点「添加到分析队列」。音乐单曲链接(网易云 / QQ 音乐 / Apple Music)也直接贴 —— 自动走音乐剪藏,模板与详细度对它不适用。视图驱动「青鸟收藏夹」Agent:抓字幕 → 出 Markdown 总结,过程实时显示。
3. 分析完自动存成 Amadeus 笔记(`{工作文件夹}/{日期}-{标题}.md`,连同来源信息),并同步到同屏 Amadeus 文档区；滚动文档不会移动视频。
4. 想追问 / 翻译:直接在同屏 ChatView 输入，它会自动引用当前青鸟笔记；也可以在 Tangu 里直接和「青鸟收藏夹」Agent 对话。

## 文档里的时间引用

新保存的总结自动把时间码写成 `[01:23](#bluebird=条目ID&t=83)`；无需自己填写 ID。若在另一篇笔记中引用，可复制该 Markdown 链接（条目 ID 也存于原笔记的 `bluebird_id` 属性）。启用青鸟插件时，点击会定位对应视频，不会把当前文档或 Chat 引用切走。

旧笔记里的 `[MM:SS]` / `[H:MM:SS]` 会按该笔记的收藏来源自动识别，无需重新总结或改写文件；此兼容需要新版 Genesis 的编辑器来源接口。普通笔记里的时间文本、代码块、无关链接不受影响。已存档媒体优先本地定位；Bilibili / YouTube 在线定位取决于平台播放器，小红书 / 抖音等需要先存档原始媒体。关闭青鸟插件或在其他编辑器中打开时，特殊锚点不会提供跨面板播放能力。

**English:** New notes automatically save entry-bound links such as `[01:23](#bluebird=entry-id&t=83)`. Copy the Markdown link to cite that video from another note. Legacy timecodes resolve from the source note on current Genesis hosts without rewriting files. Local archives seek in-place; online seeking depends on platform support. Cross-pane playback requires the enabled Bluebird plugin.

## 设置(插件详情页)

- `defaultTemplate` —— 默认总结模板(通用/学术/访谈/播客/会议/新闻/教程/Vlog/旅行/测评)。
- `detail` —— 默认详细程度(`brief` / `standard` / `detailed`)。
- 「工作文件夹」—— 宿主给每个插件的标准设置,总结笔记落在这里(默认 = 插件名,首次打开视图即在库里建好)。

## 双语(1.5.0 起)

界面跟随宿主的语言设置(设置 → 中文 / English)。**切语言即时生效**:插件订了宿主的语言广播,自身视图原地重画,不用关掉重开,正在跑的分析队列也不受影响；Amadeus 与 ChatView 由宿主自己的双语系统渲染。发给模型的指令里会带上输出语言,所以英文界面下拿到的是对应语言的总结。

**切语言不会吞掉你正在弄的东西**(1.5.1):重画前先把现场拍下来、重建后原样搬回 —— 首页里刚粘的链接与选好的模板/详细度；兼容版一体式详情里的问答记录和未发送问题也会保留。原生 ChatView 与收藏侧栏各自由宿主保存现场。

**队列里已有的条目也跟着换语言**(1.5.1):队列项存的是词表键而不是渲染好的字符串,所以三分钟前失败的那条、此刻正卡在抓字幕的那条,切语言后一起变。只有引擎回的原始错误(它没有译文)照原样显示。

不随语言变的东西(免得切成英文像换了个数据目录):笔记正文与标签、文件夹名、模板值、落盘日期与索引字段、插件 id 与 localStorage 键。

**已知缺口**:命令面板条目与视图标签页标题这两处**宿主贡献点的标题**,在宿主侧是注册时定下的单字符串,而且注册接口是直接追加不去重(重注册会长出重复项)—— 切语言后它们要**等重启才更新**。这是宿主侧的缺口,插件不为它做重注册/自我 teardown(那会打断正在跑的队列和已打开的视图)。
另外两类贡献点没有这个问题,都是就地更新的:状态栏图标有 `update()` 句柄;**设置项**的注册接口是同 key 覆盖,所以切语言时重注册一次即可(顺序不变)。

## 边界

- 在线视频抓取需要网络、Tangu 与 yt-dlp;音频转写是否需要云端 key 取决于宿主选用的本地模型或云供应商。仅收藏链接和阅读已有记录不依赖这些能力。
- 超长视频的 ASR 分片并发(Bluebird 原有能力)本版未做,原生字幕无此限制。
- 小红书等平台随 yt-dlp 支持度变化,抓取失败先升级 yt-dlp。

版本历史见 [CHANGELOG.md](CHANGELOG.md)。
