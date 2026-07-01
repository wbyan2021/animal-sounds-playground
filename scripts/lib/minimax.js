/**
 * scripts/lib/minimax.js — AI 模型统一封装（CommonJS）
 *
 * 配置体系（v2，LLM / TTS 分离）：
 *   LLM  组：LLM_ENDPOINT / LLM_API_KEY / LLM_MODEL / LLM_MAX_TOKENS / LLM_TEMPERATURE
 *   TTS  组：TTS_ENDPOINT / TTS_API_KEY / TTS_MODEL / TTS_VOICE_* / TTS_SAMPLE_RATE ...
 *   通用：   MINIMAX_GROUP_ID
 *
 * 向后兼容：若新变量缺失，回退到旧的 MINIMAX_API_KEY / MINIMAX_BASE_URL / MINIMAX_*_MODEL
 *
 * 功能：
 *   - getLLMConfig() / getTTSConfig()  — 读取各自配置
 *   - callLLM()                        — 调用 LLM 聊天接口
 *   - generateSpeech()                 — 调用 TTS 接口（返回 WAV Buffer）
 *   - generateFunFact()                — 一键生成科普文案
 *   - generateAndSaveSpeech()          — 生成 TTS 并写入文件（.wav）
 *   - loadEnv()                        — 从 .env 加载环境变量
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// 常量
// ============================================================

// TTS 音频默认参数（可被 .env 覆盖）
const DEFAULT_TTS_SAMPLE_RATE = 32000;
const DEFAULT_TTS_CHANNELS = 1;
const DEFAULT_TTS_BITS_PER_SAMPLE = 16;

const DEFAULT_VOICES = {
  'zh-name': { voice_id: 'female-tianmei', speed: 0.9, vol: 1.0 },
  'zh-fact': { voice_id: 'female-tianmei', speed: 0.85, vol: 1.0 },
  'en-name': { voice_id: 'male-qn-qingse', speed: 0.9, vol: 1.0 },
};

function getVoices() {
  const voices = { ...DEFAULT_VOICES };
  const customZh = process.env.TTS_VOICE_ZH || process.env.MINIMAX_VOICE_ZH;
  const customEn = process.env.TTS_VOICE_EN || process.env.MINIMAX_VOICE_EN;
  if (customZh) {
    voices['zh-name'] = { ...voices['zh-name'], voice_id: customZh };
    voices['zh-fact'] = { ...voices['zh-fact'], voice_id: customZh };
  }
  if (customEn) {
    voices['en-name'] = { ...voices['en-name'], voice_id: customEn };
  }
  return voices;
}

// ============================================================
// 配置（v2：LLM / TTS 分离 + 向后兼容）
// ============================================================

/**
 * LLM 配置
 * 优先读 LLM_*，回退到旧的 MINIMAX_API_KEY / MINIMAX_BASE_URL + 路径 / MINIMAX_LLM_MODEL
 */
function getLLMConfig() {
  const apiKey = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  // endpoint：新配置直接用完整 URL；旧配置回退到 baseUrl 拼接
  let endpoint = process.env.LLM_ENDPOINT;
  if (!endpoint) {
    const baseUrl = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat').replace(/\/+$/, '');
    endpoint = `${baseUrl}/v1/chat/completions`;
  }

  const model = process.env.LLM_MODEL || process.env.MINIMAX_LLM_MODEL || 'deepseek-chat';
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || '200', 10);
  const temperature = parseFloat(process.env.LLM_TEMPERATURE || '0.8');

  return { apiKey, groupId, endpoint, model, maxTokens, temperature };
}

/**
 * TTS 配置
 * 优先读 TTS_*，回退到旧的 MINIMAX_API_KEY / MINIMAX_BASE_URL + 路径 / MINIMAX_TTS_MODEL
 */
function getTTSConfig() {
  const apiKey = process.env.TTS_API_KEY || process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  // endpoint：新配置直接用完整 URL；旧配置回退到 baseUrl 拼接
  let endpoint = process.env.TTS_ENDPOINT;
  if (!endpoint) {
    const baseUrl = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat').replace(/\/+$/, '');
    endpoint = `${baseUrl}/v1/t2a_v2`;
  }

  const model = process.env.TTS_MODEL || process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd';
  const sampleRate = parseInt(process.env.TTS_SAMPLE_RATE || String(DEFAULT_TTS_SAMPLE_RATE), 10);
  const bitrate = parseInt(process.env.TTS_BITRATE || '128000', 10);
  const format = process.env.TTS_FORMAT || 'pcm';
  const channel = parseInt(process.env.TTS_CHANNEL || String(DEFAULT_TTS_CHANNELS), 10);

  return { apiKey, groupId, endpoint, model, sampleRate, bitrate, format, channel };
}

