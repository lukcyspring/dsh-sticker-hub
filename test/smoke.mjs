#!/usr/bin/env node
/**
 * 冒烟测试：不依赖真实 DSH，用一个假的 ctx 走一遍插件。
 *
 *   node test/smoke.mjs
 *
 * 会自己在临时目录里搭一个最小图库（两张 1×1 PNG + index-all.md），
 * 把 DSH_HOME 指过去，所以不会碰你本机的真实图库与状态。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'sticker-hub-smoke-'));
process.env.DSH_HOME = home;
delete process.env.STICKER_VISION_KEY;

const ROOT = join(home, 'sticker-hub');
const LIB = join(ROOT, 'library');
mkdirSync(join(LIB, 'demo'), { recursive: true });

// 1×1 透明 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync(join(LIB, 'demo', 'moyu.png'), PNG);
writeFileSync(join(LIB, 'demo', 'wuyu.png'), PNG);
writeFileSync(
  join(LIB, 'index-all.md'),
  [
    '# 表情包库（冒烟测试）',
    '',
    '| 路径 | 名字 | 情绪 | 标签 | 什么时候用 |',
    '| --- | --- | --- | --- | --- |',
    '| `demo/moyu.png` | 摸鱼鱼 | 摸鱼 | 摸鱼 躺平 咸鱼 偷懒 | 想歇会儿又不好意思说 |',
    '| `demo/wuyu.png` | 无语鱼 | 无语 | 无语 白眼 嫌弃 就这 | 遇到离谱的事 |',
    '',
  ].join('\n'),
);
writeFileSync(join(ROOT, 'state.json'), JSON.stringify({ libraryDir: LIB }, null, 2), 'utf8');

const { apply, Config, createBridge } = await import('../index.js');

// ── 假 ctx ────────────────────────────────────────────────
const tools = [];
const routes = [];
const ctx = {
  logger: { info() {}, warn() {}, debug() {}, error: (...a) => console.error('[plugin error]', ...a) },
  effect(fn) {
    const off = fn();
    return typeof off === 'function' ? off : () => {};
  },
  get(name) {
    if (name === 'tools')
      return {
        register(def) { tools.push(def); },
        async execute(n, a) { return { note: 'mock-send', name: n, args: a }; },
      };
    if (name === 'webServer')
      return { port: 12345, register(r) { routes.push(r); return () => {}; } };
    return undefined;
  },
};

const problems = [];
const check = (ok, label) => {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}`);
    problems.push(label);
  }
};

apply(ctx, Config({}));

console.log('\n工具');
for (const name of ['sticker_search', 'sticker_send', 'sticker_learn', 'sticker_battle', 'sticker_stats', 'sticker_show'])
  check(tools.some((t) => t.name === name), `注册了 ${name}`);

console.log('\n路由');
for (const path of ['/sticker-hub/img', '/sticker-hub/api/config', '/sticker-hub/api/pick', '/sticker-hub/api/describe'])
  check(routes.some((r) => r.path === path), `注册了 ${path}`);

const call = (name, args) => tools.find((t) => t.name === name).execute(args);

console.log('\n检索');
const hit = await call('sticker_search', { query: '想摸鱼', k: 2 });
check(hit.items.length > 0, '有结果');
check(hit.items[0].name === '摸鱼鱼', `「想摸鱼」第一条是摸鱼鱼（实际：${hit.items[0]?.name}）`);

const hit2 = await call('sticker_search', { query: '无语 就这', k: 2 });
check(hit2.items[0].name === '无语鱼', `「无语 就这」第一条是无语鱼（实际：${hit2.items[0]?.name}）`);

console.log('\n发送与其他工具');
const sent = await call('sticker_send', { query: '摸鱼' });
check(typeof sent.path === 'string' && sent.path.includes('/'), `sticker_send 返回路径（${sent.path}）`);

const stats = await call('sticker_stats', {});
check(stats.total === 2, `sticker_stats 数到 2 张（实际 ${stats.total}）`);

const shown = await call('sticker_show', { query: '无语', origin: 'http://127.0.0.1:12345' });
check(/^!\[.+\]\(http:\/\/127\.0\.0\.1:12345\/sticker-hub\/img\?p=/.test(shown.markdown || ''), 'sticker_show 给出绝对地址的 markdown');

const battleOn = await call('sticker_battle', { action: 'on' });
check(battleOn.on === true, 'sticker_battle 能开');
const battleOff = await call('sticker_battle', { action: 'off' });
check(battleOff.on === false, 'sticker_battle 能关');

console.log('\n桥与标记');
const bridge = createBridge();
check(typeof bridge.pick === 'function', 'createBridge().pick 存在');
const picked = bridge.pick('摸鱼');
check(picked && picked.path === 'demo/moyu.png', `pick('摸鱼') 命中（${picked?.path}）`);
const parsed = bridge.parseReply('先说一句。[sticker:无语] 后面一句。');
check(
  parsed.length === 3 && parsed[0].type === 'text' && parsed[1].type === 'sticker' && parsed[2].type === 'text',
  `标记拆成 文字/图/文字 三段（实际 ${parsed.map((p) => p.type).join('→')}）`,
);
check(parsed[1].name === '无语鱼', `标记落在无语鱼（${parsed[1].name}）`);

const dropped = bridge.parseReply('查不到的标记[sticker:这个名字肯定没有]不该露出来');
check(!JSON.stringify(dropped).includes('sticker:'), '查不到的标记被丢掉，不露给用户');

console.log('\n图片路由');
const img = routes.find((r) => r.path === '/sticker-hub/img');
const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
await img.handler({ url: '/sticker-hub/img?p=' + encodeURIComponent('demo/moyu.png'), method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res);
check(res.statusCode === 200 && res.body?.length > 0, `能取到图（${res.statusCode}，${res.body?.length} 字节：${String(res.body).slice(0, 60)}）`);

const bad = { statusCode: 0, headers: {}, setHeader() {}, end() {} };
await img.handler({ url: '/sticker-hub/img?p=' + encodeURIComponent('../../../etc/passwd'), method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, bad);
check(bad.statusCode === 400 || bad.statusCode === 404 || bad.statusCode === 403, `越界路径被挡住（${bad.statusCode}）`);

try { rmSync(home, { recursive: true, force: true }); } catch { /* Windows 偶尔删不掉，无所谓 */ }

if (problems.length) {
  console.error(`\n${problems.length} 项没通过：`);
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('\n全部通过。');
