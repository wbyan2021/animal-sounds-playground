/**
 * data.test.js — 测试数据完整性
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOUNDS_DIR = path.join(ROOT, 'data', 'sounds');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'categories.json');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function scanMetaFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanMetaFiles(full));
    } else if (entry.name === 'meta.json') {
      results.push(full);
    }
  }
  return results;
}

describe('manifest.json', () => {
  let manifest;

  before(() => {
    manifest = readJSON(MANIFEST_PATH);
  });

  test('文件存在且可解析', () => {
    assert.ok(manifest, 'manifest.json 为空或不存在');
  });

  test('有 version 字段且格式为 YYYY.MM.DD.N', () => {
    assert.ok(manifest.version, '缺少 version');
    assert.match(manifest.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  });

  test('有 generated_at 时间戳', () => {
    assert.ok(manifest.generated_at);
    assert.ok(!isNaN(new Date(manifest.generated_at).getTime()));
  });

  test('total_sounds 等于 sounds 数组长度', () => {
    assert.strictEqual(manifest.total_sounds, manifest.sounds.length);
  });

  test('total_sounds > 0', () => {
    assert.ok(manifest.total_sounds > 0, '没有任何声音');
  });

  test('total_audio_files > 0', () => {
    assert.ok(manifest.total_audio_files > 0, '没有任何音频');
  });

  test('sounds 数组每个元素有 id 且唯一', () => {
    const ids = manifest.sounds.map(s => s.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, '存在重复 id');
    for (const s of manifest.sounds) {
      assert.ok(s.id, '有元素缺少 id');
    }
  });

  test('每个声音有必填字段', () => {
    const required = ['id', 'category', 'name_zh', 'name_en', 'emoji', 'sounds'];
    for (const s of manifest.sounds) {
      for (const field of required) {
        assert.ok(s[field] !== undefined && s[field] !== null, `${s.id} 缺少 ${field}`);
      }
    }
  });

  test('每个声音的 sounds 数组非空且文件存在', () => {
    let missingCount = 0;
    for (const s of manifest.sounds) {
      assert.ok(Array.isArray(s.sounds) && s.sounds.length > 0, `${s.id} sounds 为空`);
      for (const snd of s.sounds) {
        const filePath = path.join(ROOT, snd.file);
        if (!fs.existsSync(filePath)) {
          missingCount++;
        }
      }
    }
    assert.strictEqual(missingCount, 0, `${missingCount} 个音频文件不存在`);
  });

  test('category 在 categories 列表中', () => {
    const categories = readJSON(CATEGORIES_PATH);
    const validIds = new Set(categories.map(c => c.id));
    for (const s of manifest.sounds) {
      assert.ok(validIds.has(s.category), `${s.id} category ${s.category} 无效`);
    }
  });
});

describe('categories.json', () => {
  let categories;

  before(() => {
    categories = readJSON(CATEGORIES_PATH);
  });

  test('是数组且非空', () => {
    assert.ok(Array.isArray(categories) && categories.length > 0);
  });

  test('每个分类有 id / name_zh / emoji', () => {
    for (const c of categories) {
      assert.ok(c.id, '分类缺少 id');
      assert.ok(c.name_zh, `${c.id} 缺少 name_zh`);
      assert.ok(c.emoji, `${c.id} 缺少 emoji`);
    }
  });

  test('每个分类有 subcategories', () => {
    for (const c of categories) {
      assert.ok(Array.isArray(c.subcategories), `${c.id} 缺少 subcategories`);
    }
  });

  test('分类 id 唯一', () => {
    const ids = categories.map(c => c.id);
    assert.strictEqual(ids.length, new Set(ids).size);
  });
});

describe('meta.json 完整性', () => {
  const metaFiles = scanMetaFiles(SOUNDS_DIR);

  test('至少有 50 个 meta.json', () => {
    assert.ok(metaFiles.length >= 50, `只有 ${metaFiles.length} 个 meta.json`);
  });

  test('每个 meta.json 可解析', () => {
    for (const p of metaFiles) {
      assert.doesNotThrow(() => readJSON(p), `解析失败: ${p}`);
    }
  });

  test('每个 meta.json 的 id 与目录路径一致', () => {
    for (const p of metaFiles) {
      const meta = readJSON(p);
      const rel = path.relative(SOUNDS_DIR, path.dirname(p));
      const parts = rel.split(path.sep);
      const expectedId = parts.join('.');
      assert.strictEqual(meta.id, expectedId, `${p}: id=${meta.id} 期望=${expectedId}`);
    }
  });

  test('每个 meta.json 有必填字段', () => {
    const required = ['id', 'category', 'name_zh', 'name_en', 'emoji',
      'sounds', 'license', 'source', 'contributor', 'added_at'];
    for (const p of metaFiles) {
      const meta = readJSON(p);
      for (const field of required) {
        assert.ok(meta[field] !== undefined && meta[field] !== null && meta[field] !== '',
          `${meta.id} 缺少必填字段 ${field}`);
      }
    }
  });

  test('sounds 数组非空且 file 存在', () => {
    for (const p of metaFiles) {
      const meta = readJSON(p);
      const metaDir = path.dirname(p);
      assert.ok(Array.isArray(meta.sounds) && meta.sounds.length > 0, `${meta.id} sounds 为空`);
      for (const s of meta.sounds) {
        assert.ok(s.file, `${meta.id} 有 sound 缺少 file`);
        const abs = path.join(metaDir, s.file);
        assert.ok(fs.existsSync(abs), `${meta.id}: 音频不存在 ${s.file}`);
      }
    }
  });

  test('单音频声音不应有音频级 fun_fact（避免冗余）', () => {
    for (const p of metaFiles) {
      const meta = readJSON(p);
      if (meta.sounds.length === 1) {
        const track = meta.sounds[0];
        assert.ok(!track.fun_fact,
          `${meta.id} 只有 1 条音频但仍有音频级 fun_fact，应清理`);
      }
    }
  });

  test('单音频声音不应有音频级 tts（避免冗余）', () => {
    for (const p of metaFiles) {
      const meta = readJSON(p);
      if (meta.sounds.length === 1) {
        const track = meta.sounds[0];
        assert.ok(!track.tts,
          `${meta.id} 只有 1 条音频但仍有音频级 tts，应清理`);
      }
    }
  });

  test('fun_fact 长度合理（20-200 字）', () => {
    for (const p of metaFiles) {
      const meta = readJSON(p);
      if (meta.fun_fact) {
        const len = meta.fun_fact.length;
        assert.ok(len >= 10 && len <= 300,
          `${meta.id} fun_fact 长度 ${len} 异常`);
      }
    }
  });
});
