/**
 * admin-server.js — 声音大百科 API 管理后台
 *
 * 本地开发工具，提供 Web 界面：
 *   1. 查看 API Key 状态和数据统计
 *   2. 触发 AI 文案/TTS 批量生成
 *   3. 重建 manifest
 *   4. 实时终端输出
 *
 * 启动：node scripts/admin-server.js
 * 打开：http://localhost:3099
 *
 * 零外部依赖，仅使用 Node.js 内置模块。
 * 安全：仅绑定 127.0.0.1，不对外暴露。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadEnv } = require('./lib/minimax');

// 启动时加载 .env 配置
loadEnv();

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const PORT = 3099;

// ============================================================
// 安全工具
// ============================================================

/** 过滤换行符，防止 .env 注入 */
function sanitizeEnvValue(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]/g, '').trim();
}

/** 安全解析 JSON body */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ============================================================
// 工具
// ============================================================

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function readEnvVar(key, defaultValue = '') {
  try {
    const env = fs.readFileSync(ENV_PATH, 'utf-8');
    const m = env.match(new RegExp(`${key}=(.+)`, 'm'));
    return m ? m[1].trim() : defaultValue;
  } catch { return defaultValue; }
}

function getStatus() {
  // LLM 配置（新 LLM_* 优先，回退到旧的 MINIMAX_*）
  const llmApiKey = readEnvVar('LLM_API_KEY') || readEnvVar('MINIMAX_API_KEY');
  const llmEndpoint = readEnvVar('LLM_ENDPOINT', '');
  const llmModel = readEnvVar('LLM_MODEL') || readEnvVar('MINIMAX_LLM_MODEL', 'deepseek-chat');

  // TTS 配置（新 TTS_* 优先，回退到旧的 MINIMAX_*）
  const ttsApiKey = readEnvVar('TTS_API_KEY') || readEnvVar('MINIMAX_API_KEY');
  const ttsEndpoint = readEnvVar('TTS_ENDPOINT', '');
  const ttsModel = readEnvVar('TTS_MODEL') || readEnvVar('MINIMAX_TTS_MODEL', 'Speech-2.8-HD');
  const voiceZh = readEnvVar('TTS_VOICE_ZH') || readEnvVar('MINIMAX_VOICE_ZH', '');
  const voiceEn = readEnvVar('TTS_VOICE_EN') || readEnvVar('MINIMAX_VOICE_EN', '');

  const groupId = readEnvVar('MINIMAX_GROUP_ID', '');

  const manifest = readJSON(MANIFEST_PATH);
  const totalSounds = manifest?.sounds?.length || 0;

  let aiFactCount = 0, ttsCount = 0;
  let trackFactCount = 0, trackTtsCount = 0, trackTotalCount = 0;
  if (manifest?.sounds) {
    for (const s of manifest.sounds) {
      if (s.fun_fact_ai_generated) aiFactCount++;
      if (s.tts?.name_zh || s.tts?.name_en || s.tts?.fun_fact) ttsCount++;
      // 音频级统计
      if (Array.isArray(s.sounds)) {
        for (const tr of s.sounds) {
          trackTotalCount++;
          if (tr.fun_fact) trackFactCount++;
          if (tr.tts) trackTtsCount++;
        }
      }
    }
  }

  // 动态分类计数
  const catCounts = {};
  if (manifest?.sounds) {
    for (const s of manifest.sounds) {
      catCounts[s.category] = (catCounts[s.category] || 0) + 1;
    }
  }

  return {
    llmApiKey: llmApiKey ? '✅ 已配置' : '⚠️ 未配置',
    ttsApiKey: ttsApiKey ? '✅ 已配置' : '⚠️ 未配置',
    llmEndpoint, llmModel,
    ttsEndpoint, ttsModel,
    voiceZh, voiceEn,
    groupId,
    totalSounds, aiFactCount, ttsCount, trackFactCount, trackTtsCount, trackTotalCount, catCounts,
    version: manifest?.version || '-',
  };
}

// ============================================================
// SSE 流式输出
// ============================================================

function createSSEStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  return { send, close: () => res.end() };
}

// ============================================================
// 运行脚本
// ============================================================

function runScript(scriptName, args = [], sse) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  sse.send('status', { type: 'info', text: `▶️ node ${scriptName} ${args.join(' ')}` });

  const child = spawn('node', [scriptPath, ...args], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const text = data.toString();
    sse.send('output', { text });
    if (/生成(音频)?:/.test(text)) sse.send('status', { type: 'success', text: text.trim() });
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    sse.send('output', { text, isError: true });
    if (text.includes('❌') || text.includes('错误') || text.includes('致命'))
      sse.send('status', { type: 'error', text: text.trim() });
  });

  child.on('close', (code) => {
    if (code !== 0) sse.send('status', { type: 'error', text: `进程退出码: ${code}` });
    sse.send('done', { code });
    sse.close();
  });

  child.on('error', (err) => {
    sse.send('status', { type: 'error', text: err.message });
    sse.send('done', { code: -1 });
    sse.close();
  });
}

// ============================================================
// 路由处理
// ============================================================

