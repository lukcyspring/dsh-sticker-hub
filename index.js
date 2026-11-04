/**
 * dsh-sticker-hub — 表情包库 / 检索 / 发送 / 打标 / 表情包大战。
 *
 * 设计原则
 *   1. 插件不带图：图片版权在人家仓库里，这里只存 `sources.yaml`（去哪儿拿）+ 本地标签。
 *   2. 标签在本地生成：识图模型自己配（OpenAI 兼容 endpoint），密钥永不出现在仓库里。
 *   3. 通道无关：发送交给任意「发文件」工具（默认 `qqbot_send_file`），没有就只回路径。
 *   4. 一切可回滚：只写 `~/.dsh/sticker-hub/`，不碰宿主与别的插件。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
// 宿主包：在 DSH 里由宿主提供；单独跑 `npm test` / 评审仓库时没有它，所以做成可选。
// 有宿主就用真 schema；没有就退化成同形骨架（只影响独立运行，装进 DSH 一定会走真的）。
let Schema;
try {
  Schema = (await import('@deepseek-ai/schemastery')).default;
} catch {
  Schema = makeStubSchema();
}
function makeStubSchema() {
  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const merge = (base, patch) => {
    if (!plain(base) || !plain(patch)) return patch === undefined ? base : patch;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
    return out;
  };
  const defaultsOf = (node) => {
    if (node.type === 'object') {
      const out = {};
      for (const [k, sub] of Object.entries(node.shape || {})) {
        const d = defaultsOf(sub);
        if (d !== undefined) out[k] = d;
      }
      return merge(node._default ?? {}, out);
    }
    if (node.type === 'array') return node._default ?? [];
    return node._default;
  };
  const chain = (type, extra = {}) => {
    // 真 schemastery 的 Config 是可调用的（Config(input) → 补全默认值），骨架照抄这个形状。
    const node = (input = {}) => merge(defaultsOf(node), input);
    node.type = type;
    node.shape = extra.shape;
    node.inner = extra.inner;
    node.description = (d) => (node._desc = d, node);
    node.min = (v) => (node._min = v, node);
    node.max = (v) => (node._max = v, node);
    node.required = (v = true) => (node._req = v, node);
    node.default = (v) => (node._default = v, node);
    return node;
  };
  return {
    any: () => chain('any'),
    boolean: () => chain('boolean'),
    string: () => chain('string'),
    number: () => chain('number'),
    array: (inner) => chain('array', { inner }),
    object: (shape) => chain('object', { shape }),
    union: (list) => chain('union', { list }),
  };
}

export const name = 'sticker-hub';
export const inject = ['tools', 'webServer'];

// ── 配置 ──────────────────────────────────────────────────────────────
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用表情包库'),
  libraryDir: Schema.string().default('').description('图库目录（空 = ~/.dsh/sticker-hub/library）'),
  publicBaseUrl: Schema.string().default('').description('GUI 的源地址，如 http://127.0.0.1:3388（sticker_show 拼绝对地址用；不填则看环境变量/端口）'),
  battle: Schema.boolean().default(false).description('表情包大战默认开启（也可在设置页或聊天里切换）'),
  triggerWords: Schema.array(Schema.string()).default(['表情包的大战', '表情包大战', '开战']).description('触发表情包大战的文字'),
  streakThreshold: Schema.number().default(3).description('连续收到几张表情包后自动进入大战'),
  sendFileTool: Schema.string().default('').description('【默认留空＝只挑图、只回路径，由模型自己调发文件工具】填工具名可以让插件自己发，但 bridged 环境下会谎报成功（见 CHANGELOG 0.1.7）'),
  vision: Schema.object({
    enabled: Schema.boolean().default(true).description('用识图模型给新图自动打标'),
    baseUrl: Schema.string().default('https://api.openai.com').description('OpenAI 兼容 base（不带 /v1）'),
    model: Schema.string().default('gpt-4o-mini').description('识图模型 id'),
    keyFile: Schema.string().default('').description('读取密钥的文件路径（一行 api key）'),
    apiKey: Schema.string().default('').description('或直接写密钥（不推荐，开源前记得删）'),
    maxBytes: Schema.number().default(8 * 1024 * 1024).description('图片大小上限'),
    timeoutMs: Schema.number().default(60000).description('单次识图超时'),
  }).default({}),
  style: Schema.object({
    maxTags: Schema.number().default(14).description('入库时最多保留几个标签'),
    topK: Schema.number().default(5).description('检索默认返回几条'),
    avoidWindow: Schema.number().default(8).description('最近 N 条用过的图降权（防复读）'),
  }).default({}),
});

// ── 路径 ──────────────────────────────────────────────────────────────
const DSH_HOME = resolve(process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME : join(homedir(), '.dsh'));
const ROOT = join(DSH_HOME, 'sticker-hub');
const STATE = join(ROOT, 'state.json');
const INDEX = 'index-all.md';
const usageFile = () => join(ROOT, 'usage.json');

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
/** 判断 p 是否在 root 之内（Windows 反斜杠 vs 正斜杠不能用 startsWith） */
function insideRoot(root, p) {
  const rel = relative(resolve(root), resolve(p));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
/**
 * 拼图片地址用的源：前端不认相对地址（会当成文件附件），必须是绝对地址。
 * 优先级：工具入参 origin > 配置 publicBaseUrl > 环境变量 > 端口推断。
 */
let webPortGetter = () => undefined;
function setWebPortGetter(fn) { webPortGetter = fn; }

function pickOrigin(cfg, explicit) {
  const clean = (s) => String(s || '').trim().replace(/\/+$/, '');
  if (explicit) return clean(explicit);
  if (cfg && cfg.publicBaseUrl) return clean(cfg.publicBaseUrl);
  // 首选：webServer 服务自己的端口，宿主每次重启都换端口，这个值永远是活的
  let port;
  try { port = webPortGetter(); } catch { /* ignore */ }
  if (!port) port = process.env.DSH_WEB_PORT || process.env.DSH_PORT;
  if (port) return 'http://127.0.0.1:' + String(port).trim();
  for (const k of ['DSH_WEB_URL', 'DSH_GUI_URL', 'DSH_WEBGUI_URL', 'DSH_PUBLIC_URL']) {
    const v = process.env[k];
    if (v) return clean(v);
  }
  return 'http://127.0.0.1:3388'; // 兜底：桌面版常见端口，错了就靠入参 origin
}
function libraryDir(config) {
  const v = (config?.libraryDir || '').trim();
  const p = v ? expandHome(v) : join(ROOT, 'library');
  ensureDir(p);
  return p;
}
function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

// ── 状态（设置页与插件共享，改完即生效，不用重启）────────────────────
function readState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(patch) {
  ensureDir(ROOT);
  const next = { ...readState(), ...patch };
  writeFileSync(STATE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
function readUsage() { try { return JSON.parse(readFileSync(usageFile(), 'utf8')); } catch { return { hits: {} }; } }
function bumpUsage(key) {
  const u = readUsage();
  u.hits = u.hits || {};
  const h = u.hits[key] || { n: 0, at: 0 };
  h.n += 1; h.at = Date.now();
  u.hits[key] = h;
  try { ensureDir(ROOT); writeFileSync(usageFile(), JSON.stringify(u), 'utf8'); } catch { /* ignore */ }
}

// ── 图库 ──────────────────────────────────────────────────────────────
/** 解析 index-all.md 的表格行：| `path` | 名字 | 情绪 | 标签 | 什么时候用 | */
function parseIndex(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const m = /^`([^`]+)`$/.exec(cells[0]);
    if (!m) continue;
    const tags = (cells[3] || '').split(/\s+/).filter(Boolean);
    out.push({
      path: m[1],
      name: cells[1] || '',
      emotion: cells[2] || '',
      tags,
      when: cells[4] || '',
      pack: m[1].includes('/') ? m[1].slice(0, m[1].indexOf('/')) : '',
      file: m[1].includes('/') ? m[1].slice(m[1].lastIndexOf('/') + 1) : m[1],
    });
  }
  return out;
}
let cache = { at: 0, items: [], file: '' };
function loadLibrary(config) {
  const dir = libraryDir(config);
  const file = join(dir, INDEX);
  if (!existsSync(file)) return [];
  const st = statSync(file);
  if (cache.file === file && cache.at === st.mtimeMs) return cache.items;
  const items = parseIndex(readFileSync(file, 'utf8'));
  cache = { at: st.mtimeMs, items, file };
  return items;
}
function absPath(config, rel) {
  const dir = libraryDir(config);
  return resolve(dir, rel);
}

/** 查询按分隔符切成词；顺手剥掉「想/想要/有点」这类意图前缀，免得整词永远匹配不上 */
const TERM_SPLIT = /[\s,，。.!！?？、;；:：/|]+/u;
const FILLER = /^(?:好想|想要|我要|给我|感觉|觉得|有点|好像|想|要|来|我|你)+/u;
const CJK_RE = /[\u3400-\u9fff]/u;
function terms(q) {
  const out = [];
  for (const raw of String(q || '').toLowerCase().split(TERM_SPLIT)) {
    if (!raw) continue;
    let t = raw;
    if (CJK_RE.test(t) && t.length > 2) {
      const stripped = t.replace(FILLER, '');
      if (stripped.length >= 2) t = stripped;
    }
    if (!out.includes(t)) out.push(t);
  }
  return out;
}
function bigrams(s) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
}
/** 兼容旧调用：把查询切成检索词（保留二元组展开，内部已改用 terms） */
function tokenize(q) {
  const out = new Set();
  for (const t of terms(q)) {
    out.add(t);
    if (CJK_RE.test(t) && t.length > 2) for (const b of bigrams(t)) out.add(b);
  }
  return [...out];
}

// 字段权重：名字最重，其次标签、情绪，然后「什么时候用」
const WEIGHTS = [['name', 6], ['tags', 5], ['emotion', 4], ['when', 3], ['path', 2]];

function scoreItem(item, qs, usage, avoidWindow) {
  const f = {
    name: String(item.name || '').toLowerCase(),
    tags: item.tags.join(' ').toLowerCase(),
    emotion: String(item.emotion || '').toLowerCase(),
    when: String(item.when || '').toLowerCase(),
    path: String(item.path || '').toLowerCase(),
  };
  let total = 0;
  let matched = 0;
  for (const q of qs) {
    const fieldScores = [];
    for (const [k, w] of WEIGHTS) {
      const v = f[k];
      if (!v) continue;
      let s = 0;
      if (v.includes(q)) s = w * (v === q ? 1.5 : 1);
      else if (CJK_RE.test(q) && q.length > 2) {
        // 整体没命中就退到二元组：想摸鱼 也能找到 摸鱼
        const bg = bigrams(q);
        const hit = bg.filter((b) => v.includes(b)).length;
        if (hit) s = (w * hit) / bg.length * 0.8;
      }
      if (s > 0) fieldScores.push(s);
    }
    if (fieldScores.length === 0) continue;
    fieldScores.sort((a, b) => b - a);
    // 命中的字段越多越可信：最强的那项全算，其余按折扣累加（同分靠这个拉开）
    const rest = fieldScores.slice(1).reduce((n, x) => n + x, 0);
    total += fieldScores[0] + rest * 0.35;
    matched++;
  }
  // 多个词时惩罚只命中一部分的：宁可全中，不要单词很强
  let s = qs.length > 1 ? total * (matched / qs.length) ** 2 : total;
  const h = usage.hits?.[item.path];
  if (h) {
    // 用过的图降权：越近越狠，用得多也降
    const ageMin = (Date.now() - (h.at || 0)) / 60000;
    if (ageMin < avoidWindow * 2) s *= 0.45;
    else if (ageMin < 60) s *= 0.75;
    s -= Math.min(h.n, 20) * 0.15;
  }
  return s;
}

function search(config, query, k) {
  const items = loadLibrary(config);
  if (items.length === 0) return [];
  const qs = terms(query);
  const usage = readUsage();
  const limit = Math.max(1, Math.min(20, Number(k) || config?.style?.topK || 5));
  const scored = items
    .map((it) => {
      // 分数加一点抖动，免得同一句夸夸永远发同一张图
      const s = scoreItem(it, qs, usage, Number(config?.style?.avoidWindow ?? 8)) * (1 + Math.random() * 0.15);
      return { it, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  if (scored.length === 0) {
    // 没命中就随机兜底，保证「总有一张能发」
    const pick = items[Math.floor(Math.random() * items.length)];
    return [{ ...pick, score: 0 }];
  }
  return scored.map(({ it, s }) => ({ ...it, score: Math.round(s * 100) / 100 }));
}

// ── 回复标记 [sticker:名字] 的解析（给 QQ 桥接层用，模型正文里写标记，这一层拆成文字段+图片段）──
const MARK_RE = /\[sticker:([^\]\n]{1,80})\]/gu;

/** 按名字 / 文件名 / 情绪词 / 检索兜底选一张，返回图库内的绝对路径 */
function pickSticker(config, ref) {
  const items = loadLibrary(config);
  const r = String(ref || '').trim();
  if (!r || items.length === 0) return null;
  const low = r.toLowerCase();
  const byName = items.find((s) => String(s.name || '').toLowerCase() === low);
  if (byName) return { ...byName, abs: absPath(config, byName.path) };
  const byStem = items.find((s) => String(s.path || '').toLowerCase().split('/').pop().startsWith(low));
  if (byStem) return { ...byStem, abs: absPath(config, byStem.path) };
  const byEmotion = items.filter((s) => String(s.emotion || '').toLowerCase() === low);
  if (byEmotion.length) {
    const s = byEmotion[Math.floor(Math.random() * byEmotion.length)];
    return { ...s, abs: absPath(config, s.path) };
  }
  // 名字和情绪都对不上就别硬凑：宁可让模型这几个字原样留着，也别发一张错的图
  return null;
}

/** 把一段文字按标记切段：能找到图就切出图片段，找不到就把标记丢掉（不硬凑、也不让标记露给用户） */
function parseReplyMarkers(config, text) {
  const out = [];
  let last = 0;
  let buf = '';
  let m;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(text)) !== null) {
    buf += text.slice(last, m.index);
    last = MARK_RE.lastIndex;
    const s = pickSticker(config, m[1]);
    if (!s) continue;
    if (buf.trim()) out.push({ type: 'text', text: buf });
    buf = '';
    out.push({ type: 'sticker', ref: m[1], name: s.name, path: s.abs });
  }
  buf += text.slice(last);
  if (buf.trim()) out.push({ type: 'text', text: buf });
  return out;
}

// ── 识图（OpenAI 兼容）────────────────────────────────────────────────
function readKey(config) {
  const v = config?.vision || {};
  if (v.apiKey) return v.apiKey;
  if (v.keyFile) {
    const f = expandHome(v.keyFile);
    try { return readFileSync(f, 'utf8').split('\n')[0].trim(); } catch { return ''; }
  }
  return process.env.STICKER_VISION_KEY || process.env.OPENAI_API_KEY || '';
}

const VISION_PROMPT = `你在给表情包打标签。看这张图，只输出一个 JSON 对象：
{"name":"4~8 字的中文名","emotion":"主要情绪，一个词","tags":["10~14 个词"],"when":"什么时候该发它，一句话"}
要求：tags 用名词/动词短语，别写"可爱"这种空话除非真的可爱；写清楚「图里在做什么」而不是「图看起来像谁」；
中文为主，允许少量专有名词（角色名/动画名）。不要输出 JSON 以外的任何东西。`;

async function describeImage(config, imagePath) {
  const v = config?.vision || {};
  const key = readKey(config);
  if (!key) throw new Error('识图未配置：在设置页填 baseUrl / model / 密钥文件，或设 STICKER_VISION_KEY');
  const abs = expandHome(imagePath);
  const st = statSync(abs);
  if (st.size > Number(v.maxBytes || 8 * 1024 * 1024)) throw new Error(`图片过大：${st.size} 字节`);
  const ext = extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  const data = readFileSync(abs).toString('base64');
  const url = (v.baseUrl || 'https://api.openai.com').replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';
  const body = {
    model: v.model || 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: VISION_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } },
      ],
    }],
    max_tokens: 400,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(v.timeoutMs || 60000));
  let text;
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctrl.signal });
    const raw = await resp.text();
    if (!resp.ok) throw new Error(`识图 HTTP ${resp.status}: ${raw.slice(0, 200)}`);
    const j = JSON.parse(raw);
    text = j?.choices?.[0]?.message?.content ?? '';
  } finally { clearTimeout(timer); }
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error(`识图返回不是 JSON：${String(text).slice(0, 120)}`);
  return JSON.parse(m[0]);
}

// ── 写入图库 ──────────────────────────────────────────────────────────
function upsertRow(config, entry) {
  const dir = libraryDir(config);
  ensureDir(dir);
  const file = join(dir, INDEX);
  const row = `| \`${entry.path}\` | ${entry.name || entry.file} | ${entry.emotion || ''} | ${(entry.tags || []).slice(0, Number(config?.style?.maxTags ?? 14)).join(' ')} | ${(entry.when || '').replace(/\|/g, '/')} |`;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : ['# 表情包索引', '', '| 路径 | 名字 | 情绪 | 标签 | 什么时候用 |', '| --- | --- | --- | --- | --- |'];
  const idx = lines.findIndex((l) => l.startsWith(`| \`${entry.path}\` `));
  if (idx >= 0) lines[idx] = row;
  else {
    let last = -1;
    lines.forEach((l, i) => { if (l.startsWith('| `')) last = i; });
    lines.splice(last >= 0 ? last + 1 : lines.length, 0, row);
  }
  writeFileSync(file, lines.join('\n'), 'utf8');
  cache = { at: 0, items: [], file: '' };
  return row;
}

function ingest(config, imagePath, extra = {}) {
  const abs = expandHome(imagePath);
  if (!existsSync(abs)) throw new Error(`文件不存在：${abs}`);
  const dir = libraryDir(config);
  // 2026-10-30 起整库收进 gallery/ 一个目录；没有 gallery 才退回老的 feed/
  const packName = existsSync(join(dir, 'gallery')) ? 'gallery' : 'feed';
  const packDir = join(dir, packName);
  ensureDir(packDir);
  const base = extra.name ? safeName(extra.name) + extname(abs).toLowerCase() : `${Date.now()}${extname(abs).toLowerCase()}`;
  const dest = join(packDir, base);
  if (resolve(abs) !== resolve(dest)) copyFileSync(abs, dest);
  const entry = {
    path: `${packName}/${base}`,
    file: base,
    name: extra.name || base,
    emotion: extra.emotion || '',
    tags: extra.tags || [],
    when: extra.when || '',
  };
  upsertRow(config, entry);
  return entry;
}
function safeName(s) { return String(s).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'sticker'; }

// ── 表情包大战 ────────────────────────────────────────────────────────
const battle = { on: false, peers: new Map() };
function battleState(config) {
  return { on: battle.on || readState().battle === true || config?.battle === true, peers: battle.peers.size };
}
function noteIncomingSticker(peerId, config) {
  if (!peerId) return false;
  const rec = battle.peers.get(peerId) || { n: 0, at: 0 };
  if (Date.now() - rec.at > 3 * 60 * 1000) rec.n = 0;
  rec.n += 1; rec.at = Date.now();
  battle.peers.set(peerId, rec);
  if (rec.n >= Number(config?.streakThreshold ?? 3)) { battle.on = true; writeState({ battle: true }); }
  return battle.on;
}
function toggleBattle(on) { battle.on = on; battle.peers.clear(); writeState({ battle: on }); return battle.on; }

// ── 发送 ──────────────────────────────────────────────────────────────
/** 没显式给 target 时，从 QQ 补丁写的 peer-map 里取最近一次会话（c2c:<openid>） */
function defaultTarget() {
  try {
    const p = join(homedir(), '.dsh', 'sticker-hub', 'peer-map.json');
    if (!existsSync(p)) return undefined;
    const map = JSON.parse(readFileSync(p, 'utf8'));
    const vals = Object.values(map ?? {}).filter((v) => v && v.targetId);
    if (vals.length === 0) return undefined;
    const v = vals[vals.length - 1];
    return v.scope ? `${v.scope}:${v.targetId}` : String(v.targetId);
  } catch {
    return undefined;
  }
}

/** 发图链路的诊断日志（0.1.6 加）：写 ~/.dsh/sticker-hub/send-debug.log */
function sendLog(obj) {
  try {
    const dir = join(homedir(), '.dsh', 'sticker-hub');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'send-debug.log'), JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n');
  } catch { /* 日志失败不影响发送 */ }
}

