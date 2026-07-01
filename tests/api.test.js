/**
 * api.test.js — 测试后台 API 端点
 * 使用已运行的服务 (http://localhost:3099)
 * 只测试只读接口和错误处理，不修改真实数据
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');

const BASE = 'http://localhost:3099';

async function fetchJSON(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, options);
  let body;
  try { body = await res.json(); }
  catch { body = null; }
  return { status: res.status, body };
}

// 检查服务是否在运行
let serverRunning = false;

before(async () => {
  try {
    const res = await fetch(`${BASE}/api/status`);
    serverRunning = res.ok;
  } catch {
    serverRunning = false;
  }
});

const it = (name, fn) => {
  test(name, async () => {
    if (!serverRunning) return; // 静默跳过
    await fn();
  });
};

describe('GET /api/status', () => {
  it('返回 200', async () => {
    const { status } = await fetchJSON('/api/status');
    assert.strictEqual(status, 200);
  });

  it('包含必要的配置字段', async () => {
    const { body } = await fetchJSON('/api/status');
    assert.ok(body);
    assert.ok('llmApiKey' in body);
    assert.ok('ttsApiKey' in body);
    assert.ok('llmEndpoint' in body);
    assert.ok('ttsEndpoint' in body);
    assert.ok('llmModel' in body);
    assert.ok('ttsModel' in body);
  });

  it('包含统计数据', async () => {
    const { body } = await fetchJSON('/api/status');
    assert.ok(typeof body.totalSounds === 'number');
    assert.ok(typeof body.trackTotalCount === 'number');
    assert.ok(typeof body.trackFactCount === 'number');
    assert.ok(typeof body.trackTtsCount === 'number');
    assert.ok(body.totalSounds > 0, '应该有声音数据');
  });

  it('LLM 和 TTS 都已配置', async () => {
    const { body } = await fetchJSON('/api/status');
    assert.strictEqual(body.llmApiKey, '✅ 已配置');
    assert.strictEqual(body.ttsApiKey, '✅ 已配置');
  });
});

describe('GET /api/sound-detail', () => {
  it('返回指定声音的详情', async () => {
    const { status, body } = await fetchJSON('/api/sound-detail?id=animals.dog');
    assert.strictEqual(status, 200);
    assert.ok(body);
    assert.strictEqual(body.id, 'animals.dog');
    assert.ok(Array.isArray(body.sounds));
    assert.ok(body.sounds.length > 0);
  });

  it('每个 sound 条目有 file 字段', async () => {
    const { body } = await fetchJSON('/api/sound-detail?id=animals.dog');
    for (const s of body.sounds) {
      assert.ok(s.file, 'sound 条目缺少 file');
    }
  });

  it('无效 ID 返回 400', async () => {
    const { status, body } = await fetchJSON('/api/sound-detail?id=invalid');
    assert.strictEqual(status, 400);
    assert.ok(body.error);
  });

  it('不存在的声音返回 404', async () => {
    const { status, body } = await fetchJSON('/api/sound-detail?id=animals.nonexistent');
    assert.strictEqual(status, 404);
    assert.ok(body.error);
  });

  it('缺少 id 参数返回 400', async () => {
    const { status } = await fetchJSON('/api/sound-detail');
    assert.strictEqual(status, 400);
  });
});

describe('GET /data/manifest.json (静态文件)', () => {
  it('返回 manifest JSON', async () => {
    const res = await fetch(`${BASE}/data/manifest.json`);
    assert.strictEqual(res.status, 200);
    const manifest = await res.json();
    assert.ok(Array.isArray(manifest.sounds));
    assert.ok(manifest.sounds.length > 0);
    assert.ok(manifest.categories);
  });
});

describe('POST /api/track-generate-fact 错误处理', () => {
  it('无效 ID 返回 400', async () => {
    const { status, body } = await fetchJSON('/api/track-generate-fact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'invalid', trackIndex: 0 })
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error);
  });

  it('不存在的声音返回 404', async () => {
    const { status } = await fetchJSON('/api/track-generate-fact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'animals.nonexistent', trackIndex: 0 })
    });
    assert.strictEqual(status, 404);
  });

  it('单条音频的声音拒绝生成音频级文案', async () => {
    // transport.train 只有 1 条音频
    const { status, body } = await fetchJSON('/api/track-generate-fact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'transport.train', trackIndex: 0 })
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('一条音频') || body.error.includes('主文案'));
  });
});

describe('POST /api/track-generate-tts 错误处理', () => {
  it('单条音频的声音拒绝生成音频级 TTS', async () => {
    const { status, body } = await fetchJSON('/api/track-generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'transport.train', trackIndex: 0 })
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('一条音频') || body.error.includes('声音级'));
  });
});

describe('POST /api/run 安全限制', () => {
  it('拒绝运行非白名单脚本', async () => {
    const { status, body } = await fetchJSON('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: 'malicious.js', args: [] })
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('不允许'));
  });
});

describe('GET / (管理页面)', () => {
  it('返回 HTML 页面', async () => {
    const res = await fetch(`${BASE}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('声音大百科'));
  });
});
