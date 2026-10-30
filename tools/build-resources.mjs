// 生成可发布的 resources/：我们自己那 18 张图 + 全量标签数据 + 来源与许可说明
// 用法：node tools/build-resources.mjs
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = process.env.STICKER_LIB || join(ROOT, '..', '..', 'stickers'); // profile 里的图库
const OUT = join(ROOT, 'resources');

const IMG = /\.(gif|png|jpe?g|webp)$/i;

// 1. 清空重建
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'feed'), { recursive: true });

// 2. 拷我们自己那 18 张（feed/）
const feedDir = join(LIB, 'feed');
const files = readdirSync(feedDir).filter((f) => IMG.test(f)).sort();
let bytes = 0;
for (const f of files) {
  copyFileSync(join(feedDir, f), join(OUT, 'feed', f));
  bytes += statSync(join(feedDir, f)).size;
}

// 3. 拷标签数据（全量 680 张的标注，是我们要发布的主体）
for (const f of ['index-all.md', '_all.json']) {
  copyFileSync(join(LIB, f), join(OUT, f));
}
copyFileSync(join(ROOT, 'sources.yaml'), join(OUT, 'sources.yaml'));

// 4. 统计 index-all.md 的分布，写进说明
const md = readFileSync(join(OUT, 'index-all.md'), 'utf8');
const sections = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
const total = (md.match(/^\| `/gm) || []).length;

const attribution = `# 来源与许可（ATTRIBUTION）

两张表：**本仓库随附的文件** 与 **只有标签、需要你自己 pull 的图**。
标签数据（\`index-all.md\`、\`_all.json\`）由本仓库整理，覆盖 ${total} 张表情包；图片本身只有 \`resources/feed/\` 下这 ${files.length} 张随仓库分发。

## 1. 随仓库分发的文件

| 目录 | 数量 | 大小 | 来源 | 许可 |
| --- | --- | --- | --- | --- |
| \`resources/feed/\` | ${files.length} 张 | ${(bytes / 1024 / 1024).toFixed(1)} MB | 本品库自己的投喂（QQ 里存下来的）+ 从 \`dsh-pet\` 的动作 webm 转的透明 GIF | CC BY 4.0（可改，见下） |

其中 \`feed/pet-*.gif\` 由 [dsh-pet](https://www.npmjs.com/package/dsh-pet) 的动作动画转制（抽帧 + 亮度当 alpha），素材版权归原作者；如不希望这样再分发，删掉这 12 个文件即可，不影响插件运行。

## 2. 只有标签、不随仓库分发的图（${total - files.length} 张）

| 分区 | 张数 | 上游 | 许可 |
| --- | --- | --- | --- |
${sections
  .map((s) => {
    const t = (s.match(/^(.+?)（/) || [, s])[1];
    const n = (s.match(/(\d+)\s*张/) || [, ''])[1];
    const src = /nekowhale|大肥鱼|GPT娘/.test(s) ? '[dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers)' : /^ds/.test(s) ? 'deepseek 系表情包（上游见 \`sources.yaml\`）' : /^根目录/.test(s) ? '早期整理（多为 deepseek / 大肥鱼 系图，出处待考）' : '本地投喂';
    const lic = /nekowhale|大肥鱼|GPT娘/.test(s) ? 'CC BY-NC 4.0（署名 + 禁商用）' : /^ds/.test(s) ? '见上游仓库' : /^根目录/.test(s) ? '出处不明，不随仓库分发' : 'CC BY 4.0';
    return `| ${t} | ${n || '?'} | ${src} | ${lic} |`;
  })
  .join('\n')}

跑 \`sticker-hub pull\` 会把上游仓库拉到本地图库，标签表里的条目就能对上文件。

## 3. 我们自己的部分

- 代码：MIT（见 \`LICENSE\`）
- 标签数据（\`resources/index-all.md\`、\`resources/_all.json\`）：CC BY 4.0 —— 可自由使用、修改、再分发，署名即可
- \`resources/feed/\` 下的图：CC BY 4.0（作品本身的权利归创作者；若你打算商用，请自行确认）

## 4. 必须知道的一条

\`nekowhale\` 那 322 张（大肥鱼 286 + 大肥鱼和GPT娘 36）的图来自上游，**CC BY-NC 4.0 禁止付费提供或商用**。本仓库不分发它们，只保留标签；你要用就得自己 pull、并遵守上游条款、保留原作者链接。
`;

writeFileSync(join(OUT, 'ATTRIBUTION.md'), attribution, 'utf8');
writeFileSync(
  join(OUT, 'README.md'),
  `# resources —— 表情包与标签数据

给 [dsh-sticker-hub](../README.md) 用的资源包。

| 文件 | 说明 |
| --- | --- |
| \`feed/\` | ${files.length} 张随仓库分发的表情包（我们自己的投喂 + dsh-pet 转的桌宠动作） |
| \`index-all.md\` | ${total} 张表情包的标签表（名字 / 情绪 / 标签 / 什么时候用） |
| \`_all.json\` | 同上，JSON 版，给插件和脚本读 |
| \`sources.yaml\` | 上游图库清单，\`sticker-hub pull\` 用 |
| \`ATTRIBUTION.md\` | 每个分区的来源与许可 |

## 只想拿标签

\`\`\`bash
npm i -D dsh-sticker-hub
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs pull   # 拉上游图库
\`\`\`

## 想连图一起用

把 \`feed/\` 里的图和 \`sources.yaml\` 拉下来的图合并进图库目录，再让插件指向它：

\`\`\`bash
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs stats --dir <你的图库>
\`\`\`

许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。
`,
  'utf8'
);

console.log(`resources/ 已生成：${files.length} 张图 / ${(bytes / 1024 / 1024).toFixed(1)} MB，标签 ${total} 条`);
for (const s of sections) console.log('  ' + s);
