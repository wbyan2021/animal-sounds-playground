# 贡献指南

感谢你为声音大百科添加声音！以下按你的技能水平选择合适的方式。

---

## 角色 A：普通家长/老师（不会用 Git）

1. 打开 [GitHub Issues](https://github.com/wbyan2021/sound-encyclopedia/issues/new/choose)
2. 选择「声音需求」模板
3. 填写你想要的声音名称和分类
4. 提交 Issue，等待维护者添加

就这么简单。

---

## 角色 B：会用 GitHub 网页的人

### 步骤

1. **Fork** 本仓库到你的账号
2. 在 Fork 中进入 `data/sounds/animals/`（或其他分类目录）
3. 点击「Add file → Upload files」，上传音频文件
4. 再点击「Add file → Create new file」，创建 `meta.json`
5. 提交后点击「Pull Request」，描述你添加的声音

### meta.json 示例

```json
{
  "id": "animals.whale",
  "category": "animals",
  "subcategory": "marine",
  "name_zh": "鲸鱼",
  "name_en": "Whale",
  "emoji": "🐋",
  "description": "深海中鲸鱼的悠长呼唤",
  "sounds": [
    {
      "file": "audio/whale-call.mp3",
      "label": "鲸歌",
      "fun_fact": "鲸鱼的歌声可以传到几百公里外，是大海里最远的电话！",
      "tags": ["海洋", "鲸歌"]
    }
  ],
  "fun_fact": "鲸鱼是海洋里最大的哺乳动物，它们的歌声能传遍整个大洋。",
  "tags": ["海洋", "哺乳动物", "鲸歌"],
  "license": "CC0-1.0",
  "source": "https://example.com/whale-sound",
  "contributor": "你的 GitHub 用户名",
  "added_at": "2026-06-30"
}
```

### 字段说明

| 字段 | 层级 | 必填 | 说明 |
|------|------|------|------|
| `id` | 声音级 | 是 | 格式 `{category}.{name_en}`，如 `animals.whale` |
| `category` | 声音级 | 是 | 主分类 id（animals/nature/transport/life） |
| `subcategory` | 声音级 | 是 | 子分类 id |
| `name_zh` | 声音级 | 是 | 中文名 |
| `name_en` | 声音级 | 是 | 英文名（也是目录名） |
| `emoji` | 声音级 | 是 | 代表 Emoji |
| `description` | 声音级 | 否 | 一句话描述 |
| `sounds` | 声音级 | 是 | 音频文件数组，至少 1 条 |
| `sounds[].file` | 音频级 | 是 | 相对 meta.json 的路径 |
| `sounds[].label` | 音频级 | 否 | 这个音频的标签（如"撒娇"、"警告"） |
| `sounds[].fun_fact` | 音频级 | 否 | 这个音频的专属科普文案 |
| `sounds[].tags` | 音频级 | 否 | 这个音频的分类标签 |
| `fun_fact` | 声音级 | 否 | 声音级科普文案（作为音频级文案的 fallback） |
| `tags` | 声音级 | 否 | 搜索标签数组 |
| `license` | 声音级 | 是 | CC0-1.0 或可商用授权 |
| `source` | 声音级 | 是 | 音频来源 URL |
| `contributor` | 声音级 | 是 | GitHub 用户名 |
| `added_at` | 声音级 | 是 | 添加日期 YYYY-MM-DD |

> 💡 **文案层级**：可以只填声音级 `fun_fact`（所有音频共用），也可以为每个音频填专属 `sounds[].fun_fact`。前端优先展示音频级文案。

---

## 角色 C：开发者

### 步骤

```bash
git clone https://github.com/wbyan2021/sound-encyclopedia.git
cd sound-encyclopedia

# 方式一：用管理后台添加（推荐）
node scripts/admin-server.js
# 浏览器打开 http://localhost:3099 → 点「➕ 添加声音」

# 方式二：手动操作
mkdir -p data/sounds/animals/whale/audio
cp whale-call.mp3 data/sounds/animals/whale/audio/
# 创建 meta.json（参考上方示例）
node scripts/validate.js
node scripts/build-manifest.js

# 提交 PR
git checkout -b add-whale
git add data/sounds/animals/whale/
git commit -m "add: whale sound"
git push
```

### 管理后台功能

```bash
node scripts/admin-server.js  # http://localhost:3099
```

- 🗂️ 声音管理（增删 / 搜索 / 单条重新生成文案/TTS）
- 🎵 音频级管理（每个音频独立播放器 + 文案 + 标签 + 朗读生成）
- 🤖 AI 批量生成（带进度条 + 自动刷新）
- 🔄 磁盘同步（清理物理删除的无效引用）
- 📦 重建 Manifest

---

## 音频规范

| 项目 | 要求 |
|------|------|
| 格式 | MP3 |
| 采样率 | 44100 Hz |
| 比特率 | 128 kbps |
| 时长 | 1–10 秒 |
| 文件体积 | < 300 KB |
| 响度 | -16 LUFS（近似） |
| 内容 | 单一声音，避免背景噪音 |

推荐工具：
- 格式转换：[Audacity](https://www.audacityteam.org/)（免费）
- 响度标准化：Audacity → 效果 → 音量标准化

---

## 命名规范

- 目录名：小写英文 + 下划线，如 `whale`、`blue_bird`
- 音频文件名：小写英文 + 下划线，如 `whale-call.mp3`
- 不要用中文、空格或特殊字符

---

## 版权要求

所有提交的音频必须满足：

- 采用 **CC0-1.0** 授权，或明确的可商用授权
- `meta.json` 中的 `source` 字段必须填写来源 URL
- 你必须确认有权分发该音频

如果音频来自他人作品，请在 `source` 中注明原始出处和授权协议。

---

## AI 内容说明

本项目使用 AI 为声音生成科普文案和朗读音频：

| 服务 | 用途 | 模型 |
|------|------|------|
| DeepSeek | 生成科普文案 | deepseek-v4-flash |
| MiniMax | 生成朗读音频 | speech-2.8-hd |

- AI **不生成**动物/自然声音本身（真实声音红线）
- 所有 AI 生成内容标注「🤖」
- 文案可手动调整，手动编辑后标记为非 AI
- AI 朗读仅用于朗读文字内容

---

## PR 检查清单

提交 PR 前请确认：

- [ ] 音频符合规范（MP3、44100Hz、128kbps、1-10秒、<300KB）
- [ ] meta.json 所有必填字段完整
- [ ] source 字段填写了来源 URL
- [ ] 目录和文件命名符合规范
- [ ] `node scripts/validate.js` 通过

---

有问题？先提 Issue，或直接在 PR 中讨论。
