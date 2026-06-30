# 🐾 声音大百科 · Sound Encyclopedia

开源儿童声音库 — 让孩子在家听到大自然

[![License](https://img.shields.io/badge/声音-CC0--1.0-green.svg)](LICENSE)
[![License](https://img.shields.io/badge/代码-MIT-blue.svg)](LICENSE)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

## 为什么做这个

1–6 岁的孩子通过声音认识世界，但市面上的声音 App 多用合成音效，缺乏真实感。
声音大百科收集真实的动物、自然、交通、生活声音，配上 Emoji 卡片，让孩子点击即听、无需识字。

## 快速开始

```bash
git clone https://github.com/wbyan2021/sound-encyclopedia.git
cd sound-encyclopedia
# 通过本地服务器打开（避免 fetch 跨域）
python3 -m http.server 9876
# 浏览器访问 http://localhost:9876
```

## 添加声音

### 方式一：管理后台（推荐）

```bash
node scripts/admin-server.js
# 浏览器打开 http://localhost:3099
# 在「声音管理」面板点「➕ 添加声音」
```

### 方式二：手动操作

```
1. 新建目录  data/sounds/animals/whale/audio/
2. 上传音频 + 创建 meta.json
3. node scripts/build-manifest.js
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 架构

```
贡献者 → PR → validate.js 校验 → 合并到 main → build-manifest.js → manifest.json → 前端读取
```

- `data/categories.json` — 定义分类与子分类
- `data/sounds/*/meta.json` — 每种声音的元信息（名称、emoji、版权来源）
- `data/manifest.json` — 自动生成的总索引，前端唯一依赖
- 前端只读 manifest.json，加声音零改代码

## 功能亮点

- 🎵 **58 种真实声音 / 96 段真实音轨** — 动物、自然、交通、生活四大分类
- 🤖 **AI 科普讲解** — 每条声音配有 AI 生成的儿童友好科普文案（DeepSeek）
- 🔊 **AI 语音朗读** — 中文名、英文名、科普文案均可 AI 朗读（MiniMax），帮助孩子独立使用
- 🎵 **音频级专属文案** — 每个独立音频可有独立的标签、文案、朗读（如猫的"撒娇/警告/呼噜"各有专属讲解）
- 🔍 **智能搜索** — 支持中文名、英文名、拼音、标签多维检索
- ❤️ **收藏系统** — 喜欢的声音一键收藏，专属分类页快速访问
- 🏆 **探索成就** — 记录探索进度，解锁勋章称号，激励孩子持续探索
- 🎲 **随机探索** — 随机播放声音，增加探索乐趣
- 📱 **离线可用** — Service Worker 缓存，访问过一次就能离线听
- 🎨 **动态配色** — 切换分类时背景色自适应过渡，视觉沉浸感强
- 🗂️ **管理后台** — 本地 Web UI，可视化管理声音、生成文案/TTS、磁盘同步

## 声音列表

当前收录 **4 大分类、58 种声音、96 段真实音轨、270 个音频文件**（含 AI 朗读）。

### 🐾 动物 animals（38 种）

| 子分类 | 声音 |
|--------|------|
| 🐕 宠物 pet | 🐱 小猫、🐶 小狗、🐭 老鼠 |
| 🏠 农场 farm | 🐔 母鸡、🐮 奶牛、🫏 驴、🦆 鸭子、🐐 山羊、🐴 马、🐷 猪、🐓 公鸡、🐑 绵羊 |
| 🌿 野生 wild | 🐻 棕熊、🐘 大象、🦊 狐狸、🦍 大猩猩、🦁 狮子、🐒 猴子、🐯 老虎、🐺 灰狼 |
| 🐦 鸟类 bird | 🐦 小鸟、🐦‍⬛ 乌鸦、🕊️ 鸽子、🦅 鹰、🦉 猫头鹰、🦜 鹦鹉、🦚 孔雀、🐧 企鹅、🦢 天鹅 |
| 🌊 海洋 marine | 🐋 鲸鱼、🐬 海豚、🦭 海豹 |
| 🐸 爬行两栖 reptile | 🐊 鳄鱼、🐸 青蛙、🐍 蛇 |
| 🐝 昆虫 insect | 🐝 蜜蜂、🦗 蟋蟀、🦟 蚊子 |

### 🌳 自然 nature（7 种）

| 子分类 | 声音 |
|--------|------|
| 🌧️ 天气 weather | 🌧️ 雨声、⚡ 雷声、💨 风声 |
| 💧 水流 water | 🌊 海浪、💧 溪流 |
| 🌲 森林 forest | 🌲 森林、🔥 篝火 |

### 🚗 交通 transport（5 种）

| 子分类 | 声音 |
|--------|------|
| 陆地 | 🚗 汽车、🏍️ 摩托车、🚂 火车 |
| 空中 | ✈️ 飞机 |
| 水上 | 🚢 轮船 |

### 🏠 生活 life（8 种）

| 子分类 | 声音 |
|--------|------|
| 家居 | 🔔 门铃、⏰ 闹钟、📞 电话、📻 微波炉 |
| 乐器 | 🎹 钢琴、🎸 吉他、🥁 鼓 |
| 厨房 | 🍳 炒菜声 |

## AI 内容生成

本项目使用两个 AI 服务为声音生成内容：

| 服务 | 用途 | 模型 |
|------|------|------|
| DeepSeek | 生成儿童科普文案 | deepseek-v4-flash |
| MiniMax | 生成朗读音频（TTS） | speech-2.8-hd |

所有 AI 生成内容均标注「🤖」，对家长透明。AI 不生成动物/自然声音本身（真实声音红线）。

## 管理后台

```bash
node scripts/admin-server.js
# 浏览器打开 http://localhost:3099（仅本机访问）
```

功能：
- 📊 数据统计（声音级 + 音频级分开统计）
- 🔑 LLM / TTS 独立配置
- 🗂️ 声音管理（增删 / 搜索 / 单条重新生成）
- 🎵 音频级管理（每个音频独立播放器 + 文案 + 标签 + 朗读生成）
- 🤖 AI 批量生成（带进度条 + 完成后自动刷新）
- 🔄 磁盘同步（清理物理删除的无效引用）

## 许可证

- 声音素材（`data/sounds/` 下的音频）：[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 代码（`scripts/`、`index.html` 等）：[MIT](https://opensource.org/licenses/MIT)

详见 [LICENSE](LICENSE)。
