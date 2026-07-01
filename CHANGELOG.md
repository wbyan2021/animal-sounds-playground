# 升级记录 · CHANGELOG

本项目遵循语义化版本。完整变更记录见下。

---

## [2.4.0] - 2026-06-30

### 重构
- **AI 模型配置体系重构**：LLM 和 TTS 配置彻底分离，各自独立的 endpoint / api_key / model
  - LLM 组：`LLM_ENDPOINT` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_MAX_TOKENS` / `LLM_TEMPERATURE`
  - TTS 组：`TTS_ENDPOINT` / `TTS_API_KEY` / `TTS_MODEL` / `TTS_VOICE_*` / `TTS_SAMPLE_RATE` ...
  - 通用：`MINIMAX_GROUP_ID`
  - 向后兼容旧的 `MINIMAX_*` 变量
- **LLM 切换到 DeepSeek 官方**：endpoint `api.deepseek.com`，模型 `deepseek-v4-flash`
- **TTS 切换到 MiniMax 国内版**：endpoint `api.minimaxi.com`（注意是 minimaxi 不是 minimax）

### 新增
- **音频级内容管理**：每个独立音频支持独立的 label / fun_fact / tags / tts
  - 声音级文案作为 fallback，音频级文案优先展示
  - 前端科普面板根据当前播放的音频动态切换文案
  - 多音频提示：显示"第 X/N 个音频 · 标签 · 有/无专属文案"
- **后台声音管理面板**：
  - 声音列表 + 搜索 + 每条操作按钮（📝 重新生成文案 / 🔊 重新生成 TTS / 🗑️ 删除）
  - 点击展开详情编辑面板：声音级文案 + 标签 + 每个音频的独立管理卡片
  - 每个音频卡片：播放器 + label + fun_fact(+LLM按钮) + tags + TTS生成按钮+TTS播放器
  - 添加声音表单（上传 mp3 + 填写信息）
  - 磁盘同步（清理物理删除的无效引用）
- **后台 API 新增**：
  - `DELETE /api/sound` — 删除声音
  - `POST /api/sound` — 创建声音
  - `GET /api/sound-detail` — 获取声音详情
  - `PUT /api/sound-meta` — 更新声音级 + 音频级字段
  - `POST /api/track-generate-fact` — 单条音频 LLM 生成文案
  - `POST /api/track-generate-tts` — 单条音频生成朗读
  - `PUT /api/track-update` — 更新单条音频
  - `POST /api/sync-disk` — 磁盘同步
- **AI 批量生成优化**：
  - 配置项：强制重新生成 / 含音频级文案 / 含音频级朗读
  - 操作预览（将影响 N 个声音）
  - 实时进度条（百分比 + 计数）
  - 完成后自动重建 manifest + 自动刷新统计 + 自动刷新声音列表
- **统计细化**：6 格仪表盘（声音总数 / 声音级文案 / 声音级TTS / 音频级文案 / 音频级TTS / 待处理）
- **前端 logo 跳转后台**：左上角 logo 点击新标签页打开管理后台
- **后台静态文件服务**：支持 `/data/` 路径的音频文件流式传输

### 修复
- **MiniMax 国内版 4 大差异**：
  1. 域名 `minimaxi.com` vs `minimax.io`（多个 i）
  2. 模型名 `speech-2.8-hd` 小写 vs `Speech-2.8-HD` 大写
  3. 字段名 `audio_sample_rate` vs `sample_rate`
  4. 音频编码 hex vs base64（关键 bug，导致生成的 mp3 全是废文件）
- **TTS 错误信息**：从"缺少 audio 字段"改为带上 `status_code` + `status_msg` 真实原因
- **build-manifest 磁盘同步**：扫描时检查音频文件是否真实存在，自动过滤无效引用
- **操作后即时刷新**：单条音频生成/保存后自动刷新顶部统计和列表状态标记

### 技术
- `scripts/lib/minimax.js`：`getConfig()` → `getLLMConfig()` + `getTTSConfig()`，hex/base64 自动检测解码
- `scripts/build-manifest.js`：新增文件存在性检查
- `scripts/ai-generate-tts.js`：DELAY_MS 从 800 改为 2500（规避 RPM 限流），输出 mp3
- `scripts/admin-server.js`：新增 8 个 API + 静态文件服务 + 声音管理 UI + 批量生成优化

### 数据
- 58 个声音全部生成声音级 fun_fact（DeepSeek）
- 58 个声音全部生成声音级 TTS 三件套（MiniMax）
- 4 个音频级文案 + 4 个音频级 TTS（猫的 4 个叫声）
- 音频文件总数从 138 增至 270（含 TTS）

---

## [2.3.0] - 2026-06-29

### 新增
- **AI 科普文案生成**：集成 MiniMax / DeepSeek LLM，一键为声音生成儿童友好的趣味科普文案
- **AI 语音朗读 (TTS)**：
  - 支持 Speech-2.8-HD 高清语音模型，音质更自然
  - 支持自定义中文/英文音色 ID
  - 自动生成名称朗读（中文/英文）和科普全文朗读
- **本地管理后台**：Node.js + Web UI，提供 API Key 配置、AI 生成、数据统计功能
- **TTS 朗读按钮**：详情面板中新增 🔊 中文/英文/科普三个朗读按钮
- **4 大分类 58 种声音**：动物、乐器、自然、交通全品类覆盖

### 优化
- **音频路径系统**：build-manifest.js 自动重映射 TTS 音频路径，前端无需手动拼接
- **配置灵活性**：支持自定义 API Base URL，适配不同服务商的 API 端点
- **离线缓存策略**：新增 TTS 音频的 Service Worker 缓存支持

### 技术
- 新增 `scripts/lib/minimax.js`：MiniMax/DeepSeek API 封装库
- 新增 `scripts/ai-generate-funfact.js`：批量生成科普文案脚本
- 新增 `scripts/ai-generate-tts.js`：批量生成 TTS 朗读脚本
- 新增 `scripts/admin-server.js`：本地管理后台服务器
- `meta.json` 新增 `tts` 字段，记录朗读音频路径、音色 ID 和生成时间

---

## [2.2.0] - 2026-06-25

### 新增
- **全新 Glassmorphism 设计**：重构整个视觉层，使用半透明毛玻璃、精细发光过渡提升整体质感
- **动态配色系统**：页面背景与主色调随选中的大分类自适应过渡切换
- **宝宝科普悬浮仓 (Bottom Sheet)**：底部划出式科普卡片，展示趣味事实、标签、贡献者信息
- **搜索与收藏系统**：
  - 新增搜索框，支持对中文名、英文名、简介、标签进行实时检索
  - 卡片集成一键收藏功能，配合新增的"💖 我的收藏"专属分类页
- **探索进度与勋章成就**：localStorage 持久化跟踪探索进度，授予成长等级勋章
- **Canvas 漂浮粒子系统**：开始屏幕使用 HTML5 Canvas 渲染动态 Emoji 背景
- **随机探索 (Shuffle)**：随机挑选并播放声音，增强趣味交互

### 优化
- 统一移动端底部安全区域，优化响应式排版
- 音量面板改为悬浮滑块，悬停自动拉伸展开
- 系统字体栈替代 Google Fonts 外部依赖，消除国内网络加载延迟

### 技术债务
- 去掉 Google Fonts 外部 CDN 依赖，改回系统字体栈，首屏加载零延迟

---

## [2.1.0] - 2026-06-25

### 新增
- **懒加载**：点击时才加载音频，不再全量预加载 96 个文件，移动端首屏速度大幅提升
- **科普文案**：38 个动物全部添加 `fun_fact` 字段，播放后自动展示儿童友好科普内容
- **播放状态指示**：已播放过的卡片显示绿色边框，区分"正在播"和"已播过"
- **加载中动画**：懒加载音频时卡片右上角显示旋转加载指示器
- **Toast 提示**：播放失败时友好提示，替代静默失败
- **升级记录文件**：新增 CHANGELOG.md

### 优化
- **空分类过滤**：只显示有声音数据的分类，不再显示空的自然/交通/生活 tab
- **Service Worker 策略优化**：
  - manifest.json 改为 network-first（保证新声音能上线）
  - index.html / sw.js 改为 network-first（保证更新能生效）
  - 音频文件保持 cache-first（省流量）
  - 其他 JSON 改为 stale-while-revalidate
- **首屏预加载**：只预加载前 10 个声音，替代全量 96 个文件预加载
- **manifest 版本**：升级至 2026.06.25.1

### 修复
- 修复 Service Worker 缓存 manifest.json 导致新声音不上线的问题
- 修复移动端预加载 13MB 导致用户等待过久的问题

---

## [2.0.0] - 2026-06-24

### 重构
- **数据驱动架构**：从 V1 的硬编码 HTML 改为 fetch manifest.json 动态渲染
- **单仓库结构**：data/（声音库）+ index.html（前端）+ scripts/（构建工具）
- **meta.json 规范**：每个声音一个 meta.json，包含 id/category/name/emoji/sounds/license/source 等字段
- **manifest.json 自动生成**：build-manifest.js 扫描 data/sounds/ 生成总索引

### 新增
- **38 种动物**：从 V1 迁移 96 个音频文件到数据驱动结构
- **构建脚本**：build-manifest.js（生成索引）+ validate.js（数据校验）
- **GitHub Actions**：PR 自动校验 + 合并后自动构建 manifest
- **Issue/PR 模板**：声音需求模板 + PR 版权确认模板
- **贡献指南**：CONTRIBUTING.md，支持三种角色（普通用户/网页贡献者/开发者）
- **完整前端**：开始页动画 + 预加载进度条 + 分类 tabs + 卡片动画（弹跳+波纹+星星）+ 音量控制 + Service Worker 离线缓存
- **项目文档**：README.md + 项目文档.md（产品战略 + 技术实现合并）

### 变更
- 产品名从"动物叫声乐园"改为"声音大百科"（Sound Encyclopedia）
- 仓库名从 animal-sounds-playground 改为 sound-encyclopedia
- 版权：CC0（声音素材）+ MIT（代码）

---

## [1.1.0] - 2026-06-17（V1 最后版本）

### 功能
- 37 种动物，97 个真实 MP3 录音
- 单文件 HTML，零依赖，纯 vanilla JS
- 分类切换、点击播放、炫酷动画
- 音量记忆、Service Worker 离线缓存
- 响应式设计

---

## 版本号规则

- **主版本号**（X.0.0）：架构级重构
- **次版本号**（X.Y.0）：新功能、内容扩充
- **修订号**（X.Y.Z）：Bug 修复、小优化