// ============================================================
// .env 加载
// ============================================================

function loadEnv(envPath) {
  const file = envPath || path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ============================================================
// 工具
// ============================================================

/** 真正的 SHA-256 哈希 */
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').slice(0, 16);
}

/** fetch 超时封装 */
function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/** 把 raw PCM 包裹成 WAV Buffer */
function pcmToWav(pcm, sampleRate = DEFAULT_TTS_SAMPLE_RATE, channels = DEFAULT_TTS_CHANNELS) {
  const bitsPerSample = DEFAULT_TTS_BITS_PER_SAMPLE;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

// ============================================================
// LLM 聊天
// ============================================================

async function callLLM(messages, options = {}) {
  const { apiKey, groupId, endpoint, model, maxTokens, temperature } = getLLMConfig();
  if (!apiKey) throw new Error('缺少 LLM_API_KEY（或旧的 MINIMAX_API_KEY）。请在 .env 中配置。');

  const body = {
    model: options.model || model,
    messages,
    temperature: options.temperature ?? temperature,
    max_tokens: options.maxTokens ?? maxTokens,
    stream: false,
    ...(groupId ? { group_id: groupId } : {}),
  };

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${err.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.choices?.[0]?.message?.content) {
    const reason = json.base_resp?.status_msg
      || json.error?.message
      || JSON.stringify(json).slice(0, 200);
    const code = json.base_resp?.status_code ?? '?';
    throw new Error(`LLM 失败 [code=${code}]: ${reason}`);
  }

  let text = json.choices[0].message.content;
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text;
}

// ============================================================
// TTS
// ============================================================

async function generateSpeech(text, voicePreset = 'zh-fact') {
  const { apiKey, groupId, endpoint, model, sampleRate, bitrate, format, channel } = getTTSConfig();
  if (!apiKey) throw new Error('缺少 TTS_API_KEY（或旧的 MINIMAX_API_KEY）。请在 .env 中配置。');
  if (!text || !text.trim()) throw new Error('TTS 文本为空');

  const voices = getVoices();
  const vc = voices[voicePreset];
  if (!vc) throw new Error(`未知音色预设: ${voicePreset}`);

  // MiniMax 国内版 (api.minimaxi.com) 字段结构：
  //   - audio_setting.audio_sample_rate（注意是 audio_sample_rate，不是 sample_rate）
  //   - format 支持 mp3 / pcm / wav
  //   - voice_setting 含 pitch（音调，默认 1）
  //   - language_boost: "auto"（语言自动识别）
  const body = {
    model,
    text,
    stream: false,
    voice_setting: {
      voice_id: vc.voice_id,
      speed: vc.speed,
      vol: vc.vol,
      pitch: 1,
    },
    audio_setting: {
      audio_sample_rate: sampleRate,
      bitrate,
      format,
      channel,
    },
    language_boost: 'auto',
    ...(groupId ? { group_id: groupId } : {}),
  };

  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  // MiniMax 失败时会返回 { base_resp: { status_code, status_msg } }，没有 data.audio
  if (!json.data?.audio) {
    const reason = json.base_resp?.status_msg
      || json.message
      || JSON.stringify(json).slice(0, 200);
    const code = json.base_resp?.status_code ?? '?';
    throw new Error(`TTS 失败 [code=${code}]: ${reason}`);
  }

  // MiniMax 返回的音频数据编码方式：
  // - 国内版 (api.minimaxi.com): data.audio 是 **hex 字符串**（"494433..." 解码后 = ID3 头）
  // - 国际版 (api.minimax.io):  data.audio 是 base64 字符串
  // 判断依据：hex 字符串只含 0-9a-f，且长度为偶数
  const audioStr = json.data.audio;
  let audioBuf;
  if (/^[0-9a-fA-F]+$/.test(audioStr) && audioStr.length % 2 === 0) {
    audioBuf = Buffer.from(audioStr, 'hex');
  } else {
    audioBuf = Buffer.from(audioStr, 'base64');
  }
  // format=mp3 → 直接保存；format=pcm → 包 WAV 头
  if (format === 'pcm') {
    return { audioBuffer: pcmToWav(audioBuf, sampleRate, channel), format: 'wav' };
  }
  return { audioBuffer: audioBuf, format };
}

// ============================================================
// 业务方法
// ============================================================

async function generateFunFact(meta) {
  const prompt = [
    '你是一位儿童科普作家，擅长为 1-6 岁儿童撰写简短、有趣、准确的科普小知识。',
    '请根据以下标签，写一段 30-50 字的中文科普文案。',
    '',
    '要求：',
    '- 只陈述科学事实，不编造；',
    '- 语言口语化、有画面感，孩子能听懂；',
    '- 充分利用提供的标签（物种、习性、栖息地等），突出一个有趣的冷知识；',
    '- 不输出任何解释、标题或多余内容，只返回一段文案。',
    '',
    `输入：中文名=${meta.name_zh}，英文名=${meta.name_en}，分类=${meta.category}${meta.subcategory ? '/' + meta.subcategory : ''}，标签=${(meta.tags || []).join('、') || '无'}，描述=${meta.description || '无'}`,
  ].join('\n');

  const text = await callLLM([{ role: 'user', content: prompt }], { temperature: 0.8, maxTokens: 512 });

  const { model } = getLLMConfig();
  return {
    text,
    ai: {
      generated_at: new Date().toISOString(),
      model,
      prompt_version: 'v1',
      text_hash: sha256(text),
    },
  };
}

async function generateAndSaveSpeech(text, outputDir, filename, voicePreset = 'zh-fact') {
  fs.mkdirSync(outputDir, { recursive: true });
  const { audioBuffer } = await generateSpeech(text, voicePreset);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, audioBuffer);
  return filePath;
}

