# 来源与许可（ATTRIBUTION）

两张表：**本仓库随附的文件** 与 **只有标签、需要你自己 pull 的图**。
标签数据（`index-all.md`、`_all.json`）由本仓库整理，覆盖 680 张表情包；图片本身只有 `resources/feed/` 下这 18 张随仓库分发。

## 1. 随仓库分发的文件

| 目录 | 数量 | 大小 | 来源 | 许可 |
| --- | --- | --- | --- | --- |
| `resources/feed/` | 18 张 | 21.8 MB | 本品库自己的投喂（QQ 里存下来的）+ 从 `dsh-pet` 的动作 webm 转的透明 GIF | CC BY 4.0（可改，见下） |

其中 `feed/pet-*.gif` 由 [dsh-pet](https://www.npmjs.com/package/dsh-pet) 的动作动画转制（抽帧 + 亮度当 alpha），素材版权归原作者；如不希望这样再分发，删掉这 12 个文件即可，不影响插件运行。

## 2. 只有标签、不随仓库分发的图（680 张）

| 分区 | 张数 | 上游 | 许可 |
| --- | --- | --- | --- |
| 根目录（精选 69） | 69 | 见下方「根目录这 69 张的出处」 | 随来源，不随仓库分发 |
| 大肥鱼 | 286 | [dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers) | CC BY-NC 4.0（署名 + 禁商用） |
| 大肥鱼和GPT娘 | 36 | [dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers) | CC BY-NC 4.0（署名 + 禁商用） |
| ds | 271 | deepseek 系表情包（上游见 `sources.yaml`） | 见上游仓库 |
| 投喂 | 6 | 本地投喂 | CC BY 4.0 |
| 桌宠 | 12 | 本地投喂 | CC BY 4.0 |

### 根目录这 69 张的出处（2026-10-30 用文件哈希反查确认）

一开始只知道"根目录 69 张、出处待考"。拿 SHA-256 和图库里另外两套逐字节比对，结果很干净：

| 张数 | 实际来源 |
| --- | --- |
| 59 | 与 `大肥鱼/` 分区**逐字节相同** → 上游同 `dsh-nekowhale-stickers`（kiriyuki.com，作者「可以叫我云大人 / 雾雪」），CC BY-NC 4.0 |
| 2 | 与 `大肥鱼和GPT娘/` 分区逐字节相同 → 同一上游 |
| 5 | 与 `ds/` 分区逐字节相同（`deepseek-si-diao-le.png`、`deepseek-xia-ban-fei-ben.png`、`deepseek-pa-zhe-shui-jiao.png`、`deepseek-chi-baobao-mo-duzi.png`、`deepseek-maozhengqi.png`）→ 上游 fisharchive.cc 同人二创 |
| 3 | 无同哈希文件：`money.gif`、`petpet.gif`、`whale-idle.png` —— 最早那版是从 `dsh-whale-widget` 插件的 `assets/` 拷来的（该插件已卸载），原出处已不可考 |

所以"根目录精选"不是第三套独立素材，是上面两套里挑出来、改成英文语义名的那一部分（外加最早那 3 张）。署名请按上表走 `nekowhale` 与 `ds` 的条款。

跑 `sticker-hub pull` 会把上游仓库拉到本地图库，标签表里的条目就能对上文件。

## 3. 我们自己的部分

- 代码：MIT（见 `LICENSE`）
- 标签数据（`resources/index-all.md`、`resources/_all.json`）：CC BY 4.0 —— 可自由使用、修改、再分发，署名即可
- `resources/feed/` 下的图：CC BY 4.0（作品本身的权利归创作者；若你打算商用，请自行确认）

## 4. 必须知道的一条

`nekowhale` 那 322 张（大肥鱼 286 + 大肥鱼和GPT娘 36）的图来自上游，**CC BY-NC 4.0 禁止付费提供或商用**。本仓库不分发它们，只保留标签；你要用就得自己 pull、并遵守上游条款、保留原作者链接。
