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

3 步即可新增一种声音：

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

## 声音列表

当前收录 4 大分类、38 种动物。

### 🐕 宠物 pet

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐱 | 小猫 | `cat` |
| 🐶 | 小狗 | `dog` |
| 🐭 | 老鼠 | `mouse` |

### 🏠 农场 farm

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐔 | 母鸡 | `chicken` |
| 🐮 | 奶牛 | `cow` |
| 🫏 | 驴 | `donkey` |
| 🦆 | 鸭子 | `duck` |
| 🐐 | 山羊 | `goat` |
| 🐴 | 马 | `horse` |
| 🐷 | 猪 | `pig` |
| 🐓 | 公鸡 | `rooster` |
| 🐑 | 绵羊 | `sheep` |

### 🌿 野生 wild

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐻 | 棕熊 | `bear` |
| 🐘 | 大象 | `elephant` |
| 🦊 | 狐狸 | `fox` |
| 🦍 | 大猩猩 | `gorilla` |
| 🦁 | 狮子 | `lion` |
| 🐒 | 猴子 | `monkey` |
| 🐯 | 老虎 | `tiger` |
| 🐺 | 灰狼 | `wolf` |

### 🐦 鸟类 bird

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐦 | 小鸟 | `bird` |
| 🐦‍⬛ | 乌鸦 | `crow` |
| 🕊️ | 鸽子 | `dove` |
| 🦅 | 鹰 | `eagle` |
| 🦉 | 猫头鹰 | `owl` |
| 🦜 | 鹦鹉 | `parrot` |
| 🦚 | 孔雀 | `peacock` |
| 🐧 | 企鹅 | `penguin` |
| 🦢 | 天鹅 | `swan` |

### 🌊 海洋 marine

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐋 | 鲸鱼 | `whale` |
| 🐬 | 海豚 | `dolphin` |
| 🦭 | 海豹 | `seal` |

### 🐸 爬行两栖 reptile

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐊 | 鳄鱼 | `crocodile` |
| 🐸 | 青蛙 | `frog` |
| 🐍 | 蛇 | `snake` |

### 🐝 昆虫 insect

| Emoji | 名称 | 目录 |
|-------|------|------|
| 🐝 | 蜜蜂 | `bee` |
| 🦗 | 蟋蟀 | `cricket` |
| 🦟 | 蚊子 | `mosquito` |

---

自然、交通、生活分类的声音正在建设中，欢迎贡献！

## 许可证

- 声音素材（`data/sounds/` 下的音频）：[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 代码（`scripts/`、`web/` 等）：[MIT](https://opensource.org/licenses/MIT)

详见 [LICENSE](LICENSE)。