async function sendSticker(ctx, config, filePath, target, exec) {
  // 2026-11-02：优先走 QQBot 实例直发（和表情包标记补丁同一条路）。
  // tools.execute 在 bridged exec 里没有会话上下文，不带 target 时会「成功但什么也没发」。
  const bot = globalThis.__qqBot;
  const base = filePath.split(/[\\/]/).pop();
  sendLog({
    ev: 'start', file: base, target: target ?? null, hasBot: !!bot,
    botName: bot && bot.constructor ? bot.constructor.name : null,
    methods: bot ? ['sendImage', 'sendFile', 'sendText', 'sendMarkdown'].filter((k) => typeof bot[k] === 'function') : [],
  });
  let lastErr;
  if (target && bot) {
    for (const fn of ['sendImage', 'sendFile']) {
      if (typeof bot[fn] !== 'function') continue;
      try {
        const r = await bot[fn](target, { localPath: filePath });
        sendLog({ ev: 'bot-ok', fn, result: r === undefined ? null : r });
        return { sent: true, via: `qqBot.${fn}` };
      } catch (e) {
        // 换下一条路，别在这儿直接放弃
        lastErr = e instanceof Error ? e.message : String(e);
        sendLog({ ev: 'bot-fail', fn, err: lastErr });
      }
    }
  }
  const tools = ctx.get?.('tools') ?? ctx.tools;
  const toolName = (config?.sendFileTool || '').trim();
  sendLog({ ev: 'tools-probe', hasTools: !!tools, toolName, keys: tools ? Object.keys(tools).slice(0, 12) : [] });
  if (!toolName || !tools) return { sent: false, path: filePath, reason: lastErr || '没有可用的发文件工具' };
  const args = { file_path: filePath };
  if (target) args.target = target;
  for (const fn of ['execute', 'invoke', 'call', 'run']) {
    if (typeof tools[fn] === 'function') {
      try {
        const result = await tools[fn](toolName, args, exec);
        sendLog({ ev: 'tool-ok', fn, result: result === undefined ? null : result });
        return { sent: true, via: `${fn}(${toolName})`, result };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendLog({ ev: 'tool-fail', fn, err: msg });
        return { sent: false, path: filePath, reason: `${fn} 失败：${msg}` };
      }
    }
  }
  return { sent: false, path: filePath, reason: 'tools 服务没有可调用方法，请先让模型调用 ' + toolName };
}

