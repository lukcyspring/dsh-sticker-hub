#!/usr/bin/env node
/**
 * dsh-sticker-hub CLI
 *
 *   sticker-hub pull [sourceId]      按 sources.yaml 拉取图库（git clone → 复制图片到 library/<id>/）
 *   sticker-hub tag [dir] [--limit N] 给 library 里还没进 index 的图批量打标（走配置里的识图模型）
 *   sticker-hub stats                看库有多大、标签多密
 *
 * 用法：node bin/sticker-hub.mjs pull nekowhale --token <github token>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { internals } from '../index.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = internals.ROOT;
const LIB = join(ROOT, 'library');
const IMG = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp']);

function args() {
  const a = process.argv.slice(2);
  const flags = {};
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { flags[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
    else pos.push(a[i]);
  }
  return { cmd: pos[0], rest: pos.slice(1), flags };
}

function readSources() {
  const f = join(HERE, 'sources.yaml');
  if (!existsSync(f)) return [];
  // 极简 yaml：只认 id / repo / subdir / path / license / note
  const out = [];
  let cur = null;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*(?:-\s+)?(id|repo|subdir|path|license|note|name):\s*(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'id') { cur = {}; out.push(cur); }
    if (cur) cur[m[1]] = m[2].trim();
  }
  return out;
}

function listImages(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (IMG.has(extname(n).toLowerCase())) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

async function pull(src) {
  const sources = readSources();
  const todo = src ? sources.filter((s) => s.id === src) : sources.filter((s) => s.repo && s.subdir);
  if (todo.length === 0) { console.error(`没有这个来源：${src || '(空)'}`); process.exit(1); }
  for (const s of todo) {
    if (!s.repo) { console.log(`跳过 ${s.id}（本地目录，没有 repo）`); continue; }
    if (!s.subdir) { console.log(`跳过 ${s.id}（没填 subdir，图片不在仓库里）`); continue; }
    const tmp = mkdtempSync(join(tmpdir(), `sticker-${s.id}-`));
    // 不用 git clone：走 GitHub 的 tarball，免装 git，也不吃代理
    const m = /github\.com[/:]([^/]+)\/([^/#?]+)/.exec(s.repo);
    if (!m) { console.error(`跳过 ${s.id}：只支持 GitHub 仓库地址（${s.repo}）`); continue; }
    const tarball = `https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, '')}/tarball`;
    console.log(`→ 下载 ${m[1]}/${m[2]}（tarball）`);
    const res = await fetch(tarball, { headers: { 'User-Agent': 'dsh-sticker-hub', Accept: 'application/vnd.github+json' } });
    if (!res.ok) { console.error(`  下载失败：HTTP ${res.status}`); continue; }
    const tgz = join(tmp, 'repo.tgz');
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    const unpack = join(tmp, 'src');
    mkdirSync(unpack, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', unpack], { stdio: 'inherit' }); // Windows 10+ 自带 tar
    const top = readdirSync(unpack).map((n) => join(unpack, n)).find((p) => statSync(p).isDirectory());
    if (!top) { console.error(`  解包失败：${s.id}`); continue; }
    const from = s.subdir ? join(top, s.subdir) : top;
    if (!existsSync(from)) { console.error(`  仓库里没有目录 ${s.subdir}`); continue; }
    const to = join(LIB, s.id);
    mkdirSync(to, { recursive: true });
    let n = 0;
    for (const f of listImages(from)) {
      copyFileSync(f, join(to, basename(f)));
      n++;
    }
    console.log(`  ${s.id}: 复制 ${n} 张 → ${to}`);
  }
}

async function tag(onlyDir, limit) {
  const cfg = { ...(JSON.parse(safeRead(join(ROOT, 'state.json')) || '{}')) };
  const indexText = safeRead(join(LIB, 'index-all.md')) || '';
  const known = new Set(internals.parseIndex(indexText).map((i) => i.path));
  const dirs = onlyDir ? [resolve(onlyDir)] : readdirSync(LIB).map((d) => join(LIB, d)).filter((p) => statSync(p).isDirectory());
  const todo = [];
  for (const d of dirs) {
    const pack = basename(d);
    for (const f of listImages(d)) {
      const rel = `${pack}/${basename(f)}`;
      if (!known.has(rel)) todo.push({ abs: f, rel });
    }
  }
  console.log(`待打标 ${todo.length} 张${limit ? `（只跑前 ${limit}）` : ''}`);
  let ok = 0, fail = 0;
  for (const t of todo.slice(0, limit || todo.length)) {
    try {
      const seen = await internals.describeImage(cfg, t.abs);
      internals.ingest(cfg, t.abs, { name: seen.name, emotion: seen.emotion, tags: seen.tags, when: seen.when });
      ok++;
      process.stdout.write(`\r  完成 ${ok} 失败 ${fail}`);
    } catch (e) {
      fail++;
      console.log(`\n  ✗ ${t.rel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n打标结束：成功 ${ok}，失败 ${fail}`);
}

function stats() {
  const items = internals.parseIndex(safeRead(join(LIB, 'index-all.md')) || '');
  const packs = {};
  for (const it of items) packs[it.pack || 'root'] = (packs[it.pack || 'root'] || 0) + 1;
  const avg = items.length ? items.reduce((s, i) => s + i.tags.length, 0) / items.length : 0;
  console.log(`图库 ${items.length} 张，均 ${avg.toFixed(1)} 标签`);
  for (const [k, v] of Object.entries(packs)) console.log(`  ${k}  ${v}`);
  console.log(`目录：${LIB}`);
}

function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

const { cmd, rest, flags } = args();
mkdirSync(LIB, { recursive: true });
if (cmd === 'pull') await pull(rest[0]);
else if (cmd === 'tag') await tag(rest[0], Number(flags.limit) || 0);
else if (cmd === 'stats') stats();
else {
  console.log(`dsh-sticker-hub
  node bin/sticker-hub.mjs pull [sourceId]        拉取图库
  node bin/sticker-hub.mjs tag [dir] [--limit N]  批量打标
  node bin/sticker-hub.mjs stats                  统计`);
}
