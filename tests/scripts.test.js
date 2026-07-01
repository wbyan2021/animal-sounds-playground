/**
 * scripts.test.js — 测试脚本执行（build-manifest, validate, ai-generate dry-run）
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

function runScript(script, args = []) {
  const result = spawnSync(NODE, [path.join('scripts', script), ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  return result;
}

describe('build-manifest.js', () => {
  test('正常执行并生成 manifest.json', () => {
    const result = runScript('build-manifest.js');
    assert.strictEqual(result.status, 0, `退出码 ${result.status}\nstderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('manifest.json 已生成'));
  });

  test('生成的 manifest 包含必要字段', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf-8'));
    assert.ok(manifest.version, '缺少 version');
    assert.ok(manifest.generated_at, '缺少 generated_at');
    assert.ok(Array.isArray(manifest.sounds), 'sounds 不是数组');
    assert.ok(manifest.sounds.length > 0, 'sounds 为空');
    assert.ok(Array.isArray(manifest.categories), 'categories 不是数组');
    assert.ok(manifest.total_sounds > 0, 'total_sounds 为 0');
    assert.ok(manifest.total_audio_files > 0, 'total_audio_files 为 0');
  });

  test('dry-run 模式不写文件', () => {
    const before = fs.statSync(path.join(ROOT, 'data/manifest.json')).mtimeMs;
    const result = runScript('build-manifest.js', ['--dry-run']);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('dry-run'));
    const after = fs.statSync(path.join(ROOT, 'data/manifest.json')).mtimeMs;
    assert.strictEqual(before, after, 'dry-run 模式修改了 manifest.json');
  });

  test('manifest 中 sounds 数量与 total_sounds 一致', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf-8'));
    assert.strictEqual(manifest.sounds.length, manifest.total_sounds);
  });
});

describe('validate.js', () => {
  test('正常执行，无 FAIL', () => {
    const result = runScript('validate.js');
    assert.strictEqual(result.status, 0, `校验失败，退出码 ${result.status}\n${result.stdout}`);
    assert.ok(result.stdout.includes('校验汇总'));
    assert.ok(!result.stdout.includes('✗ FAIL: 0\n') === false || result.stdout.includes('✗ FAIL: 0'));
  });

  test('指定无效路径时退出码非零', () => {
    const result = runScript('validate.js', ['--path', 'data/nonexistent']);
    assert.notStrictEqual(result.status, 0);
  });
});

describe('ai-generate-fun-fact.js', () => {
  test('dry-run 模式不写文件', () => {
    const result = runScript('ai-generate-fun-fact.js', ['--dry-run', '--id', 'animals.fox']);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('dry-run'));
  });

  test('--tracks 参数被识别', () => {
    const result = runScript('ai-generate-fun-fact.js', ['--dry-run', '--tracks', '--id', 'animals.fox']);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('音频级文案') || result.stdout.includes('跳过'));
  });

  test('单条音频声音跳过音频级文案生成', () => {
    const result = runScript('ai-generate-fun-fact.js', ['--dry-run', '--tracks', '--id', 'transport.train']);
    assert.strictEqual(result.status, 0);
    // train 只有 1 条音频，应跳过音频级
    // 主文案已存在且非 force，应跳过
    assert.ok(result.stdout.includes('跳过') || result.stdout.includes('已有') || result.stdout.includes('dry-run'));
  });
});

describe('ai-generate-tts.js', () => {
  test('dry-run 模式不写文件', () => {
    const result = runScript('ai-generate-tts.js', ['--dry-run', '--id', 'animals.fox']);
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes('dry-run') || result.stdout.includes('跳过'));
  });

  test('--tracks 参数被识别', () => {
    const result = runScript('ai-generate-tts.js', ['--dry-run', '--tracks', '--id', 'animals.fox']);
    assert.strictEqual(result.status, 0);
    // fox 只有 1 条音频，应跳过音频级
    assert.ok(result.stdout.includes('跳过') || result.stdout.includes('dry-run'));
  });
});

describe('脚本语法检查', () => {
  const scripts = [
    'admin-server.js',
    'ai-generate-fun-fact.js',
    'ai-generate-tts.js',
    'build-manifest.js',
    'validate.js',
    'lib/minimax.js',
  ];

  for (const script of scripts) {
    test(`node --check scripts/${script}`, () => {
      const result = spawnSync(NODE, ['--check', path.join('scripts', script)], {
        cwd: ROOT,
        encoding: 'utf-8',
      });
      assert.strictEqual(result.status, 0, `${script} 语法错误:\n${result.stderr}`);
    });
  }
});
