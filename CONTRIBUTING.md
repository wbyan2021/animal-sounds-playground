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
  "name_zh": "鲸鱼",
  "name_en": "Whale",
  "emoji": "🐋",
  "subcategory": "marine",
  "description": "深海中鲸鱼的悠长呼唤",
  "audio": [
    {
      "file": "whale-call.mp3",
      "description": "鲸鱼长鸣"
    }
  ],
  "source": "https://example.com/whale-sound",
  "license": "CC0-1.0"
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name_zh` | 是 | 中文名 |
| `name_en` | 是 | 英文名 |
| `emoji` | 是 | 代表 Emoji |
| `subcategory` | 是 | 子分类 id（见 categories.json） |
| `description` | 否 | 一句话描述 |
| `audio` | 是 | 音频文件列表，每项含 `file` 和 `description` |
| `source` | 是 | 音频来源 URL |
| `license` | 是 | 授权协议（CC0-1.0 或可商用协议名称） |

---

## 角色 C：开发者

### 步骤

```bash
git clone https://github.com/wbyan2021/sound-encyclopedia.git
cd sound-encyclopedia

# 1. 创建声音目录
mkdir -p data/sounds/animals/whale/audio

# 2. 放入音频文件
cp whale-call.mp3 data/sounds/animals/whale/audio/

# 3. 创建 meta.json（参考上方示例）

# 4. 本地校验
node scripts/validate.js

# 5. 构建索引（可选，CI 会自动做）
node scripts/build-manifest.js

# 6. 提交 PR
git add data/sounds/animals/whale/
git commit -m "add: whale sound"
git push
# 然后在 GitHub 创建 Pull Request
```

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

## PR 检查清单

提交 PR 前请确认：

- [ ] 音频符合规范（MP3、44100Hz、128kbps、1-10秒、<300KB）
- [ ] meta.json 所有必填字段完整
- [ ] source 字段填写了来源 URL
- [ ] 目录和文件命名符合规范
- [ ] `node scripts/validate.js` 通过

---

有问题？先提 Issue，或直接在 PR 中讨论。