async function handleAPI(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /api/status
  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatus()));
    return;
  }

  // POST /api/run — 运行脚本（SSE 流式输出）
  if (url.pathname === '/api/run' && req.method === 'POST') {
    try {
      const { script, args } = await parseBody(req);
      const allowed = ['ai-generate-fun-fact.js', 'ai-generate-tts.js', 'build-manifest.js'];
      if (!allowed.includes(script)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '不允许的脚本' }));
        return;
      }
      const safeArgs = Array.isArray(args) ? args.filter(a => typeof a === 'string' && a.length < 200) : [];
      const sse = createSSEStream(res);
      runScript(script, safeArgs, sse);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
    return;
  }

  // POST /api/save-config — 保存 .env 配置（v2：LLM/TTS 分离）
  if (url.pathname === '/api/save-config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';

      const setEnvVar = (key, val) => {
        if (val === undefined || val === null || val === '') return;
        const safe = sanitizeEnvValue(val);
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (re.test(env)) env = env.replace(re, `${key}=${safe}`);
        else env += `${env.endsWith('\n') ? '' : '\n'}${key}=${safe}\n`;
      };

      // 通用
      if (body.groupId) setEnvVar('MINIMAX_GROUP_ID', body.groupId);

      // LLM 组
      if (body.llmEndpoint) setEnvVar('LLM_ENDPOINT', body.llmEndpoint);
      if (body.llmApiKey) setEnvVar('LLM_API_KEY', body.llmApiKey);
      if (body.llmModel) setEnvVar('LLM_MODEL', body.llmModel);

      // TTS 组
      if (body.ttsEndpoint) setEnvVar('TTS_ENDPOINT', body.ttsEndpoint);
      if (body.ttsApiKey) setEnvVar('TTS_API_KEY', body.ttsApiKey);
      if (body.ttsModel) setEnvVar('TTS_MODEL', body.ttsModel);
      if (body.voiceZh) setEnvVar('TTS_VOICE_ZH', body.voiceZh);
      if (body.voiceEn) setEnvVar('TTS_VOICE_EN', body.voiceEn);

      fs.writeFileSync(ENV_PATH, env, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // DELETE /api/sound?id=animals.dog — 删除声音（连带目录）
  if (url.pathname === '/api/sound' && req.method === 'DELETE') {
    try {
      const id = url.searchParams.get('id');
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const soundDir = path.join(ROOT, 'data', 'sounds', category, name);
      if (!fs.existsSync(soundDir)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      // 安全检查：确保在 data/sounds 下
      const soundsRoot = path.join(ROOT, 'data', 'sounds');
      if (!soundDir.startsWith(soundsRoot)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '路径越界' }));
        return;
      }
      // 删除整个目录（meta.json + audio/ + generated/）
      fs.rmSync(soundDir, { recursive: true, force: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deleted: id }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/sound — 创建新声音（JSON body，音频用 base64）
  if (url.pathname === '/api/sound' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { name_zh, name_en, category, subcategory, tags, description, audioFiles } = body;

      // 参数校验
      if (!name_zh || !category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 name_zh 或 category' }));
        return;
      }
      if (!['animals', 'nature', 'transport', 'life'].includes(category)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效分类: ' + category }));
        return;
      }
      // 从 name_zh 生成 id（拼音或英文，这里用 name_en 或 name_zh 拼音简化处理）
      const nameSlug = (name_en || name_zh).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'sound_' + Date.now();
      const soundId = category + '.' + nameSlug;
      const soundDir = path.join(ROOT, 'data', 'sounds', category, nameSlug);
      if (fs.existsSync(soundDir)) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音已存在: ' + soundId }));
        return;
      }

      // 创建目录
      const audioDir = path.join(soundDir, 'audio');
      fs.mkdirSync(audioDir, { recursive: true });

      // 保存音频文件
      const sounds = [];
      if (Array.isArray(audioFiles)) {
        for (let i = 0; i < audioFiles.length; i++) {
          const af = audioFiles[i];
          if (!af.name || !af.data) continue;
          const safeName = af.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = path.join(audioDir, safeName);
          fs.writeFileSync(filePath, Buffer.from(af.data, 'base64'));
          sounds.push({ file: 'audio/' + safeName });
        }
      }

      // 创建 meta.json
      const meta = {
        id: soundId,
        name_zh,
        name_en: name_en || name_zh,
        category,
        subcategory: subcategory || '',
        emoji: body.emoji || '🔊',
        description: description || '',
        tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(/[,，、]/).map(t => t.trim()).filter(Boolean) : []),
        contributor: '声音大百科',
        sounds,
      };
      fs.writeFileSync(path.join(soundDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: soundId, path: 'data/sounds/' + category + '/' + nameSlug }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/sync-disk — 磁盘同步：清理 meta.json 无效引用 + 重建 manifest
  if (url.pathname === '/api/sync-disk' && req.method === 'POST') {
    try {
      const soundsDir = path.join(ROOT, 'data', 'sounds');
      let cleaned = 0, removed = 0;
      function scanMeta(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanMeta(full); continue; }
          if (entry.name !== 'meta.json') continue;
          let meta;
          try { meta = JSON.parse(fs.readFileSync(full, 'utf-8')); } catch { continue; }
          const metaDir = path.dirname(full);
          if (!Array.isArray(meta.sounds)) continue;
          const before = meta.sounds.length;
          const valid = meta.sounds.filter(s => {
            if (!s.file) return false;
            const abs = path.join(metaDir, s.file);
            return fs.existsSync(abs);
          });
          if (valid.length !== before) {
            meta.sounds = valid;
            fs.writeFileSync(full, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
            removed += (before - valid.length);
            cleaned++;
          }
        }
      }
      scanMeta(soundsDir);

      // 重建 manifest
      const { spawn } = require('child_process');
      await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(SCRIPTS_DIR, 'build-manifest.js')], { cwd: ROOT });
        child.on('close', resolve);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cleaned, removed }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // PUT /api/sound-meta — 更新 meta.json（声音级 + 音频级文案/标签）
  if (url.pathname === '/api/sound-meta' && req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { id, fields, soundFields } = body;
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const metaPath = path.join(ROOT, 'data', 'sounds', category, name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

      // 更新声音级字段
      if (fields && typeof fields === 'object') {
        for (const [k, v] of Object.entries(fields)) {
          if (['name_zh','name_en','emoji','description','fun_fact','tags','subcategory'].includes(k)) {
            meta[k] = v;
          }
        }
      }

      // 更新音频级字段（soundFields: [{ index, label, fun_fact }])
      if (Array.isArray(soundFields) && Array.isArray(meta.sounds)) {
        for (const sf of soundFields) {
          if (typeof sf.index !== 'number' || sf.index < 0 || sf.index >= meta.sounds.length) continue;
          if (sf.label !== undefined) meta.sounds[sf.index].label = sf.label;
          if (sf.fun_fact !== undefined) meta.sounds[sf.index].fun_fact = sf.fun_fact;
        }
      }

      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

      // 重建 manifest
      const { spawn } = require('child_process');
      await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(SCRIPTS_DIR, 'build-manifest.js')], { cwd: ROOT });
        child.on('close', resolve);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET /api/sound-detail?id=xxx — 获取声音详情（含每个音频的文案）
  if (url.pathname === '/api/sound-detail' && req.method === 'GET') {
    try {
      const id = url.searchParams.get('id');
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const metaPath = path.join(ROOT, 'data', 'sounds', category, name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      // 为每个音频补充文件相对路径（供前端 <audio> 使用）
      const metaDir = 'data/sounds/' + category + '/' + name;
      if (Array.isArray(meta.sounds)) {
        meta.sounds = meta.sounds.map(s => ({
          ...s,
          fileUrl: metaDir + '/' + s.file.replace(/^audio\//, 'audio/'),
          ttsUrl: s.tts ? (metaDir + '/' + s.tts.replace(/^generated\//, 'generated/')) : null,
        }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meta));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/track-generate-fact — 单条音频 LLM 生成文案
  // body: { id, trackIndex }
  if (url.pathname === '/api/track-generate-fact' && req.method === 'POST') {
    try {
      const { id, trackIndex } = await parseBody(req);
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const metaPath = path.join(ROOT, 'data', 'sounds', category, name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (!Array.isArray(meta.sounds) || trackIndex < 0 || trackIndex >= meta.sounds.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的音频索引' }));
        return;
      }
      const track = meta.sounds[trackIndex];
      const fileName = track.file.split('/').pop().replace(/\.[^.]+$/, '');

      // 构造 LLM prompt：结合声音信息和音频文件名
      const { loadEnv, callLLM, getLLMConfig } = require('./lib/minimax');
      loadEnv();
      const llmCfg = getLLMConfig();
      if (!llmCfg.apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未配置 LLM_API_KEY' }));
        return;
      }

      const prompt = [
        '你是一位儿童科普作家，擅长为 1-6 岁儿童撰写简短、有趣、准确的科普小知识。',
        '请根据以下信息，为这一条具体的音频写一段 20-40 字的中文科普文案。',
        '',
        '要求：',
        '- 只陈述科学事实，不编造；',
        '- 语言口语化、有画面感，孩子能听懂；',
        '- 结合音频的标签/描述（如有）突出这个具体音频的特点；',
        '- 不输出任何解释、标题或多余内容，只返回一段文案。',
        '',
        `声音：中文名=${meta.name_zh}，英文名=${meta.name_en}，分类=${meta.category}`,
        `声音标签：${(meta.tags || []).join('、') || '无'}`,
        `声音描述：${meta.description || '无'}`,
        `当前音频文件名：${fileName}`,
        `当前音频标签：${track.label || '无'}`,
        `声音级科普（参考）：${meta.fun_fact || '无'}`,
      ].join('\n');

      const text = await callLLM([{ role: 'user', content: prompt }], { temperature: 0.8, maxTokens: 150 });

      // 保存到 meta.json
      meta.sounds[trackIndex].fun_fact = text;
      meta.sounds[trackIndex].fun_fact_ai_generated = true;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, fun_fact: text }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/track-generate-tts — 单条音频生成朗读音频
  // body: { id, trackIndex }
  if (url.pathname === '/api/track-generate-tts' && req.method === 'POST') {
    try {
      const { id, trackIndex } = await parseBody(req);
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const metaPath = path.join(ROOT, 'data', 'sounds', category, name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (!Array.isArray(meta.sounds) || trackIndex < 0 || trackIndex >= meta.sounds.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的音频索引' }));
        return;
      }
      const track = meta.sounds[trackIndex];
      const text = track.fun_fact || meta.fun_fact;
      if (!text || !text.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '该音频没有文案，请先生成或填写文案' }));
        return;
      }

      const { loadEnv, generateAndSaveSpeech, getTTSConfig } = require('./lib/minimax');
      loadEnv();
      const ttsCfg = getTTSConfig();
      if (!ttsCfg.apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未配置 TTS_API_KEY' }));
        return;
      }

      // 生成 TTS 到 generated/ 目录
      const soundDir = path.join(ROOT, 'data', 'sounds', category, name);
      const generatedDir = path.join(soundDir, 'generated');
      const ttsFileName = `track-${trackIndex}-tts.mp3`;
      await generateAndSaveSpeech(text, generatedDir, ttsFileName, 'zh-fact');

      // 更新 meta.json
      meta.sounds[trackIndex].tts = 'generated/' + ttsFileName;
      meta.sounds[trackIndex].tts_generated_at = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, tts: 'generated/' + ttsFileName }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // PUT /api/track-update — 更新单条音频的 label/fun_fact/tags
  // body: { id, trackIndex, label, fun_fact, tags }
  if (url.pathname === '/api/track-update' && req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { id, trackIndex, label, fun_fact, tags } = body;
      if (!id || !/^[a-z]+\.[a-z_]+$/.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的声音 ID' }));
        return;
      }
      const dotIdx = id.indexOf('.');
      const category = id.slice(0, dotIdx);
      const name = id.slice(dotIdx + 1);
      const metaPath = path.join(ROOT, 'data', 'sounds', category, name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '声音不存在' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (!Array.isArray(meta.sounds) || trackIndex < 0 || trackIndex >= meta.sounds.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的音频索引' }));
        return;
      }

      if (label !== undefined) meta.sounds[trackIndex].label = label;
      if (fun_fact !== undefined) {
        meta.sounds[trackIndex].fun_fact = fun_fact;
        meta.sounds[trackIndex].fun_fact_ai_generated = false; // 手动编辑后标记为非 AI
      }
      if (tags !== undefined) {
        meta.sounds[trackIndex].tags = Array.isArray(tags) ? tags : String(tags).split(/[,，、]/).map(t => t.trim()).filter(Boolean);
      }

      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
}

// ============================================================
// 管理界面 HTML
// ============================================================

function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🔊 声音大百科 · API 管理</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; background: #f5f0eb; color: #3E2723; padding: 24px; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  h2 { font-size: 1rem; color: #795548; margin-bottom: 16px; }

  .card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }

  .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat { text-align: center; padding: 12px; background: #FFF8E1; border-radius: 12px; }
  .stat .val { font-size: 1.8rem; font-weight: 900; color: #FF9800; }
  .stat .lbl { font-size: 0.75rem; color: #795548; margin-top: 4px; }
  .stat.success { background: #E8F5E9; }
  .stat.success .val { color: #43A047; }
  .stat.warn { background: #FFF3E0; }
  .stat.warn .val { color: #E65100; }

  .api-status { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 600; padding: 8px 16px; border-radius: 20px; margin-bottom: 12px; }
  .api-status.ok { background: #E8F5E9; color: #2E7D32; }
  .api-status.warn { background: #FFEBEE; color: #C62828; }

  .key-form { display: flex; gap: 8px; margin-top: 12px; }
  .key-form input { flex: 1; padding: 10px 14px; border: 2px solid #E0E0E0; border-radius: 10px; font-size: 0.85rem; outline: none; font-family: monospace; }
  .key-form input:focus { border-color: #FF9800; }

  .btn { padding: 10px 20px; border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .btn-primary { background: #FF9800; color: #fff; }
  .btn-primary:hover { background: #E65100; }
  .btn-outline { background: #fff; color: #FF9800; border: 2px solid #FF9800; }
  .btn-outline:hover { background: #FFF3E0; }
  .btn-sm { padding: 6px 14px; font-size: 0.8rem; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .action-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; align-items: center; }
  .target-select { padding: 8px 12px; border: 2px solid #E0E0E0; border-radius: 10px; font-size: 0.85rem; }

  .terminal { background: #1E1E1E; color: #D4D4D4; border-radius: 12px; padding: 16px; font-family: 'SF Mono', 'Monaco', monospace; font-size: 0.75rem; max-height: 400px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; }
  .terminal .error { color: #F44747; }
  .terminal .success { color: #6A9955; }
  .terminal .info { color: #569CD6; }
</style>
</head>
<body>

<div id="app">
  <h1>🔊 声音大百科 · API 管理</h1>
  <h2>本地 AI 内容生成控制面板（仅 127.0.0.1）</h2>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <div class="api-status" id="api-status">加载中...</div>
        <div style="font-size:0.8rem;color:#795548">
          版本: <span id="ver">-</span> &nbsp;|&nbsp;
          Group ID: <span id="group-id" style="font-family:monospace">-</span>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="refreshStatus()">🔄 刷新</button>
    </div>
    <div class="key-form" style="margin-top:8px;display:grid;grid-template-columns:1fr;gap:8px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">🆔 Group ID（通用）</label>
        <input type="text" id="group-id-input" placeholder="如：2018549330264199533" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
      </div>
    </div>
  </div>

  <!-- LLM 配置卡片 -->
  <div class="card">
    <h2 style="margin-bottom:8px">🤖 LLM 文本模型配置</h2>
    <div style="font-size:0.75rem;color:#795548;margin-bottom:8px">用于生成儿童科普文案（fun_fact）</div>
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">🔗 Endpoint URL</label>
        <input type="text" id="llm-endpoint-input" placeholder="https://api.minimax.io/v1/chat/completions" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">🔑 API Key</label>
        <input type="password" id="llm-api-key-input" placeholder="LLM_API_KEY（留空则不修改）" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">📦 模型 ID</label>
        <select id="llm-model-input" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none">
          <option value="deepseek-chat">deepseek-chat（推荐，DeepSeek 出品）</option>
          <option value="deepseek-reasoner">deepseek-reasoner（DeepSeek 推理模型）</option>
          <option value="abab6.5s-chat">abab6.5s-chat（MiniMax 轻量快速）</option>
          <option value="abab6.5-chat">abab6.5-chat（MiniMax 更强推理）</option>
          <option value="MiniMax-M1">MiniMax-M1（MiniMax 最新）</option>
        </select>
      </div>
    </div>
  </div>

  <!-- TTS 配置卡片 -->
  <div class="card">
    <h2 style="margin-bottom:8px">🔊 TTS 语音合成模型配置</h2>
    <div style="font-size:0.75rem;color:#795548;margin-bottom:8px">用于生成中文名 / 英文名 / 科普朗读音频</div>
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">🔗 Endpoint URL</label>
        <input type="text" id="tts-endpoint-input" placeholder="https://api.minimax.io/v1/t2a_v2" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:0.7rem;font-weight:700;color:#795548">🔑 API Key</label>
        <input type="password" id="tts-api-key-input" placeholder="TTS_API_KEY（留空则不修改）" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.7rem;font-weight:700;color:#795548">📦 模型 ID</label>
          <select id="tts-model-input" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none">
            <option value="Speech-2.8-HD">Speech-2.8-HD（推荐，高清）</option>
            <option value="speech-02">speech-02（高质量）</option>
            <option value="speech-01-turbo">speech-01-turbo（轻量快速）</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.7rem;font-weight:700;color:#795548">🎙️ 中文音色</label>
          <input type="text" id="voice-zh-input" placeholder="如：female-tianmei" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.7rem;font-weight:700;color:#795548">🎙️ 英文音色</label>
          <input type="text" id="voice-en-input" placeholder="如：male-qn-qingse" style="padding:8px 10px;border:2px solid #E0E0E0;border-radius:10px;font-size:0.8rem;font-family:monospace;outline:none" />
        </div>
      </div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary" onclick="saveConfig()">💾 保存所有配置</button>
    </div>
  </div>

  <div class="row status-grid">
    <div class="stat"><div class="val" id="st-total">-</div><div class="lbl">声音总数</div></div>
    <div class="stat success"><div class="val" id="st-ai">-</div><div class="lbl">🤖 声音级文案</div></div>
    <div class="stat success"><div class="val" id="st-tts">-</div><div class="lbl">🔊 声音级TTS</div></div>
    <div class="stat"><div class="val" id="st-track-fact">-</div><div class="lbl">🎵 音频级文案</div></div>
    <div class="stat"><div class="val" id="st-track-tts">-</div><div class="lbl">🎵 音频级TTS</div></div>
    <div class="stat warn"><div class="val" id="st-todo">-</div><div class="lbl">待处理</div></div>
  </div>

  <div class="card">
    <h2 style="margin-bottom:8px">🤖 AI 批量生成</h2>
    
    <!-- 目标选择 -->
    <div class="action-row">
      <select class="target-select" id="target-cat" onchange="onTargetChange()">
        <option value="all">全部声音</option>
        <option value="animals">🐾 动物</option>
        <option value="nature">🌳 自然</option>
        <option value="transport">🚗 交通</option>
        <option value="life">🏠 生活</option>
      </select>
      <select class="target-select" id="target-sound" style="display:none">
        <option value="">选择具体声音...</option>
      </select>
      <label style="font-size:0.75rem;color:#795548;display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="opt-force" /> 强制重新生成（覆盖已有）
      </label>
      <label style="font-size:0.75rem;color:#795548;display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="opt-trackfact" checked /> 含音频级文案
      </label>
      <label style="font-size:0.75rem;color:#795548;display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="opt-tracktts" checked /> 含音频级朗读
      </label>
    </div>

    <!-- 预览目标 -->
    <div id="batch-preview" style="font-size:0.75rem;color:#555;background:#FFF8E1;padding:8px 12px;border-radius:8px;margin:8px 0">
      将对 <b id="batch-count">-</b> 个声音执行操作
    </div>

    <!-- 操作按钮 -->
    <div class="action-row">
      <button class="btn btn-primary" id="btn-fact" onclick="batchGenerate('fact')">📝 生成科普文案</button>
      <button class="btn btn-primary" id="btn-tts" onclick="batchGenerate('tts')">🔊 生成 TTS 朗读</button>
      <button class="btn btn-outline" id="btn-build" onclick="runScript('build-manifest.js', [])">📦 重建 Manifest</button>
    </div>
    <div class="action-row">
      <button class="btn btn-outline" style="background:#E65100;color:#fff" onclick="runFullPipeline()">🚀 一键全流程</button>
      <span style="font-size:0.75rem;color:#795548">文案 + TTS + 构建</span>
    </div>

    <!-- 实时进度条 -->
    <div id="batch-progress" style="display:none;margin-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#795548;margin-bottom:4px">
        <span id="batch-progress-label">处理中...</span>
        <span id="batch-progress-count">0/0</span>
      </div>
      <div style="background:#E0E0E0;border-radius:8px;height:8px;overflow:hidden">
        <div id="batch-progress-bar" style="background:#FF9800;height:100%;width:0%;transition:width 0.3s"></div>
      </div>
    </div>
  </div>

  <!-- 声音管理面板 -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h2 style="margin:0">🗂️ 声音管理</h2>
      <div style="display:flex;gap:8px">
        <input type="text" id="sound-search" placeholder="搜索声音..." oninput="renderSoundList()" style="padding:6px 10px;border:2px solid #E0E0E0;border-radius:8px;font-size:0.8rem;width:180px" />
        <button class="btn btn-outline btn-sm" onclick="syncDisk()" title="扫描磁盘，清理无效引用">🔄 同步磁盘</button>
        <button class="btn btn-primary btn-sm" onclick="showAddForm()">➕ 添加声音</button>
      </div>
    </div>
    <div id="sound-list" style="max-height:400px;overflow-y:auto;border:1px solid #E0E0E0;border-radius:8px"></div>
  </div>

  <!-- 添加声音表单（默认隐藏） -->
  <div class="card" id="add-form" style="display:none">
    <h2 style="margin-bottom:8px">➕ 添加新声音</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label style="font-size:0.7rem;font-weight:700;color:#795548">中文名 *</label><input type="text" id="new-name-zh" placeholder="如：小狗" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px" /></div>
      <div><label style="font-size:0.7rem;font-weight:700;color:#795548">英文名</label><input type="text" id="new-name-en" placeholder="如：puppy" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px" /></div>
      <div>
        <label style="font-size:0.7rem;font-weight:700;color:#795548">分类 *</label>
        <select id="new-category" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px">
          <option value="animals">🐾 动物</option>
          <option value="nature">🌳 自然</option>
          <option value="transport">🚗 交通</option>
          <option value="life">🏠 生活</option>
        </select>
      </div>
      <div><label style="font-size:0.7rem;font-weight:700;color:#795548">Emoji</label><input type="text" id="new-emoji" placeholder="🔊" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px" /></div>
    </div>
    <div style="margin-top:8px"><label style="font-size:0.7rem;font-weight:700;color:#795548">标签（逗号分隔）</label><input type="text" id="new-tags" placeholder="如：哺乳动物,宠物" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px" /></div>
    <div style="margin-top:8px"><label style="font-size:0.7rem;font-weight:700;color:#795548">描述</label><input type="text" id="new-desc" placeholder="简短描述" style="width:100%;padding:8px;border:2px solid #E0E0E0;border-radius:8px" /></div>
    <div style="margin-top:8px">
      <label style="font-size:0.7rem;font-weight:700;color:#795548">音频文件（可多选）</label>
      <input type="file" id="new-audio" accept=".mp3,.wav" multiple style="width:100%;padding:8px" />
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-primary" onclick="createSound()">✅ 创建</button>
      <button class="btn btn-outline" onclick="document.getElementById('add-form').style.display='none'">取消</button>
    </div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h2 style="margin:0">🖥️ 终端输出</h2>
      <button class="btn btn-outline btn-sm" onclick="clearTerminal()">清空</button>
    </div>
    <div class="terminal" id="terminal">等待指令...</div>
  </div>
</div>

<script>
  let soundList = [];

  async function refreshStatus() {
    try {
      const res = await fetch('/api/status');
      const s = await res.json();
      // 状态徽章：LLM 和 TTS 都已配置才算 OK
      const llmOk = s.llmApiKey === '✅ 已配置';
      const ttsOk = s.ttsApiKey === '✅ 已配置';
      const allOk = llmOk && ttsOk;
      const badge = document.getElementById('api-status');
      badge.textContent = allOk ? '✅ LLM + TTS 已配置' : ('⚠️ LLM ' + (llmOk ? '✅' : '❌') + ' / TTS ' + (ttsOk ? '✅' : '❌'));
      badge.className = 'api-status ' + (allOk ? 'ok' : 'warn');

      document.getElementById('ver').textContent = s.version;
      document.getElementById('group-id').textContent = s.groupId ? s.groupId.slice(0,8) + '...' : '未配置';

      document.getElementById('st-total').textContent = s.totalSounds;
      document.getElementById('st-ai').textContent = s.aiFactCount;
      document.getElementById('st-tts').textContent = s.ttsCount;
      document.getElementById('st-track-fact').textContent = s.trackFactCount + '/' + s.trackTotalCount;
      document.getElementById('st-track-tts').textContent = s.trackTtsCount + '/' + s.trackTotalCount;
      document.getElementById('st-todo').textContent = s.trackTotalCount - s.trackFactCount;

      // 回填配置表单
      document.getElementById('group-id-input').value = s.groupId || '';
      document.getElementById('llm-endpoint-input').value = s.llmEndpoint || '';
      document.getElementById('llm-model-input').value = s.llmModel || 'deepseek-chat';
      document.getElementById('tts-endpoint-input').value = s.ttsEndpoint || '';
      document.getElementById('tts-model-input').value = s.ttsModel || 'Speech-2.8-HD';
      document.getElementById('voice-zh-input').value = s.voiceZh || '';
      document.getElementById('voice-en-input').value = s.voiceEn || '';
      // API Key 输入框留空（不回填明文 key）

      // 动态更新分类计数
      const catSel = document.getElementById('target-cat');
      const cats = { all: '全部', animals: '🐾 动物', nature: '🌳 自然', transport: '🚗 交通', life: '🏠 生活' };
      for (const [id, label] of Object.entries(cats)) {
        const opt = catSel.querySelector('option[value="' + id + '"]');
        if (opt) {
          const count = id === 'all' ? s.totalSounds : (s.catCounts?.[id] || 0);
          opt.textContent = label + ' (' + count + ')';
        }
      }

      // Load manifest for sound selector
      const mf = await fetch('/data/manifest.json').then(r => r.json());
      soundList = mf.sounds || [];
      renderSoundList();
      updateBatchPreview();
    } catch(e) {}
  }

  async function saveConfig() {
    const body = {
      groupId: document.getElementById('group-id-input').value.trim() || undefined,
      llmEndpoint: document.getElementById('llm-endpoint-input').value.trim() || undefined,
      llmApiKey: document.getElementById('llm-api-key-input').value.trim() || undefined,
      llmModel: document.getElementById('llm-model-input').value || undefined,
      ttsEndpoint: document.getElementById('tts-endpoint-input').value.trim() || undefined,
      ttsApiKey: document.getElementById('tts-api-key-input').value.trim() || undefined,
      ttsModel: document.getElementById('tts-model-input').value || undefined,
      voiceZh: document.getElementById('voice-zh-input').value.trim() || undefined,
      voiceEn: document.getElementById('voice-en-input').value.trim() || undefined,
    };
    await fetch('/api/save-config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    // 清空 key 输入框（不保留明文）
    document.getElementById('llm-api-key-input').value = '';
    document.getElementById('tts-api-key-input').value = '';
    refreshStatus();
    log('✅ 配置已保存', 'success');
  }

  function onTargetChange() {
    const cat = document.getElementById('target-cat').value;
    const sel = document.getElementById('target-sound');
    sel.style.display = cat === 'all' ? 'none' : 'block';
    sel.innerHTML = '<option value="">选择具体声音...</option>' + soundList
      .filter(s => cat === 'all' || s.category === cat)
      .map(s => '<option value="' + s.id + '">' + s.emoji + ' ' + s.name_zh + ' (' + s.id + ')</option>')
      .join('');
    updateBatchPreview();
  }

  function getAllArgs() {
    const cat = document.getElementById('target-cat').value;
    const sound = document.getElementById('target-sound').value;
    const args = [];
    if (sound) args.push('--id', sound);
    else if (cat !== 'all') args.push('--category', cat);
    if (document.getElementById('opt-force').checked) args.push('--force');
    return args;
  }

  // 更新批量操作预览（显示将影响多少个声音）
  function updateBatchPreview() {
    const cat = document.getElementById('target-cat').value;
    const sound = document.getElementById('target-sound').value;
    let count = 0;
    let label = '';
    if (sound) {
      count = 1;
      label = sound;
    } else if (cat === 'all') {
      count = soundList.length;
      label = '全部声音';
    } else {
      count = soundList.filter(s => s.category === cat).length;
      label = cat;
    }
    document.getElementById('batch-count').textContent = count;
    document.getElementById('batch-preview').innerHTML = '将对 <b>' + count + '</b> 个声音执行操作' + (label ? '（' + esc(label) + '）' : '');
  }

  // 批量生成（带实时进度 + 完成后自动刷新声音列表）
  async function batchGenerate(type) {
    const args = getAllArgs();
    const script = type === 'fact' ? 'ai-generate-fun-fact.js' : 'ai-generate-tts.js';
    const label = type === 'fact' ? '科普文案' : 'TTS 朗读';
    
    // 显示进度条
    const progDiv = document.getElementById('batch-progress');
    const progBar = document.getElementById('batch-progress-bar');
    const progLabel = document.getElementById('batch-progress-label');
    const progCount = document.getElementById('batch-progress-count');
    progDiv.style.display = 'block';
    progBar.style.width = '0%';
    progLabel.textContent = '正在生成' + label + '...';
    
    setButtons(false);
    clearTerminal();
    log('▶️ 批量生成' + label + ': node scripts/' + script + ' ' + args.join(' ') + '\\n', 'info');

    // 计算总数用于进度条
    const cat = document.getElementById('target-cat').value;
    const sound = document.getElementById('target-sound').value;
    const total = sound ? 1 : (cat === 'all' ? soundList.length : soundList.filter(s => s.category === cat).length);
    let processed = 0;

    const res = await fetch('/api/run', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ script, args })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('event:done')) { buffer=''; break; }
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5));
            if (data.text) {
              log(data.text, data.isError ? 'error' : '');
              // 解析进度：每遇到 "🤖 xxx（yyy）..." 或 "🎙️ xxx →" 算一条
              if (data.text.includes('🤖 ') || data.text.includes('🎙️ ')) {
                processed++;
                const pct = Math.min(100, Math.round(processed / total * 100));
                progBar.style.width = pct + '%';
                progCount.textContent = processed + '/' + total;
              }
              // 成功标记
              if (data.text.includes('✅') && data.text.includes('已写入')) {
                progLabel.textContent = '写入成功...';
              }
            }
          } catch(e) {}
        }
      }
    }

    // 完成
    progBar.style.width = '100%';
    progLabel.textContent = '✅ 完成';
    progCount.textContent = total + '/' + total;
    
    // 自动重建 manifest
    log('\\n📦 自动重建 Manifest...\\n', 'info');
    await runSSE('build-manifest.js', []);
    
    setButtons(true);
    log('\\n✅ ' + label + '批量生成完成，manifest 已重建\\n', 'success');
    
    // 自动刷新声音列表 + 统计
    await refreshStatus();
    renderSoundList();
    
    // 3 秒后隐藏进度条
    setTimeout(() => { progDiv.style.display = 'none'; }, 3000);
  }

  function log(text, className) {
    const term = document.getElementById('terminal');
    const span = document.createElement('span');
    span.className = className || '';
    span.textContent = text;
    term.appendChild(span);
    term.scrollTop = term.scrollHeight;
  }

  function clearTerminal() {
    document.getElementById('terminal').innerHTML = '';
  }

  // ===== 声音管理 =====

  function renderSoundList() {
    const q = (document.getElementById('sound-search').value || '').toLowerCase();
    const list = soundList.filter(s => !q || (s.name_zh||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q) || (s.name_en||'').toLowerCase().includes(q));
    const html = list.map(s => {
      const hasFact = s.fun_fact ? '✅' : '⬜';
      const hasTts = (s.tts && (s.tts.name_zh || s.tts.fun_fact)) ? '✅' : '⬜';
      const audioCount = (s.sounds || []).length;
      // 音频级统计
      const tracksWithFact = (s.sounds || []).filter(tr => tr.fun_fact).length;
      const tracksWithTts = (s.sounds || []).filter(tr => tr.tts).length;
      const trackFactBadge = tracksWithFact === audioCount ? '✅' : (tracksWithFact > 0 ? '🔶' : '⬜');
      const trackTtsBadge = tracksWithTts === audioCount ? '✅' : (tracksWithTts > 0 ? '🔶' : '⬜');
      const mismatch = audioCount > 0 && (tracksWithFact !== audioCount || tracksWithTts !== audioCount);
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #f0f0f0">' +
        '<span style="font-size:1.2rem">' + (s.emoji || '🔊') + '</span>' +
        '<div style="flex:1;min-width:0;cursor:pointer" onclick="toggleDetail(\\''+s.id+'\\')">' +
          '<div style="font-weight:600;font-size:0.85rem">' + esc(s.name_zh) + ' <span style="color:#999;font-size:0.75rem">' + esc(s.id) + '</span>' + (mismatch ? ' <span style="color:#E65100;font-size:0.7rem">⚠️未配齐</span>' : '') + '</div>' +
          '<div style="font-size:0.7rem;color:#999">音频 ' + audioCount + ' | 通用文案 ' + hasFact + ' TTS ' + hasTts + ' | 音频级文案 ' + trackFactBadge + ' ' + tracksWithFact + '/' + audioCount + ' TTS ' + trackTtsBadge + ' ' + tracksWithTts + '/' + audioCount + ' | ▾</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" onclick="regenOne(\\''+s.id+'\\',\\'fact\\')" title="重新生成文案">📝</button>' +
        '<button class="btn btn-outline btn-sm" onclick="regenOne(\\''+s.id+'\\',\\'tts\\')" title="重新生成TTS">🔊</button>' +
        '<button class="btn btn-outline btn-sm" style="color:#d32f2f;border-color:#d32f2f" onclick="deleteSound(\\''+s.id+'\\')" title="删除">🗑️</button>' +
      '</div>' +
      '<div id="detail-'+s.id+'" style="display:none;padding:8px 12px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0"></div>';
    }).join('');
    document.getElementById('sound-list').innerHTML = html || '<div style="padding:16px;text-align:center;color:#999">没有匹配的声音</div>';
  }

  async function toggleDetail(id) {
    const el = document.getElementById('detail-' + id);
    if (el.style.display === 'none') {
      el.style.display = 'block';
      el.innerHTML = '<div style="text-align:center;color:#999;padding:8px">加载中...</div>';
      try {
        const r = await fetch('/api/sound-detail?id=' + encodeURIComponent(id));
        const meta = await r.json();
        let html = '<div style="font-size:0.75rem;color:#795548;margin-bottom:8px">✏️ 「' + esc(meta.name_zh) + '」声音级设置</div>';

        // 声音级文案 + 标签（紧凑一行）
        html += '<div style="display:grid;grid-template-columns:1fr 200px;gap:8px;margin-bottom:12px">' +
          '<div><label style="font-size:0.7rem;font-weight:700;color:#795548">声音级科普文案</label>' +
            '<textarea id="meta-fact-'+id+'" style="width:100%;min-height:50px;padding:6px;border:2px solid #E0E0E0;border-radius:6px;font-size:0.8rem" placeholder="为这个声音写一段科普...">'+esc(meta.fun_fact||'')+'</textarea></div>' +
          '<div><label style="font-size:0.7rem;font-weight:700;color:#795548">标签（逗号分隔）</label>' +
            '<input type="text" id="meta-tags-'+id+'" value="'+esc((meta.tags||[]).join(', '))+'" style="width:100%;padding:6px;border:2px solid #E0E0E0;border-radius:6px;font-size:0.8rem" /></div>' +
        '</div>';

        // 每个音频一个完整卡片
        if (meta.sounds && meta.sounds.length > 0) {
          html += '<div style="font-size:0.75rem;color:#795548;margin:12px 0 6px">🎵 独立音频管理（' + meta.sounds.length + ' 条）</div>';
          meta.sounds.forEach((snd, i) => {
            const fname = snd.file.split('/').pop();
            const fileUrl = snd.fileUrl || ('/data/sounds/' + id.replace('.', '/') + '/' + snd.file);
            const ttsUrl = snd.ttsUrl || (snd.tts ? ('/data/sounds/' + id.replace('.', '/') + '/' + snd.tts) : null);
            const aiBadge = snd.fun_fact_ai_generated ? '🤖 ' : '✏️ ';
            html += '<div style="margin-bottom:10px;padding:10px;background:#fff;border:1px solid #E0E0E0;border-radius:8px">' +
              // 第一行：序号 + 文件名 + 播放器
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
                '<span style="font-size:0.7rem;color:#999;font-weight:700;min-width:24px">#'+(i+1)+'</span>' +
                '<span style="font-size:0.75rem;color:#555;font-family:monospace">📂 ' + esc(fname) + '</span>' +
                '<audio controls preload="none" src="' + fileUrl + '" style="height:28px;flex:1;min-width:200px"></audio>' +
              '</div>' +
              // 第二行：label + tags
              '<div style="display:grid;grid-template-columns:120px 1fr;gap:8px;margin-bottom:6px">' +
                '<div><label style="font-size:0.65rem;color:#999">标签</label>' +
                  '<input type="text" id="snd-label-'+id+'-'+i+'" value="'+esc(snd.label||'')+'" placeholder="如：撒娇" style="width:100%;padding:4px 6px;border:1px solid #E0E0E0;border-radius:4px;font-size:0.75rem" oninput="markTrackDirty(\\''+id+'\\','+i+')" /></div>' +
                '<div><label style="font-size:0.65rem;color:#999">分类标签（逗号分隔）</label>' +
                  '<input type="text" id="snd-tags-'+id+'-'+i+'" value="'+esc((snd.tags||[]).join(', '))+'" placeholder="如：柔软, 高频" style="width:100%;padding:4px 6px;border:1px solid #E0E0E0;border-radius:4px;font-size:0.75rem" oninput="markTrackDirty(\\''+id+'\\','+i+')" /></div>' +
              '</div>' +
              // 第三行：文案 + 操作按钮
              '<div style="display:flex;gap:8px;align-items:flex-start">' +
                '<div style="flex:1"><label style="font-size:0.65rem;color:#999">专属文案 ' + (snd.fun_fact_ai_generated ? '(🤖 AI)' : (snd.fun_fact ? '(✏️ 手动)' : '')) + '</label>' +
                  '<textarea id="snd-fact-'+id+'-'+i+'" style="width:100%;min-height:50px;padding:6px;border:1px solid #E0E0E0;border-radius:4px;font-size:0.78rem" placeholder="这个音频的专属文案..." oninput="markTrackDirty(\\''+id+'\\','+i+')">'+esc(snd.fun_fact||'')+'</textarea></div>' +
                '<div style="display:flex;flex-direction:column;gap:4px">' +
                  '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:4px 8px" onclick="genTrackFact(\\''+id+'\\','+i+')" title="用 LLM 生成文案">🤖 LLM生成</button>' +
                  '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:4px 8px" onclick="saveTrack(\\''+id+'\\','+i+')" title="保存这条">💾 保存</button>' +
                  '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:4px 8px;background:#E3F2FD;border-color:#2196F3;color:#1565C0" onclick="genTrackTTS(\\''+id+'\\','+i+')" title="生成朗读音频">🔊 生成朗读</button>' +
                '</div>' +
              '</div>' +
              // 第四行：TTS 播放器（如果有）
              '<div id="snd-tts-'+id+'-'+i+'" style="margin-top:6px;display:'+(ttsUrl?'flex':'none')+';align-items:center;gap:8px">' +
                '<span style="font-size:0.7rem;color:#43A047">🔊 朗读音频:</span>' +
                '<audio controls preload="none" src="' + (ttsUrl||'') + '" style="height:24px;flex:1"></audio>' +
              '</div>' +
            '</div>';
          });
        }

        // 底部：保存声音级 + 重建 manifest
        html += '<div style="margin-top:8px;display:flex;gap:8px">' +
          '<button class="btn btn-primary btn-sm" onclick="saveMeta(\\''+id+'\\','+(meta.sounds?meta.sounds.length:0)+')">💾 保存声音级设置</button>' +
          '<button class="btn btn-outline btn-sm" onclick="runSSE(\\'build-manifest.js\\',[])">📦 重建 Manifest</button>' +
        '</div>';
        el.innerHTML = html;
      } catch(e) {
        el.innerHTML = '<div style="color:#d32f2f;padding:8px">加载失败: ' + esc(e.message) + '</div>';
      }
    } else {
      el.style.display = 'none';
    }
  }

  // 标记某条音频为已修改（未保存）
  function markTrackDirty(id, idx) {
    const el = document.getElementById('snd-label-'+id+'-'+idx);
    if (el) el.style.borderColor = '#FF9800';
  }

  // 单条音频 LLM 生成文案
  async function genTrackFact(id, idx) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ 生成中...';
    log('🤖 为 ' + id + ' #' + (idx+1) + ' 生成文案...\\n', 'info');
    try {
      const r = await fetch('/api/track-generate-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, trackIndex: idx })
      });
      const j = await r.json();
      if (j.ok) {
        const ta = document.getElementById('snd-fact-'+id+'-'+idx);
        if (ta) ta.value = j.fun_fact;
        log('✅ 文案: ' + j.fun_fact + '\\n', 'success');
        await refreshStatus();      // 刷新顶部统计
        renderSoundList();           // 刷新列表状态标记
      } else {
        alert('生成失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('生成失败: ' + e.message); }
    btn.disabled = false;
    btn.textContent = '🤖 LLM生成';
  }

  // 单条音频保存（label + fun_fact + tags）
  async function saveTrack(id, idx) {
    const label = document.getElementById('snd-label-'+id+'-'+idx).value;
    const fact = document.getElementById('snd-fact-'+id+'-'+idx).value;
    const tags = document.getElementById('snd-tags-'+id+'-'+idx).value;
    log('💾 保存 ' + id + ' #' + (idx+1) + '...\\n', 'info');
    try {
      const r = await fetch('/api/track-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, trackIndex: idx, label, fun_fact: fact, tags })
      });
      const j = await r.json();
      if (j.ok) {
        log('✅ 已保存\\n', 'success');
        const el = document.getElementById('snd-label-'+id+'-'+idx);
        if (el) el.style.borderColor = '#E0E0E0';
        await refreshStatus();
        renderSoundList();
      } else {
        alert('保存失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('保存失败: ' + e.message); }
  }

  // 单条音频生成朗读 TTS
  async function genTrackTTS(id, idx) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ 朗读中...';
    log('🔊 为 ' + id + ' #' + (idx+1) + ' 生成朗读音频...\\n', 'info');
    try {
      const r = await fetch('/api/track-generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, trackIndex: idx })
      });
      const j = await r.json();
      if (j.ok) {
        log('✅ 朗读音频已生成: ' + j.tts + '\\n', 'success');
        const ttsDiv = document.getElementById('snd-tts-'+id+'-'+idx);
        const ttsUrl = '/data/sounds/' + id.replace('.', '/') + '/' + j.tts;
        ttsDiv.innerHTML = '<span style="font-size:0.7rem;color:#43A047">🔊 朗读音频:</span><audio controls preload="none" src="' + ttsUrl + '" style="height:24px;flex:1"></audio>';
        ttsDiv.style.display = 'flex';
        await refreshStatus();      // 刷新顶部统计
        renderSoundList();           // 刷新列表状态标记
      } else {
        alert('生成失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('生成失败: ' + e.message); }
    btn.disabled = false;
    btn.textContent = '🔊 生成朗读';
  }

  async function saveMeta(id, soundCount) {
    const fields = {};
    const factEl = document.getElementById('meta-fact-'+id);
    const tagsEl = document.getElementById('meta-tags-'+id);
    if (factEl) fields.fun_fact = factEl.value;
    if (tagsEl) fields.tags = tagsEl.value.split(/[,，、]/).map(t => t.trim()).filter(Boolean);

    const soundFields = [];
    for (let i = 0; i < soundCount; i++) {
      const labelEl = document.getElementById('snd-label-'+id+'-'+i);
      const factEl2 = document.getElementById('snd-fact-'+id+'-'+i);
      soundFields.push({
        index: i,
        label: labelEl ? labelEl.value : '',
        fun_fact: factEl2 ? factEl2.value : ''
      });
    }

    log('💾 保存 ' + id + ' 的声音级设置...\\n', 'info');
    try {
      const r = await fetch('/api/sound-meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fields, soundFields })
      });
      const j = await r.json();
      if (j.ok) {
        log('✅ 已保存，manifest 已重建\\n', 'success');
        refreshStatus();
      } else {
        alert('保存失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('保存失败: ' + e.message); }
  }

  async function syncDisk() {
    if (!confirm('磁盘同步：扫描所有音频文件，清理 meta.json 中的无效引用，重建 manifest。\\n继续？')) return;
    log('🔄 磁盘同步中...\\n', 'info');
    try {
      const r = await fetch('/api/sync-disk', { method: 'POST' });
      const j = await r.json();
      if (j.ok) {
        log('✅ 磁盘同步完成：清理了 ' + j.cleaned + ' 个 meta.json，移除了 ' + j.removed + ' 个无效引用\\n', 'success');
        refreshStatus();
      } else {
        alert('同步失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('同步失败: ' + e.message); }
  }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function showAddForm() { document.getElementById('add-form').style.display = 'block'; }

  async function deleteSound(id) {
    if (!confirm('确定删除 ' + id + '？\\n这将删除 meta.json、音频文件和生成的 TTS，不可恢复！')) return;
    try {
      const r = await fetch('/api/sound?id=' + encodeURIComponent(id), { method: 'DELETE' });
      const j = await r.json();
      if (j.ok) {
        log('🗑️ 已删除: ' + id + '\\n', 'success');
        // 重建 manifest
        await runSSE('build-manifest.js', []);
        refreshStatus();
      } else {
        alert('删除失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('删除失败: ' + e.message); }
  }

  async function regenOne(id, type) {
    setButtons(false);
    clearTerminal();
    const script = type === 'fact' ? 'ai-generate-fun-fact.js' : 'ai-generate-tts.js';
    log('🔄 重新生成 ' + id + ' 的' + (type === 'fact' ? '文案' : 'TTS') + '\\n', 'info');
    await runSSE(script, ['--force', '--id', id]);
    log('\\n📦 重建 Manifest...\\n', 'info');
    await runSSE('build-manifest.js', []);
    setButtons(true);
    log('\\n✅ 完成\\n', 'success');
    refreshStatus();
  }

  async function createSound() {
    const name_zh = document.getElementById('new-name-zh').value.trim();
    const name_en = document.getElementById('new-name-en').value.trim();
    const category = document.getElementById('new-category').value;
    const emoji = document.getElementById('new-emoji').value.trim() || '🔊';
    const tags = document.getElementById('new-tags').value.trim();
    const desc = document.getElementById('new-desc').value.trim();
    const files = document.getElementById('new-audio').files;

    if (!name_zh) { alert('请填写中文名'); return; }
    if (!files || files.length === 0) { alert('请至少选择一个音频文件'); return; }

    // 读取文件为 base64
    const audioFiles = [];
    for (const f of files) {
      const buf = await f.arrayBuffer();
      audioFiles.push({ name: f.name, data: btoa(String.fromCharCode(...new Uint8Array(buf))) });
    }

    log('➕ 创建声音: ' + name_zh + '\\n', 'info');
    try {
      const r = await fetch('/api/sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_zh, name_en, category, emoji, tags, description: desc, audioFiles })
      });
      const j = await r.json();
      if (j.ok) {
        log('✅ 创建成功: ' + j.id + '\\n', 'success');
        document.getElementById('add-form').style.display = 'none';
        // 清空表单
        ['new-name-zh','new-name-en','new-tags','new-desc','new-emoji'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('new-audio').value = '';
        // 重建 manifest 并刷新
        await runSSE('build-manifest.js', []);
        refreshStatus();
      } else {
        alert('创建失败: ' + (j.error || '未知错误'));
      }
    } catch(e) { alert('创建失败: ' + e.message); }
  }

  function setButtons(enabled) {
    ['btn-fact','btn-tts','btn-build'].forEach(id => document.getElementById(id).disabled = !enabled);
  }

  async function runScript(script, args) {
    setButtons(false);
    clearTerminal();
    log('▶️ 开始执行: node scripts/' + script + ' ' + args.join(' ') + '\\n', 'info');

    const res = await fetch('/api/run', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ script, args })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('event:done')) { buffer=''; break; }
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5));
            if (data.text) log(data.text, data.isError ? 'error' : '');
          } catch(e) {}
        }
      }
    }

    setButtons(true);
    log('\\n✅ 完成\\n', 'success');
    refreshStatus();
  }

  async function runFullPipeline() {
    setButtons(false);
    clearTerminal();
    log('🚀 一键全流程启动\\n', 'info');

    log('📝 第1步：AI 生成科普文案...\\n', 'info');
    const args = getAllArgs();
    await runSSE('ai-generate-fun-fact.js', args.length > 0 ? ['--force', ...args] : ['--force']);

    log('\\n🔊 第2步：生成 TTS 朗读...\\n', 'info');
    await runSSE('ai-generate-tts.js', args);

    log('\\n📦 第3步：重建 Manifest...\\n', 'info');
    await runSSE('build-manifest.js', []);

    setButtons(true);
    log('\\n🎉 全流程完成！\\n', 'success');
    refreshStatus();
  }

  async function runSSE(script, args) {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ script, args })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('event:done')) return;
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5));
            if (data.text) log(data.text, data.isError ? 'error' : '');
          } catch(e) {}
        }
      }
    }
  }

  refreshStatus();
</script>
</body>
</html>`;
}

// ============================================================
// 主服务 — 仅绑定 127.0.0.1
// ============================================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 静态文件：/data/ 下的音频/JSON 文件（供后台 <audio> 播放）
  if (req.method === 'GET' && url.pathname.startsWith('/data/')) {
    const filePath = path.join(ROOT, url.pathname);
    // 安全检查：防止路径穿越
    if (!filePath.startsWith(path.join(ROOT, 'data'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    handleAPI(req, res).catch(err => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getAdminHTML());
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🔊 声音大百科 · API 管理后台`);
  console.log(`   地址: http://localhost:${PORT}（仅本机访问）\n`);
});
