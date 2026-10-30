// 生成可发布的 resources/：随仓库分发的图 + 全量标签数据 + 同义词表 + 来源与许可
// 布局与本地图库一致：图片全在 resources/gallery/ 一个目录，索引只有一份。
// 用法：node tools/build-resources.mjs
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = process.env.STICKER_LIB || join(ROOT, '..', '..', 'stickers'); // profile 里的图库
const OUT = join(ROOT, 'resources');
const GAL = join(LIB, 'gallery');

const all = JSON.parse(readFileSync(join(LIB, '_all.json'), 'utf8'));
const rows = all.items;
const byPack = new Map();
for (const r of rows) byPack.set(r.pack, (byPack.get(r.pack) ?? 0) + 1);

// 1. 重建 resources/gallery：只放我们自己有权分发的（origin 里有 feed/ 的那些投喂图）
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'gallery'), { recursive: true });

const shipped = rows.filter((r) => (r.origin || []).some((o) => o.startsWith('feed/')));
let bytes = 0;
const missing = [];
for (const r of shipped) {
  const src = join(GAL, r.file);
  if (!existsSync(src)) { missing.push(r.file); continue; }
  copyFileSync(src, join(OUT, 'gallery', r.file));
  bytes += statSync(src).size;
}

// 2. 标签数据 + 同义词表 + 上游清单
for (const f of ['index-all.md', '_all.json', 'tags-synonyms.json']) {
  const p = join(LIB, f);
  if (existsSync(p)) copyFileSync(p, join(OUT, f));
}
copyFileSync(join(ROOT, 'sources.yaml'), join(OUT, 'sources.yaml'));

// 3. 统计
const md = readFileSync(join(OUT, 'index-all.md'), 'utf8');
const total = (md.match(/^\| `/gm) || []).length;
const tagWords = new Set(rows.flatMap((r) => r.tags || [])).size;
const emo = new Map();
for (const r of rows) emo.set(r.emotion || '(空)', (emo.get(r.emotion || '(空)') ?? 0) + 1);
const packedRows = [...byPack.entries()].sort((a, b) => b[1] - a[1]);

const attr = `# 来源与许可（ATTRIBUTION）

**布局和本地图库一致：所有图都在 \`gallery/\` 一个目录，索引只有 \`index-all.md\` 一份。**

- \`resources/gallery/\`：随仓库分发的 ${shipped.length} 张（${(bytes / 1024 / 1024).toFixed(1)} MB）
- \`resources/index-all.md\` / \`_all.json\`：${total} 张表情包的标签（名字 / 情绪 / 标签 / 什么时候发），图片本身需要自己 \`pull\`
- \`resources/tags-synonyms.json\`：标签同义词表（统一词表用，${tagWords} 个词）

## 1. 随仓库分发的文件

| 目录 | 数量 | 大小 | 来源 | 许可 |
| --- | --- | --- | --- | --- |
| \`resources/gallery/\` | ${shipped.length} 张 | ${(bytes / 1024 / 1024).toFixed(1)} MB | 本品库自己的投喂（QQ 里存下来的）+ 从 \`dsh-pet\` 动作 webm 转的透明 GIF | CC BY 4.0（作品本身权利归创作者，商用自行确认） |

其中 \`pet-*.gif\` 由 [dsh-pet](https://www.npmjs.com/package/dsh-pet) 的动作动画转制（抽帧 + 亮度当 alpha）；如不希望这样再分发，删掉这 12 个文件即可，不影响插件运行。

## 2. 只有标签、不随仓库分发的图（${total - shipped.length} 张）

| 来源 | 张数 | 上游 / 说明 | 许可 |
| --- | --- | --- | --- |
${packedRows
  .map(([pack, n]) => {
    if (pack === 'nekowhale') return `| 大肥鱼系（nekowhale） | ${n} | [dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers) → kiriyuki.com | CC BY-NC 4.0（署名 + 禁商用） |`;
    if (pack === 'ds') return `| deepseek 系 | ${n} | 见 \`sources.yaml\`（fisharchive 等） | 见上游仓库 |`;
    if (pack === 'feed') return `| 本库投喂 | ${n} | 随仓库分发 | CC BY 4.0 |`;
    return `| 精选（合并去重后） | ${n} | 多为上面两套里挑出来的，文件名重命名过（2026-10-30 用 SHA-256 逐字节反查确认） | 随上游 |`;
  })
  .join('\n')}

图不随仓库走，跑 \`sticker-hub pull\` 自己拉，标签表里的条目就能对上文件。

## 3. 我们自己的部分

- 代码：MIT（见 \`LICENSE\`）
- 标签数据（\`resources/index-all.md\`、\`resources/_all.json\`、\`resources/tags-synonyms.json\`）：CC BY 4.0，署名即可自由使用、修改、再分发
- 情绪分布：${[...emo.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / ')}

## 4. 必须知道的一条

大肥鱼系那 ${byPack.get('nekowhale') ?? 0} 张来自上游，**CC BY-NC 4.0 禁止付费提供或商用**。本仓库不分发它们，只保留标签；你要用就得自己 pull、遵守上游条款、保留原作者链接。
`;

writeFileSync(join(OUT, 'ATTRIBUTION.md'), attr, 'utf8');

writeFileSync(
  join(OUT, 'README.md'),
  `# resources —— 表情包与标签数据

给 [dsh-sticker-hub](../README.md) 用的资源包。**结构和本地图库一样：图在一个目录里，索引只有一份。**

\`\`\`
resources/
├─ gallery/            ${shipped.length} 张随仓库分发的图（其余图自己 pull）
├─ index-all.md        ${total} 张的标签表（文件 / 名字 / 情绪 / 标签 / 什么时候发）
├─ _all.json           同一份数据的 JSON 版，带 origin（合并前的路径）
├─ tags-synonyms.json  标签同义词表，${tagWords} 个词统一后
├─ sources.yaml        上游图库清单，sticker-hub pull 用
└─ ATTRIBUTION.md      每个来源的许可
\`\`\`

## 用它

\`\`\`bash
npm i -D dsh-sticker-hub
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs pull    # 按 sources.yaml 拉上游图，统一落到 library/gallery/
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs tag     # 给没进索引的图打标
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs stats   # 看看现在多少张
\`\`\`

把 \`resources/gallery/\` 也拷进同一个 \`library/gallery/\`，标签表就能对上其中一部分；剩下的按 \`ATTRIBUTION.md\` 自己去上游取。

许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。
`,
  'utf8',
);

console.log(`resources/ 已生成：gallery/ ${shipped.length} 张 / ${(bytes / 1024 / 1024).toFixed(1)} MB，标签 ${total} 条，词表 ${tagWords} 个`);
if (missing.length) console.log('  缺图（索引里有、gallery 里没有）:', missing.slice(0, 5).join(', '));
for (const [k, v] of packedRows) console.log(`  ${k}: ${v}`);
