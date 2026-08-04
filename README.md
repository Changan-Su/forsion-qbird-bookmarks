# 青鸟收藏夹(Forsion 桌面插件)

把一条视频链接变成可读、可检索、可入库的知识笔记 —— 直接在 Forsion 工作台里完成。

这是 [Bluebird Folder](https://github.com/) 视频分析应用的 Forsion 原生化:**插件本身只是「脸」**(一个 LCL 视图),真正干活的是本机的 **Tangu** —— 转录用开源 `yt-dlp`(无字幕则把音频交给 Forsion 自己的语音识别),总结/问答/翻译由 Tangu 直连 Forsion 的大模型完成。数据不出本机。

## 捆绑包(装一处,全就位)

本插件是一个 **bundle**:整个目录装进 `~/.forsion/plugins/bluebird/` 即完成,内含——

| 组件 | 包内位置 | 作用 |
|---|---|---|
| 插件 `bluebird` | 根(`manifest.json` + `main.js`) | 工作台视图(输入链接、看总结、存笔记) |
| 「青鸟收藏夹」Agent | `agents/bluebird/` | 引擎侧智能体,视图驱动它跑分析;引擎启动时**播种一次**到 `tangu/agents/`,之后独立存在(升级不覆盖你的改动) |
| 「青鸟视频分析」技能 | `agents/bluebird/skills/bluebird-video/` | 转录(yt-dlp)+ 总结/问答/翻译工作流(agent 级,随 Agent 播种) |
| 「青鸟收藏夹」Space | `spaces/bluebird/` | 工作台一键布局,随插件启停显隐 |

## 转录依赖

- **yt-dlp**:运行 Tangu 的环境需能 `pip install yt-dlp`(技能会按需自动装;平台改版失效时升级它)。
- **ffmpeg**:仅「无字幕 → ASR 兜底」路径需要(下载音频转 mp3)。只分析有字幕的视频则不需要。
- **语音识别**:无原生字幕的视频走 Forsion 自己的语音链路(设置 → 语音:本地离线模型 / 自带 key 的 provider / Forsion 云),**不需要给本插件配 ASR key**;要抠音频则系统需装 `ffmpeg`。B 站高清/会员可设 `BLUEBIRD_COOKIE`。

## 用法

1. 命令面板(⌘/Ctrl-K)「青鸟收藏夹:打开」,或状态栏图标 → 打开视图。
2. 贴视频链接、选总结模板(默认「通用」)、点「分析」。视图驱动「青鸟收藏夹」Agent:抓字幕 → 出 Markdown 总结,过程实时显示。
3. 满意就「保存到笔记」:总结连同来源信息写入 Amadeus 笔记(默认 `videos/{日期}-{标题}.md`),之后可全库检索。
4. 想追问 / 翻译:继续在视图里问,或在 Tangu 里直接和「青鸟收藏夹」Agent 对话。

## 设置(插件详情页)

- `defaultTemplate` —— 默认总结模板(通用/学术/访谈/播客/会议/新闻/教程/Vlog/旅行/测评)。
- `saveFolder` —— 保存笔记的库内文件夹(默认 `videos`)。

## 边界

- 依赖本机 Tangu 与 yt-dlp;纯离线的字幕视频最省心,ASR 需 Key + ffmpeg。
- 超长视频的 ASR 分片并发(Bluebird 原有能力)本版未做,原生字幕无此限制。
- 小红书等平台随 yt-dlp 支持度变化,抓取失败先升级 yt-dlp。

版本历史见 [CHANGELOG.md](CHANGELOG.md)。
