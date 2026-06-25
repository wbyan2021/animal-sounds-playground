# 升级记录 · CHANGELOG

本项目遵循语义化版本。完整变更记录见下。

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
- **项目文档**：README.md + 开发文档.md + 方案.md + 改进计划.md

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
