/**
 * ai-generate-fun-fact.js
 * 批量调用 LLM 为声音条目生成儿童科普文案
 *
 * 支持两级文案：
 *   - 声音级 fun_fact（meta.fun_fact）
 *   - 音频级 fun_fact（meta.sounds[i].fun_fact）
 *
 * 用法：
 *   node scripts/ai-generate-fun-fact.js                    # 为缺失声音级文案的条目生成
 *   node scripts/ai-generate-fun-fact.js --force            # 重新生成所有声音级文案
 *   node scripts/ai-generate-fun-fact.js --id animals.dog   # 只生成指定条目
 *   node scripts/ai-generate-fun-fact.js --category animals # 只生成指定分类
 *   node scripts/ai-generate-fun-fact.js --dry-run          # 预览模式，不写文件
 *   node scripts/ai-generate-fun-fact.js --tracks           # 同时生成音频级文案
 *   node scripts/ai-generate-fun-fact.js --force --tracks   # 同时覆盖声音级+音频级文案
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, generateFunFact, generateTrackFact, getLLMConfig } = require('./lib/minimax');

const DATA_DIR = path.join(__dirname, '..', 'data', 'sounds');
const DELAY_MS = 500;

function scanSounds() {
  const results = [];
  if (!fs.existsSync(DATA_DIR)) return results;
  for (const cat of fs.readdirSync(DATA_DIR)) {
    const catDir = path.join(DATA_DIR, cat);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const snd of fs.readdirSync(catDir)) {
      const metaPath = path.join(catDir, snd, 'meta.json');
      if (fs.existsSync(metaPath)) results.push(metaPath);
    }
  }
  return results;
}

function readMeta(metaPath) {
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')); }
  catch (e) { throw new Error(`解析 ${metaPath}: ${e.message}`); }
}

function writeMeta(metaPath, data) {
  fs.writeFileSync(metaPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fileNameFromTrack(track) {
  if (!track.file) return 'unknown';
  return track.file.split('/').pop().replace(/\.[^.]+$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const isDryRun = args.includes('--dry-run');
  const isTracks = args.includes('--tracks');
  const targetId = (() => { const i = args.indexOf('--id'); return i !== -1 ? args[i + 1] : null; })();
  const targetCat = (() => { const i = args.indexOf('--category'); return i !== -1 ? args[i + 1] : null; })();

  loadEnv();

  const { apiKey } = getLLMConfig();
  if (!apiKey) {
    console.error('❌ 未设置 LLM_API_KEY。请在 .env 中配置。');
    process.exit(1);
  }

  const metaPaths = scanSounds();
  console.log(`📂 扫描到 ${metaPaths.length} 个 meta.json`);
  if (targetCat) console.log(`🏷️  筛选分类: ${targetCat}`);
  if (targetId) console.log(`🎯 指定条目: ${targetId}`);
  if (isTracks) console.log(`🎵 同时生成音频级文案`);
  console.log();

  let generated = 0, skipped = 0, errors = 0;

  for (const metaPath of metaPaths) {
    let meta;
    try { meta = readMeta(metaPath); }
    catch (e) { console.error(`❌ ${e.message}`); errors++; continue; }

    if (targetId && meta.id !== targetId) continue;
    if (targetCat && meta.category !== targetCat) continue;

    let changed = false;

    // 1. 声音级主文案
    if (!isTracks || isForce || !meta.fun_fact || !meta.fun_fact.trim()) {
      // 当 --tracks 且没有 --force 时，如果主文案已存在就不重复生成，避免浪费 token
      if (!meta.fun_fact || !meta.fun_fact.trim() || isForce) {
        console.log(`🤖 ${meta.id}（${meta.name_zh}）生成声音级文案...`);
        try {
          const result = isDryRun ? { text: '[dry-run]', ai: {} } : await generateFunFact(meta);
          if (!isDryRun) {
            meta.fun_fact = result.text;
            meta.fun_fact_ai_generated = true;
            meta.ai = result.ai;
            writeMeta(metaPath, meta);
            changed = true;
          }
          console.log(`   → ${result.text}`);
          console.log(`   ✅ 已写入`);
          generated++;
        } catch (err) {
          console.error(`   ❌ ${meta.id}: ${err.message}`);
          errors++;
        }
      }
    }

    // 2. 音频级文案（只有多条音频才有意义；单条音频直接复用主文案）
    if (isTracks && Array.isArray(meta.sounds) && meta.sounds.length > 1) {
      let trackChanged = false;
      for (let i = 0; i < meta.sounds.length; i++) {
        const track = meta.sounds[i];
        if (!isForce && track.fun_fact && track.fun_fact.trim()) {
          console.log(`⏭️  ${meta.id} #${i + 1} 已有音频级文案，跳过`);
          continue;
        }

        const fileName = fileNameFromTrack(track);
        const display = track.label || fileName || `#${i + 1}`;
        console.log(`🤖 ${meta.id} #${i + 1}（${display}）生成音频级文案...`);
        try {
          const result = isDryRun ? { text: '[dry-run]', ai: {} } : await generateTrackFact(meta, track, fileName);
          if (!isDryRun) {
            track.fun_fact = result.text;
            track.fun_fact_ai_generated = true;
          }
          console.log(`   → ${result.text}`);
          console.log(`   ✅ 已写入`);
          generated++;
          trackChanged = true;
        } catch (err) {
          console.error(`   ❌ ${meta.id} #${i + 1}: ${err.message}`);
          errors++;
        }
      }
      if (trackChanged) changed = true;
    }

    if (!changed && !isDryRun) {
      skipped++;
    } else if (isDryRun) {
      console.log(`   📝 [dry-run]`);
    }

    if (changed) {
      writeMeta(metaPath, meta);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  生成: ${generated}  跳过: ${skipped}  失败: ${errors}`);
  if (isDryRun) console.log('📝 dry-run 模式，未写入文件');
}

main().catch(err => { console.error('致命错误:', err); process.exit(1); });
