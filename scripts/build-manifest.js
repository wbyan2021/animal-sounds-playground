/**
 * build-manifest.js
 * 扫描 data/sounds/ 下所有 meta.json，读取 data/categories.json，
 * 生成 data/manifest.json。
 *
 * 用法:
 *   node scripts/build-manifest.js           # 生成 manifest.json
 *   node scripts/build-manifest.js --dry-run # 仅输出统计，不写文件
 */

const fs = require('fs');
const path = require('path');

// 项目根目录（scripts/ 的上级）
const ROOT = path.resolve(__dirname, '..');
const SOUNDS_DIR = path.join(ROOT, 'data', 'sounds');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'categories.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');

// 是否 dry-run 模式
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 递归扫描目录，返回所有匹配 glob 模式的文件路径列表。
 * 使用 fs.readdirSync + 递归，无需外部依赖。
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

// ---------------------------------------------------------------------------
// 生成版本号：YYYY.MM.DD.N
// ---------------------------------------------------------------------------

function computeVersion() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${y}.${m}.${d}`;

  // 读取已有 manifest
  let existingVersion = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    const existing = readJSON(MANIFEST_PATH);
    existingVersion = existing.version || null;
  }

  if (existingVersion && existingVersion.startsWith(datePrefix)) {
    // 同一天，序号递增
    const parts = existingVersion.split('.');
    const n = parseInt(parts[3], 10) || 0;
    return `${datePrefix}.${n + 1}`;
  }

  // 新的一天或无 manifest
  return `${datePrefix}.1`;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  // 1. 读取 categories.json
  console.log('读取 categories.json...');
  let categories;
  try {
    categories = readJSON(CATEGORIES_PATH);
  } catch (err) {
    console.error(`✗ 错误: ${err.message}`);
    process.exit(1);
  }

  // 2. 扫描所有 meta.json 文件
  console.log('扫描 meta.json 文件...');
  const metaFiles = scanDir(SOUNDS_DIR, /^meta\.json$/);
  if (metaFiles.length === 0) {
    console.error('✗ 错误: 在 data/sounds/ 下未找到任何 meta.json 文件');
    process.exit(1);
  }
  console.log(`  找到 ${metaFiles.length} 个 meta.json`);

  // 3. 读取并处理每个 meta.json
  const sounds = [];
  let totalAudioFiles = 0;

  for (const metaPath of metaFiles) {
    let meta;
    try {
      meta = readJSON(metaPath);
    } catch (err) {
      console.error(`✗ 错误: ${err.message}`);
      process.exit(1);
    }

    // 计算 meta.json 所在目录相对于项目根目录的路径
    // 例如: data/sounds/animals/dog
    const metaDir = path.dirname(path.relative(ROOT, metaPath));

    // 将 sounds[].file 从相对于 meta.json 目录的路径
    // 转换为相对于项目根目录的路径
    // 例如: "audio/dog1a.mp3" -> "data/sounds/animals/dog/audio/dog1a.mp3"
    // 同时检查文件是否真实存在（磁盘同步：物理删除的文件自动过滤）
    if (Array.isArray(meta.sounds)) {
      const validSounds = [];
      let removedCount = 0;
      for (const s of meta.sounds) {
        const remappedFile = path.posix.join(metaDir, s.file);
        const absPath = path.join(ROOT, remappedFile);
        if (fs.existsSync(absPath)) {
          validSounds.push({ ...s, file: remappedFile });
        } else {
          removedCount++;
        }
      }
      if (removedCount > 0) {
        console.log(`  ⚠️  ${meta.id}: 过滤了 ${removedCount} 个不存在的音频文件`);
      }
      meta.sounds = validSounds;
      totalAudioFiles += meta.sounds.length;
    }

    // 同样重映射 tts.* 路径，使其也相对于仓库根目录
    if (meta.tts) {
      const ttsFields = ['name_zh', 'name_en', 'fun_fact'];
      for (const field of ttsFields) {
        if (meta.tts[field] && typeof meta.tts[field] === 'string' && !meta.tts[field].startsWith('data/')) {
          meta.tts[field] = path.posix.join(metaDir, meta.tts[field]);
          totalAudioFiles++;
        }
      }
    }

    sounds.push(meta);
  }

  // 4. 生成 manifest 对象
  const manifest = {
    version: computeVersion(),
    generated_at: new Date().toISOString(),
    total_sounds: sounds.length,
    total_audio_files: totalAudioFiles,
    categories: categories,
    sounds: sounds,
  };

  // 5. 输出统计信息
  console.log('\n===== 构建统计 =====');
  console.log(`  版本:            ${manifest.version}`);
  console.log(`  生成时间:        ${manifest.generated_at}`);
  console.log(`  分类数:          ${categories.length}`);
  console.log(`  声音条目数:      ${manifest.total_sounds}`);
  console.log(`  音频文件总数:    ${manifest.total_audio_files}`);
  console.log('====================\n');

  // 6. 写入文件（或 dry-run）
  if (DRY_RUN) {
    console.log('[dry-run] 未写入 manifest.json');
  } else {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`✓ manifest.json 已生成: ${MANIFEST_PATH}`);
  }
}

main();
