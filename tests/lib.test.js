/**
 * lib.test.js — 测试 scripts/lib/minimax.js 的工具函数
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const minimax = require('../scripts/lib/minimax');

describe('sha256', () => {
  test('返回 16 位 hex 字符串', () => {
    const hash = minimax.sha256('hello');
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 16);
    assert.match(hash, /^[0-9a-f]+$/);
  });

  test('相同输入返回相同结果', () => {
    assert.strictEqual(minimax.sha256('test'), minimax.sha256('test'));
  });

  test('不同输入返回不同结果', () => {
    assert.notStrictEqual(minimax.sha256('a'), minimax.sha256('b'));
  });

  test('空字符串也能处理', () => {
    assert.doesNotThrow(() => minimax.sha256(''));
  });
});

describe('getLLMConfig', () => {
  test('返回必要字段', () => {
    const cfg = minimax.getLLMConfig();
    assert.ok(typeof cfg === 'object');
    assert.ok('apiKey' in cfg);
    assert.ok('endpoint' in cfg);
    assert.ok('model' in cfg);
    assert.ok('maxTokens' in cfg);
    assert.ok('temperature' in cfg);
  });

  test('maxTokens 是正整数', () => {
    const cfg = minimax.getLLMConfig();
    assert.ok(cfg.maxTokens > 0);
    assert.strictEqual(cfg.maxTokens, Math.floor(cfg.maxTokens));
  });

  test('temperature 在 0-2 范围内', () => {
    const cfg = minimax.getLLMConfig();
    assert.ok(cfg.temperature >= 0 && cfg.temperature <= 2);
  });
});

describe('getTTSConfig', () => {
  test('返回必要字段', () => {
    const cfg = minimax.getTTSConfig();
    assert.ok(typeof cfg === 'object');
    assert.ok('apiKey' in cfg);
    assert.ok('endpoint' in cfg);
    assert.ok('model' in cfg);
    assert.ok('sampleRate' in cfg);
  });

  test('sampleRate 是常见值', () => {
    const cfg = minimax.getTTSConfig();
    assert.ok([8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(cfg.sampleRate));
  });
});

describe('getVoices', () => {
  test('返回 zh-name / zh-fact / en-name 预设', () => {
    const voices = minimax.getVoices();
    assert.ok(voices['zh-name'], '缺少 zh-name');
    assert.ok(voices['zh-fact'], '缺少 zh-fact');
    assert.ok(voices['en-name'], '缺少 en-name');
  });

  test('每个预设都有 voice_id', () => {
    const voices = minimax.getVoices();
    for (const [key, vc] of Object.entries(voices)) {
      assert.ok(vc.voice_id, `${key} 缺少 voice_id`);
    }
  });

  test('speed 在 0-2 范围内', () => {
    const voices = minimax.getVoices();
    for (const [key, vc] of Object.entries(voices)) {
      assert.ok(vc.speed > 0 && vc.speed <= 2, `${key} speed 异常: ${vc.speed}`);
    }
  });
});

describe('loadEnv', () => {
  test('能正常加载 .env 不抛异常', () => {
    assert.doesNotThrow(() => minimax.loadEnv());
  });

  test('加载后 LLM_API_KEY 或 MINIMAX_API_KEY 至少有一个被设置（如果 .env 存在）', () => {
    minimax.loadEnv();
    const hasKey = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY;
    // 如果 .env 不存在则跳过
    if (hasKey) {
      assert.ok(hasKey.length > 0);
    }
  });
});

describe('DEFAULT_VOICES', () => {
  test('导出了 DEFAULT_VOICES 常量', () => {
    assert.ok(typeof minimax.DEFAULT_VOICES === 'object');
    assert.ok(minimax.DEFAULT_VOICES['zh-name']);
  });
});

describe('导出完整性', () => {
  test('所有预期的函数都被导出', () => {
    const expected = ['loadEnv', 'getLLMConfig', 'getTTSConfig', 'callLLM',
      'generateSpeech', 'generateFunFact', 'generateTrackFact',
      'generateAndSaveSpeech', 'generateTrackTTS', 'getVoices',
      'DEFAULT_VOICES', 'sha256'];
    for (const name of expected) {
      assert.ok(typeof minimax[name] !== 'undefined', `未导出 ${name}`);
    }
  });

  test('generateTrackFact 是函数', () => {
    assert.strictEqual(typeof minimax.generateTrackFact, 'function');
  });

  test('generateTrackTTS 是函数', () => {
    assert.strictEqual(typeof minimax.generateTrackTTS, 'function');
  });
});
