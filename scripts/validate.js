/**
 * validate.js
 * 校验 data/sounds/ 下所有 meta.json 的数据完整性。
 *
 * 用法:
 *   node scripts/validate.js                              # 校验所有
 *   node scripts/validate.js --path data/sounds/animals/dog # 只校验指定路径
 */

const fs = require('fs');
const path = require('path');

// 项目根目录（scripts/ 的上级）
const ROOT = path.resolve(__dirname, '..');
const SOUNDS_DIR = path.join(ROOT, 'data', 'sounds');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'categories.json');

// 解析 --path 参数
const pathArgIndex = process.argv.indexOf('--path');
const TARGET_PATH = pathArgIndex !== -1 ? process.argv[pathArgIndex + 1] : null;

// 音频文件大小上限（字节），超过为警告
const AUDIO_SIZE_WARN = 300 * 1024; // 300KB

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 读取并解析 JSON 文件，失败时抛出明确错误。
 */
function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`无法读取 ${filePath}: ${err.message}`);
  }
}

/**
 * 递归扫描指定目录，返回匹配模式的文件路径列表。
 */
function scanDir(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 校验结果收集器
// ---------------------------------------------------------------------------

const results = {
  pass: [],   // 通过的规则
  warn: [],   // 警告
  fail: [],   // 失败的校验
};

function addPass(msg) {
  results.pass.push(msg);
  console.log(`  ✓ ${msg}`);
}

function addWarn(msg) {
  results.warn.push(msg);
  console.log(`  ⚠ ${msg}`);
}

function addFail(msg) {
  results.fail.push(msg);
  console.log(`  ✗ ${msg}`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  // 读取 categories.json 用于校验 category 有效性
  let categoriesData;
  try {
    categoriesData = readJSON(CATEGORIES_PATH);
  } catch (err) {
    addFail(err.message);
    printSummary();
    return;
  }
  const validCategoryIds = new Set(categoriesData.map(c => c.id));

  // 扫描 meta.json 文件（若指定 --path 则限定范围）
  const scanRoot = TARGET_PATH ? path.resolve(ROOT, TARGET_PATH) : SOUNDS_DIR;
  if (!fs.existsSync(scanRoot)) {
    addFail(`路径不存在: ${scanRoot}`);
    printSummary();
    return;
  }

  const metaFiles = scanDir(scanRoot, /^meta\.json$/);
  if (metaFiles.length === 0) {
    addFail(`在 ${path.relative(ROOT, scanRoot)} 下未找到任何 meta.json 文件`);
    printSummary();
    return;
  }

  console.log(`扫描 ${metaFiles.length} 个 meta.json...\n`);

  // 逐文件校验
  const idSet = new Set(); // 用于检查 id 唯一性

  for (const metaPath of metaFiles) {
    const metaRel = path.relative(ROOT, metaPath);
    const metaDir = path.dirname(metaPath);
    const entryName = path.basename(metaDir); // 如 "dog", "cat"

    console.log(`--- ${metaRel} ---`);

    // 读取 meta.json
    let meta;
    try {
      meta = readJSON(metaPath);
    } catch (err) {
      addFail(`${metaRel}: ${err.message}`);
      continue;
    }

    // ---------- 规则 1: 必填字段校验 ----------
    const requiredFields = ['id', 'category', 'name_zh', 'name_en', 'emoji', 'sounds', 'license', 'source', 'contributor', 'added_at'];
    let hasMissingField = false;
    for (const field of requiredFields) {
      if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
        addFail(`${metaRel}: 缺少必填字段 "${field}"`);
        hasMissingField = true;
      }
    }
    // 缺失必填字段则跳过后续对该 meta 的依赖校验
    if (hasMissingField) continue;

    // ---------- 规则 2: id 格式校验 {category}.{name} ----------
    if (typeof meta.id !== 'string' || !meta.id.includes('.')) {
      addFail(`${metaRel}: id 格式无效 "${meta.id}"，应为 {category}.{name}`);
    } else {
      const parts = meta.id.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        addFail(`${metaRel}: id 格式无效 "${meta.id}"，应为恰好 {category}.{name} 两段`);
      }
    }

    // ---------- 规则 3: category 有效性 ----------
    if (typeof meta.category === 'string') {
      if (!validCategoryIds.has(meta.category)) {
        addFail(`${metaRel}: category "${meta.category}" 不在 categories.json 中`);
      }
    }

    // ---------- 规则 4: id 唯一性 ----------
    if (typeof meta.id === 'string') {
      if (idSet.has(meta.id)) {
        addFail(`${metaRel}: id "${meta.id}" 重复`);
      } else {
        idSet.add(meta.id);
      }
    }

    // ---------- 规则 8: 目录命名（仅小写字母和下划线） ----------
    if (!/^[a-z_]+$/.test(entryName)) {
      addFail(`${metaRel}: 目录名 "${entryName}" 只能包含小写字母和下划线`);
    }

    // ---------- 规则 5: 音频文件存在性 ----------
    // ---------- 规则 6: 音频格式 (.mp3) ----------
    // ---------- 规则 7: 音频大小 (< 300KB 警告) ----------
    if (!Array.isArray(meta.sounds) || meta.sounds.length === 0) {
      addWarn(`${metaRel}: sounds 数组为空`);
      continue;
    }

    for (const sound of meta.sounds) {
      if (!sound.file || typeof sound.file !== 'string') {
        addFail(`${metaRel}: sounds 中有条目缺少 file 字段`);
        continue;
      }

      // 文件路径相对于 meta.json 所在目录
      const audioPath = path.join(metaDir, sound.file);
      const audioRel = path.relative(ROOT, audioPath);

      // 规则 6: 扩展名检查
      if (!sound.file.toLowerCase().endsWith('.mp3')) {
        addFail(`${metaRel}: 音频文件 "${sound.file}" 不是 .mp3 格式`);
        continue;
      }
      // 规则 5: 文件存在性
      if (!fs.existsSync(audioPath)) {
        addFail(`${metaRel}: 音频文件不存在 "${audioRel}"`);
        continue;
      }

      // 规则 7: 文件大小警告
      try {
        const stat = fs.statSync(audioPath);
        if (stat.size >= AUDIO_SIZE_WARN) {
          const sizeKB = (stat.size / 1024).toFixed(1);
          addWarn(`${metaRel}: 音频文件 "${sound.file}" 大小 ${sizeKB}KB，超过 ${AUDIO_SIZE_WARN / 1024}KB 警告阈值`);
        }
      } catch (err) {
        addWarn(`${metaRel}: 无法获取音频文件大小 "${audioRel}": ${err.message}`);
      }

      // 规则 9.2: 子音频 TTS 存在性校验
      if (sound.tts) {
        let ttsPath;
        if (sound.tts.startsWith('data/')) {
          ttsPath = path.join(ROOT, sound.tts);
        } else {
          ttsPath = path.join(metaDir, sound.tts);
        }
        const ttsRel = path.relative(ROOT, ttsPath);
        if (!fs.existsSync(ttsPath)) {
          addFail(`${metaRel}: 子音频 "${sound.file}" 的 tts 引用的文件不存在 "${ttsRel}"`);
        } else {
          const ext = path.extname(sound.tts).toLowerCase();
          if (ext !== '.wav' && ext !== '.mp3') {
            addWarn(`${metaRel}: 子音频 "${sound.file}" 的 tts 文件格式 "${ext}" 不是 .wav 或 .mp3`);
          }
        }
      }
    }
    // ---------- 规则 9: TTS 字段校验（可选字段，存在则检查） ----------
    if (meta.tts) {
      const ttsFields = ['name_zh', 'name_en', 'fun_fact'];
      for (const field of ttsFields) {
        if (meta.tts[field]) {
          let ttsPath;
          // 兼容两种路径格式：相对 meta 目录的路径 或 以 data/ 开头的仓库根相对路径
          if (meta.tts[field].startsWith('data/')) {
            ttsPath = path.join(ROOT, meta.tts[field]);
          } else {
            ttsPath = path.join(metaDir, meta.tts[field]);
          }
          const ttsRel = path.relative(ROOT, ttsPath);
          if (!fs.existsSync(ttsPath)) {
            addFail(`${metaRel}: tts.${field} 引用的文件不存在 "${ttsRel}"`);
          } else {
            const ext = path.extname(meta.tts[field]).toLowerCase();
            if (ext !== '.wav' && ext !== '.mp3') {
              addWarn(`${metaRel}: tts.${field} 文件格式 "${ext}" 不是 .wav 或 .mp3`);
            }
          }
        }
      }
    }

    // ---------- 规则 10: fun_fact 长度建议 ----------
    if (meta.fun_fact && typeof meta.fun_fact === 'string') {
      const len = meta.fun_fact.length;
      if (len < 20 || len > 80) {
        addWarn(`${metaRel}: fun_fact 长度 ${len} 字，建议 30-50 字`);
      }
    }
  }

  // 输出汇总
  printSummary();
}

/**
 * 输出最终校验汇总。
 * 格式:
 *   ✓ PASS: 通过数
 *   ⚠ WARN: 警告数
 *   ✗ FAIL: 失败数 (exit code 1)
 */
function printSummary() {
  console.log('\n========== 校验汇总 ==========');
  console.log(`✓ PASS: ${results.pass.length}`);
  console.log(`⚠ WARN: ${results.warn.length}`);
  console.log(`✗ FAIL: ${results.fail.length}`);

  if (results.fail.length > 0) {
    console.log('\n[失败详情]');
    results.fail.forEach(msg => console.log(`  ✗ ${msg}`));
  }

  if (results.warn.length > 0) {
    console.log('\n[警告详情]');
    results.warn.forEach(msg => console.log(`  ⚠ ${msg}`));
  }

  console.log('==============================\n');

  // 有失败项时以 exit code 1 退出
  if (results.fail.length > 0) {
    process.exit(1);
  }
}

main();
