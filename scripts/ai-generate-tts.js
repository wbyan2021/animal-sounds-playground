/**
 * ai-generate-tts.js
 * 批量调用 TTS 为声音条目生成 AI 朗读音频
 *
 * 支持两级朗读：
 *   - 声音级 TTS：name_zh / name_en / fun_fact
 *   - 音频级 TTS：meta.sounds[i].tts
 *
 * 用法：
 *   node scripts/ai-generate-tts.js                      # 为缺失 TTS 的条目生成
 *   node scripts/ai-generate-tts.js --force              # 重新生成所有
 *   node scripts/ai-generate-tts.js --id animals.cat     # 只生成指定条目
 *   node scripts/ai-generate-tts.js --category animals   # 只生成指定分类
 *   node scripts/ai-generate-tts.js --dry-run            # 预览模式
 *   node scripts/ai-generate-tts.js --types zh,en,fact   # 只生成指定声音级类型
 *   node scripts/ai-generate-tts.js --tracks             # 同时生成音频级 TTS
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, generateAndSaveSpeech, generateTrackTTS, getVoices, getTTSConfig } = require('./lib/minimax');

const DATA_DIR = path.join(__dirname, '..', 'data', 'sounds');
const DELAY_MS = 2500; // MiniMax 国内版 RPM 限流较严，间隔拉到 2.5 秒

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

function readMeta(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { throw new Error(`解析 ${p}: ${e.message}`); }
}
function writeMeta(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf-8'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const isDryRun = args.includes('--dry-run');
  const isTracks = args.includes('--tracks');
  const targetId = (() => { const i = args.indexOf('--id'); return i !== -1 ? args[i + 1] : null; })();
  const targetCat = (() => { const i = args.indexOf('--category'); return i !== -1 ? args[i + 1] : null; })();
  const typeArg = (() => { const i = args.indexOf('--types'); return i !== -1 ? args[i + 1] : null; })();
  const types = typeArg ? new Set(typeArg.split(',')) : new Set(['zh', 'en', 'fact']);

  loadEnv();
  const { apiKey } = getTTSConfig();
  if (!apiKey) {
    console.error('❌ 未设置 TTS_API_KEY。请在 .env 中配置。');
    process.exit(1);
  }

  const metaPaths = scanSounds();
  console.log(`📂 扫描到 ${metaPaths.length} 条声音`);
  if (targetCat) console.log(`🏷️  筛选分类: ${targetCat}`);
  if (targetId) console.log(`🎯 指定条目: ${targetId}`);
  console.log(`🎙️  生成类型: ${[...types].join(', ')}`);
  if (isTracks) console.log(`🎵 同时生成音频级 TTS`);
  console.log();

  let total = 0, skipped = 0, errors = 0;

  for (const metaPath of metaPaths) {
    let meta;
    try { meta = readMeta(metaPath); }
    catch (e) { console.error(`❌ ${e.message}`); errors++; continue; }

    if (targetId && meta.id !== targetId) continue;
    if (targetCat && meta.category !== targetCat) continue;

    const generatedDir = path.join(path.dirname(metaPath), 'generated');
    const tts = meta.tts || {};
    let changed = false;
    let localDone = 0;
    let localErrors = 0;

    // 1. 声音级 TTS
    // 中文名
    if (types.has('zh') && meta.name_zh && (!tts.name_zh || isForce)) {
      console.log(`🎙️ ${meta.id} → name-zh: "${meta.name_zh}"`);
      if (!isDryRun) {
        try {
          await generateAndSaveSpeech(meta.name_zh, generatedDir, 'name-zh.mp3', 'zh-name');
          tts.name_zh = 'generated/name-zh.mp3';
          changed = true;
          localDone++;
        } catch (e) {
          console.error(`   ❌ name-zh: ${e.message}`);
          errors++;
          localErrors++;
        }
      } else { localDone++; }
    }

    // 英文名
    if (types.has('en') && meta.name_en && (!tts.name_en || isForce)) {
      console.log(`🎙️ ${meta.id} → name-en: "${meta.name_en}"`);
      if (!isDryRun) {
        try {
          await generateAndSaveSpeech(meta.name_en, generatedDir, 'name-en.mp3', 'en-name');
          tts.name_en = 'generated/name-en.mp3';
          changed = true;
          localDone++;
        } catch (e) {
          console.error(`   ❌ name-en: ${e.message}`);
          errors++;
          localErrors++;
        }
      } else { localDone++; }
    }

    // 科普文案
    if (types.has('fact') && meta.fun_fact && (!tts.fun_fact || isForce)) {
      console.log(`🎙️ ${meta.id} → fun-fact: "${String(meta.fun_fact).slice(0, 40)}..."`);
      if (!isDryRun) {
        try {
          await generateAndSaveSpeech(meta.fun_fact, generatedDir, 'fun-fact.mp3', 'zh-fact');
          tts.fun_fact = 'generated/fun-fact.mp3';
          changed = true;
          localDone++;
        } catch (e) {
          console.error(`   ❌ fun-fact: ${e.message}`);
          errors++;
          localErrors++;
        }
      } else { localDone++; }
    }

    // 2. 音频级 TTS（只有多条音频才有意义；单条音频直接用声音级朗读）
    if (isTracks && Array.isArray(meta.sounds) && meta.sounds.length > 1) {
      for (let i = 0; i < meta.sounds.length; i++) {
        const track = meta.sounds[i];
        if (!isForce && track.tts) {
          console.log(`⏭️  ${meta.id} #${i + 1} 已有音频级 TTS，跳过`);
          continue;
        }
        const text = track.fun_fact || meta.fun_fact;
        if (!text || !text.trim()) {
          console.log(`⏭️  ${meta.id} #${i + 1} 没有文案，跳过音频级 TTS`);
          continue;
        }
        const display = track.label || `track-${i}`;
        console.log(`🎙️ ${meta.id} #${i + 1}（${display}）→ 音频级 TTS`);
        if (!isDryRun) {
          try {
            track.tts = await generateTrackTTS(text, generatedDir, i);
            track.tts_generated_at = new Date().toISOString();
            changed = true;
            localDone++;
          } catch (e) {
            console.error(`   ❌ ${meta.id} #${i + 1}: ${e.message}`);
            errors++;
            localErrors++;
          }
        } else {
          localDone++;
        }
      }
    }

    if (localDone === 0 && localErrors === 0) { skipped++; continue; }

    total += localDone;

    if (changed) {
      const voices = getVoices();
      const { model: ttsModel } = getTTSConfig();
      tts.voice_id_zh = voices['zh-name']?.voice_id || 'female-tianmei';
      tts.voice_id_en = voices['en-name']?.voice_id || 'male-qn-qingse';
      tts.generated_at = new Date().toISOString();
      tts.tts_model = ttsModel;
      meta.tts = tts;
      try { writeMeta(metaPath, meta); console.log(`   ✅ 已写入 meta.json`); }
      catch (e) { console.error(`   ❌ 写 meta 失败: ${e.message}`); }
    } else if (isDryRun) {
      console.log(`   📝 [dry-run]`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  生成: ${total}  跳过: ${skipped}  失败: ${errors}`);
  if (isDryRun) console.log('📝 dry-run 模式，未写入文件');
}

main().catch(err => { console.error('致命错误:', err); process.exit(1); });
