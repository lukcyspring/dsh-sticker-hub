# 来源与许可（ATTRIBUTION）

**布局和本地图库一致：所有图都在 `gallery/` 一个目录，索引只有 `index-all.md` 一份。**

- `resources/gallery/`：随仓库分发的 18 张（21.8 MB）
- `resources/index-all.md` / `_all.json`：614 张表情包的标签（名字 / 情绪 / 标签 / 什么时候发），图片本身需要自己 `pull`
- `resources/tags-synonyms.json`：标签同义词表（统一词表用，4202 个词）

## 1. 随仓库分发的文件

| 目录 | 数量 | 大小 | 来源 | 许可 |
| --- | --- | --- | --- | --- |
| `resources/gallery/` | 18 张 | 21.8 MB | 本品库自己的投喂（QQ 里存下来的）+ 从 `dsh-pet` 动作 webm 转的透明 GIF | CC BY 4.0（作品本身权利归创作者，商用自行确认） |

其中 `pet-*.gif` 由 [dsh-pet](https://www.npmjs.com/package/dsh-pet) 的动作动画转制（抽帧 + 亮度当 alpha）；如不希望这样再分发，删掉这 12 个文件即可，不影响插件运行。

## 2. 只有标签、不随仓库分发的图（596 张）

| 来源 | 张数 | 上游 / 说明 | 许可 |
| --- | --- | --- | --- |
| deepseek 系 | 266 | 见 `sources.yaml`（fisharchive 等） | 见上游仓库 |
| 大肥鱼系（nekowhale） | 265 | [dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers) → kiriyuki.com | CC BY-NC 4.0（署名 + 禁商用） |
| 精选（合并去重后） | 65 | 多为上面两套里挑出来的，文件名重命名过（2026-10-30 用 SHA-256 逐字节反查确认） | 随上游 |
| 本库投喂 | 18 | 随仓库分发 | CC BY 4.0 |

图不随仓库走，跑 `sticker-hub pull` 自己拉，标签表里的条目就能对上文件。

## 3. 我们自己的部分

- 代码：MIT（见 `LICENSE`）
- 标签数据（`resources/index-all.md`、`resources/_all.json`、`resources/tags-synonyms.json`）：CC BY 4.0，署名即可自由使用、修改、再分发
- 情绪分布：卖萌 97 / 无语 79 / 搞怪 74 / 委屈 59 / 开心 58 / 得意 40 / 兴奋 36 / 摸鱼 33 / 生气 31 / 困倦 26 / 惊讶 19 / 敷衍 18 / 嘲讽 16 / 害羞 16 / 鼓励 5 / 平静 5 / 难过 2

## 4. 必须知道的一条

大肥鱼系那 265 张来自上游，**CC BY-NC 4.0 禁止付费提供或商用**。本仓库不分发它们，只保留标签；你要用就得自己 pull、遵守上游条款、保留原作者链接。