// ── 工具注册 ──────────────────────────────────────────────────────────
function textBlock(text) { return [{ type: 'text', text }]; }

function registerTools(ctx, config, logger) {
  const tools = ctx.get?.('tools') ?? ctx.tools;
  if (!tools?.register) { logger.warn('sticker-hub: tools 服务不可用，工具未注册'); return; }

  const defs = [
    {
      name: 'sticker_search',
      description: 'Search the local sticker library by intent/mood/topic. Returns candidates with tags and when-to-use. Use before sending a sticker.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you want to express, e.g. "无语 摊手" / "开心 庆祝" / "累了 摸鱼"' },
          k: { type: 'integer', description: 'How many candidates (default 5)' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' }, path: { type: 'string' }, emotion: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } }, when: { type: 'string' }, score: { type: 'number' },
                },
                required: ['name', 'path'], additionalProperties: true,
              },
            },
          },
          required: ['items'], additionalProperties: false,
        },
        render: (_a, v) => textBlock((v.items || []).map((i) => `· ${i.name}（${i.emotion || '-'}）${i.when || ''}`).join('\n') || '没有结果'),
      },
      async execute(args) {
        const cfg = { ...config, ...readState() };
        return { items: search(cfg, args.query, args.k) };
      },
    },
    {
      name: 'sticker_send',
      description: 'Pick one sticker. Pass `query` (recommended) to auto-pick, or `path` for an exact file. By default it only returns the path — send that file with your own file-send tool (e.g. qqbot_send_file). Sends by itself only if config.sendFileTool is set. Does not send any text.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to express; the best match is sent' },
          path: { type: 'string', description: 'Exact relative path inside the library, wins over query' },
          target: { type: 'string', description: 'Optional "c2c:<openid>" / "group:<openid>"' },
        },
        required: [],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            sent: { type: 'boolean' }, name: { type: 'string' }, path: { type: 'string' },
            via: { type: 'string' }, reason: { type: 'string' },
          },
          required: ['sent', 'path'], additionalProperties: false,
        },
        // 2026-11-02 回退：默认只挑图。插件内部代发在 bridged 环境里拿不到会话上下文，
        // 会谎报成功；挑好后由模型自己调发文件工具（那条路验过是能到的）。
        // 2026-11-04：挑好的时候必须把真实路径吐出来——模型下一步要拿它调发文件工具，
        // 只给名字它还得自己拼目录（还可能猜错 gallery 子目录）。
        render: (_a, v) => textBlock(v.sent
          ? `已发 ${v.name || v.path}`
          : (v.path ? `挑好了 ${v.name || v.path}｜path=${v.path}` : `未发出：${v.reason || ''}`)),
      },
      async execute(args, exec) {
        const cfg = { ...config, ...readState() };
        let rel = args.path;
        let name = '';
        if (!rel) {
          if (!args.query) throw new Error('sticker_send: 需要 query 或 path');
          const hit = search(cfg, args.query, 1)[0];
          if (!hit) throw new Error('sticker_send: 图库是空的，先跑一次 ingest/pull');
          rel = hit.path; name = hit.name;
        }
        const abs = absPath(cfg, rel);
        if (!existsSync(abs)) {
          // 2026-11-02：允许传名字 / 裸文件名（别逼着带 gallery/ 前缀）
          const alt = pickSticker(cfg, rel);
          if (alt && existsSync(alt.abs)) {
            rel = alt.path; name = alt.name || name;
          } else {
            throw new Error(`sticker_send: 图库里没有 ${rel}（可以是名字、文件名或 gallery/xxx.gif 这样的相对路径；用 sticker_search 先找）`);
          }
        }
        bumpUsage(rel);
        // 没显式 target 时用 peer-map 里最近一次 QQ 会话；没有就交给下层工具自己判断
        const target = args.target || defaultTarget();
        const r = await sendSticker(ctx, cfg, absPath(cfg, rel), target, exec);
        // 别把 undefined 放进返回值：宿主用「JSON 往返是否一致」校验输出，
        // {reason: undefined} 会被 stringify 丢掉，判成 invalid output: value is not lossless JSON
        const out = { sent: r.sent, name: name || rel.split('/').pop(), path: rel };
        if (r.via) out.via = r.via;
        if (r.reason) out.reason = r.reason;
        return out;
      },
    },
    {
      name: 'sticker_learn',
      description: 'Add an image (usually one the user just sent) into the local sticker library: optional vision auto-tagging, then index it so it can be sent later.',
      parameters: {
        type: 'object',
        properties: {
          image_path: { type: 'string', description: 'Absolute path of the image on disk' },
          name: { type: 'string', description: 'Optional display name' },
          emotion: { type: 'string', description: 'Optional emotion' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional explicit tags (skips vision)' },
          when: { type: 'string', description: 'Optional when-to-use sentence' },
        },
        required: ['image_path'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { path: { type: 'string' }, name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
          required: ['path'], additionalProperties: false,
        },
        render: (_a, v) => textBlock(`入库 ${v.name || v.path}（${(v.tags || []).length} 个标签）`),
      },
      async execute(args) {
        const cfg = { ...config, ...readState() };
        let meta = { name: args.name, emotion: args.emotion, tags: args.tags, when: args.when };
        if (!args.tags || args.tags.length === 0) {
          try {
            const seen = await describeImage(cfg, args.image_path);
            meta = { name: args.name || seen.name, emotion: args.emotion || seen.emotion, tags: seen.tags, when: args.when || seen.when };
          } catch (e) { logger.warn(`sticker-hub: 自动打标失败 ${e instanceof Error ? e.message : String(e)}`); }
        }
        // 只回 schema 里声明的字段（ingest 的 entry 还带 file/emotion/when，多出来会被宿主判 invalid output）
        const entry = ingest(cfg, args.image_path, meta);
        return { path: entry.path, name: entry.name, tags: entry.tags || [] };
      },
    },
    {
      name: 'sticker_show',
      description: 'Show a sticker inline in the chat UI (GUI / web only, no IM needed). Returns markdown pointing at the local image route. Use it when the user is in the DSH GUI rather than QQ.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to express' },
          path: { type: 'string', description: 'Exact relative path inside the library' },
          origin: { type: 'string', description: 'GUI 的源地址，如 http://127.0.0.1:3388（不填则用配置或猜端口；相对地址会被前端当文件，别省）' },
        },
        required: [],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { name: { type: 'string' }, path: { type: 'string' }, markdown: { type: 'string' } },
          required: ['path', 'markdown'], additionalProperties: false,
        },
        render: (_a, v) => textBlock(v.markdown),
      },
      async execute(args) {
        const cfg = { ...config, ...readState() };
        let rel = args.path;
        let name = '';
        if (!rel) {
          if (!args.query) throw new Error('sticker_show: 需要 query 或 path');
          const hit = search(cfg, args.query, 1)[0];
          if (!hit) throw new Error('sticker_show: 图库是空的');
          rel = hit.path; name = hit.name;
        }
        bumpUsage(rel);
        const url = pickOrigin(cfg, args.origin) + '/sticker-hub/img?p=' + encodeURIComponent(rel);
        return { name: name || rel.split('/').pop(), path: rel, markdown: `![${name || rel}](${url})` };
      },
    },
    {
      name: 'sticker_battle',
      description: 'Turn the sticker-battle mode on/off or read its state. In battle mode, reply with stickers only — no text.',
      parameters: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['on', 'off', 'status', 'image'] }, peer: { type: 'string', description: 'Peer id when action=image' } },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'], additionalProperties: false },
        render: (_a, v) => textBlock(v.on ? '表情包大战：开' : '表情包大战：关'),
      },
      async execute(args) {
        const cfg = { ...config, ...readState() };
        if (args.action === 'image') return { on: noteIncomingSticker(args.peer, cfg) };
        if (args.action === 'on') return { on: toggleBattle(true) };
        if (args.action === 'off') return { on: toggleBattle(false) };
        return { on: battleState(cfg).on };
      },
    },
    {
      name: 'sticker_stats',
      description: 'Show sticker library size, tag density and battle state.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: {
          type: 'object',
          properties: { total: { type: 'integer' }, packs: { type: 'object' }, avgTags: { type: 'number' }, battle: { type: 'boolean' } },
          required: ['total', 'battle'], additionalProperties: false,
        },
        render: (_a, v) => textBlock(`图库 ${v.total} 张，均 ${v.avgTags} 标签，大战${v.battle ? '开' : '关'}`),
      },
      async execute() {
        const cfg = { ...config, ...readState() };
        const items = loadLibrary(cfg);
        const packs = {};
        for (const it of items) packs[it.pack || 'root'] = (packs[it.pack || 'root'] || 0) + 1;
        const avg = items.length ? items.reduce((s, i) => s + i.tags.length, 0) / items.length : 0;
        return { total: items.length, packs, avgTags: Math.round(avg * 10) / 10, battle: battleState(cfg).on };
      },
    },
  ];

  for (const def of defs) tools.register(def);
  logger.info(`sticker-hub: 已注册 ${defs.length} 个工具`);
}