/**
 * 为单条音频生成专属科普文案（音频级 fun_fact）
 * 与 admin-server 的 /api/track-generate-fact 使用同一套 prompt，保证逻辑对齐
 */
async function generateTrackFact(meta, track, fileName) {
  const prompt = [
    '你是一位儿童科普作家，专为 1-6 岁儿童撰写音频专属科普短句。',
    `当前音频是「${meta.name_zh}」众多录音中的其中一条，请为它写一段 20-40 字的中文科普文案。`,
    '',
    '要求：',
    '- 只陈述科学事实，不编造；',
    '- 语言口语化、有画面感，孩子能听懂；',
    '- 必须围绕当前音频的专属标签、场景或文件名展开，突出这条录音的独特之处；',
    '- 不要重复或概括声音级主文案的内容，要从不同角度切入；',
    '- 如果当前音频有标签（label / tags），文案要紧扣标签；没有标签时，从文件名推测这条录音的具体场景；',
    '- 不输出任何解释、标题或多余内容，只返回一段文案。',
    '',
    '输入：',
    `- 声音中文名：${meta.name_zh}`,
    `- 英文名：${meta.name_en}`,
    `- 分类：${meta.category}`,
    `- 声音级主文案（不要重复）：${meta.fun_fact || '无'}`,
    `- 当前音频标签（label）：${track.label || '无'}`,
    `- 当前音频分类标签（tags）：${(track.tags || []).join('、') || '无'}`,
    `- 当前音频文件名：${fileName}`,
  ].join('\n');

  const text = await callLLM([{ role: 'user', content: prompt }], { temperature: 0.9, maxTokens: 512 });
  const { model } = getLLMConfig();
  return {
    text,
    ai: {
      generated_at: new Date().toISOString(),
      model,
      prompt_version: 'track-v1',
      text_hash: sha256(text),
    },
  };
}

/**
 * 为单条音频生成朗读音频（音频级 TTS）
 */
async function generateTrackTTS(text, outputDir, trackIndex) {
  const filename = `track-${trackIndex}-tts.mp3`;
  await generateAndSaveSpeech(text, outputDir, filename, 'zh-fact');
  return 'generated/' + filename;
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  loadEnv,
  getLLMConfig,
  getTTSConfig,
  callLLM,
  generateSpeech,
  generateFunFact,
  generateTrackFact,
  generateAndSaveSpeech,
  generateTrackTTS,
  getVoices,
  DEFAULT_VOICES,
  sha256,
};