// ── HTTP 路由（设置页用）──────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}
function readBody(req) {
  return new Promise((done) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { done(JSON.parse(raw || '{}')); } catch { done({}); } });
  });
}
function isLoopback(req) {
  const a = req.socket?.remoteAddress || '';
  return a === '::1' || a === '127.0.0.1' || a === '::ffff:127.0.0.1';
}

function installRoutes(ctx, config, logger) {
  const web = ctx.get?.('webServer') ?? ctx.webServer;
  if (!web?.register) { logger.warn('sticker-hub: webServer 不可用，设置页无法读写配置'); return; }

  ctx.effect(() => web.register({
    kind: 'exact',
    path: '/sticker-hub/api/config',
    handler: (req, res) => {
      if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      if (req.method === 'GET' || req.method === 'HEAD') {
        const cfg = { ...config, ...readState() };
        const items = loadLibrary(cfg);
        const packs = {};
        for (const it of items) packs[it.pack || 'root'] = (packs[it.pack || 'root'] || 0) + 1;
        return sendJson(res, 200, {
          ok: true,
          enabled: cfg.enabled !== false,
          battle: battleState(cfg).on,
          triggerWords: cfg.triggerWords || [],
          streakThreshold: cfg.streakThreshold,
          libraryDir: libraryDir(cfg),
          libraryDirExists: existsSync(libraryDir(cfg)),
          vision: { baseUrl: cfg.vision?.baseUrl || '', model: cfg.vision?.model || '', keyFile: cfg.vision?.keyFile || '', hasKey: Boolean(readKey(cfg)), enabled: cfg.vision?.enabled !== false },
          total: items.length,
          packs,
          root: ROOT,
        });
      }
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'GET or POST only' });
      readBody(req).then((b) => {
        try {
          const patch = {};
          if (typeof b.battle === 'boolean') { toggleBattle(b.battle); patch.battle = b.battle; }
          if (Array.isArray(b.triggerWords)) patch.triggerWords = b.triggerWords.map(String).filter(Boolean).slice(0, 10);
          if (b.streakThreshold != null) patch.streakThreshold = Math.max(1, Math.min(10, Number(b.streakThreshold) || 3));
          if (typeof b.libraryDir === 'string' && b.libraryDir.trim()) patch.libraryDir = b.libraryDir.trim();
          if (b.vision && typeof b.vision === 'object') {
            const v = { ...(readState().vision || {}) };
            for (const k of ['baseUrl', 'model', 'keyFile', 'apiKey']) if (typeof b.vision[k] === 'string') v[k] = b.vision[k].trim();
            patch.vision = v;
          }
          writeState(patch);
          cache = { at: 0, items: [], file: '' };
          sendJson(res, 200, { ok: true, state: readState() });
        } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }); }
      });
    },
  }), 'sticker-hub: config route');

  // 图片本身：给 GUI / 网页端一个能 <img src> 的地址（只读、只 loopback、只限图库内）
  const MIME = { '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  ctx.effect(() => web.register({
    kind: 'exact',
    path: '/sticker-hub/img',
    handler: (req, res) => {
      if (!isLoopback(req)) { res.statusCode = 403; res.end('loopback only'); return; }
      const u = new URL(req.url, 'http://x');
      const rel = u.searchParams.get('p') || '';
      const cfg = { ...config, ...readState() };
      const root = libraryDir(cfg);
      const abs = resolve(root, rel);
      if (!insideRoot(root, abs)) { res.statusCode = 400; res.end('bad path'); return; }
      const ext = extname(abs).toLowerCase();
      if (!MIME[ext]) { res.statusCode = 400; res.end('not an image'); return; }
      if (!existsSync(abs)) { res.statusCode = 404; res.end('not found'); return; }
      try {
        res.setHeader('Content-Type', MIME[ext]);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(readFileSync(abs));
      } catch (e) { res.statusCode = 500; res.end(String(e)); }
    },
  }), 'sticker-hub: image route');

  // 备选：有些宿主的路由只做前缀匹配，给一条 /sticker-hub/img/<相对路径>
  try {
    ctx.effect(() => web.register({
      kind: 'prefix',
      path: '/sticker-hub/img/',
      handler: (req, res) => {
        if (!isLoopback(req)) { res.statusCode = 403; res.end('loopback only'); return; }
        const rel = decodeURIComponent((req.url || '').split('/sticker-hub/img/')[1] || '').split('?')[0];
        const cfg = { ...config, ...readState() };
        const root = libraryDir(cfg);
        const abs = resolve(root, rel);
        if (!insideRoot(root, abs)) { res.statusCode = 400; res.end('bad path'); return; }
        const ext = extname(abs).toLowerCase();
        if (!MIME[ext] || !existsSync(abs)) { res.statusCode = 404; res.end('not found'); return; }
        try {
          res.setHeader('Content-Type', MIME[ext]);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.end(readFileSync(abs));
        } catch (e) { res.statusCode = 500; res.end(String(e)); }
      },
    }), 'sticker-hub: image route (prefix)');
  } catch { /* 宿主不支持 prefix 就算了 */ }

  ctx.effect(() => web.register({
    kind: 'exact',
    path: '/sticker-hub/api/search',
    handler: (req, res) => {
      if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      const u = new URL(req.url, 'http://x');
      const q = u.searchParams.get('q') || '';
      const cfg = { ...config, ...readState() };
      sendJson(res, 200, { ok: true, items: search(cfg, q, Number(u.searchParams.get('k')) || 12) });
    },
  }), 'sticker-hub: search route');

  // 识图：给外部（agent 自己、脚本）一条快路径，省得每次另起一次模型调用
  ctx.effect(() => web.register({
    kind: 'exact',
    path: '/sticker-hub/api/describe',
    handler: async (req, res) => {
      if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      const u = new URL(req.url, 'http://x');
      const p = (u.searchParams.get('path') || '').trim();
      if (!p) return sendJson(res, 400, { ok: false, error: '缺 path' });
      const abs = resolve(p);
      if (!existsSync(abs)) return sendJson(res, 404, { ok: false, error: '文件不存在: ' + abs });
      const cfg = { ...config, ...readState() };
      const t0 = Date.now();
      try {
        const seen = await describeImage(cfg, abs);
        sendJson(res, 200, { ok: true, ms: Date.now() - t0, path: abs, ...seen });
      } catch (e) {
        sendJson(res, 500, { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
      }
    },
  }), 'sticker-hub: describe route');

  // 客户端渲染 [sticker:名字] 用：只回 {名字, 相对路径, 绝对地址}，不返回别的
  ctx.effect(() => web.register({
    kind: 'exact',
    path: '/sticker-hub/api/pick',
    handler: (req, res) => {
      if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
      const u = new URL(req.url, 'http://x');
      const q = (u.searchParams.get('q') || '').trim();
      if (!q) return sendJson(res, 400, { ok: false, error: '缺 q' });
      const cfg = { ...config, ...readState() };
      const hit = pickSticker(cfg, q);
      if (!hit) return sendJson(res, 200, { ok: false, q });
      const origin = pickOrigin(cfg, u.searchParams.get('origin'));
      sendJson(res, 200, {
        ok: true,
        q,
        name: hit.name,
        emotion: hit.emotion,
        path: hit.path,
        url: `${origin}/sticker-hub/img?p=${encodeURIComponent(hit.path)}`,
      });
    },
  }), 'sticker-hub: pick route');
}

// 供硬拦截补丁调用（可选）。单独抽出来，出站补丁在插件 apply 之前加载时也能自己搭桥。
export function createBridge(config = {}) {
  const cfg = () => ({ ...config, ...readState() });
  return {
    library: () => loadLibrary(cfg()),
    search: (q, k) => search(cfg(), q, k),
    battle: () => battleState(cfg()).on,
    toggleBattle,
    noteIncomingSticker: (peer) => noteIncomingSticker(peer, cfg()),
    abs: (rel) => absPath(cfg(), rel),
    usage: bumpUsage,
    pick: (ref) => pickSticker(cfg(), ref),
    parseReply: (text) => parseReplyMarkers(cfg(), text),
  };
}

// ── 入口 ──────────────────────────────────────────────────────────────
export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  ensureDir(ROOT);
  const cfg = { ...config, ...readState() };
  if (cfg.enabled === false) { logger.info('sticker-hub: 已禁用'); return; }
  // 图片地址要用宿主当前的端口，宿主每次重启都会换，所以每次取值时现读
  try {
    const ws = ctx.get?.('webServer') ?? ctx.webServer;
    setWebPortGetter(() => {
      const live = ctx.get?.('webServer') ?? ctx.webServer ?? ws;
      return live?.port ?? live?.address?.()?.port;
    });
  } catch (e) {
    logger.warn(`sticker-hub: 取不到 webServer 端口，图片地址改用环境变量 ${e instanceof Error ? e.message : String(e)}`);
  }
  try { installRoutes(ctx, config, logger); } catch (e) { logger.warn(`sticker-hub: 路由注册失败 ${e instanceof Error ? e.message : String(e)}`); }
  try { registerTools(ctx, config, logger); } catch (e) { logger.warn(`sticker-hub: 工具注册失败 ${e instanceof Error ? e.message : String(e)}`); }
  const n = loadLibrary(cfg).length;
  logger.info(`sticker-hub: 图库 ${n} 张，目录 ${libraryDir(cfg)}`);
  globalThis.__stickerHub = createBridge(config);
}

export const internals = { parseIndex, tokenize, terms, search, ingest, describeImage, loadLibrary, pickSticker, parseReplyMarkers, ROOT };
