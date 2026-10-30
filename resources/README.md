# resources —— 表情包与标签数据

给 [dsh-sticker-hub](../README.md) 用的资源包。**结构和本地图库一样：图在一个目录里，索引只有一份。**

```
resources/
├─ gallery/            18 张随仓库分发的图（其余图自己 pull）
├─ index-all.md        614 张的标签表（文件 / 名字 / 情绪 / 标签 / 什么时候发）
├─ _all.json           同一份数据的 JSON 版，带 origin（合并前的路径）
├─ tags-synonyms.json  标签同义词表，4202 个词统一后
├─ sources.yaml        上游图库清单，sticker-hub pull 用
└─ ATTRIBUTION.md      每个来源的许可
```

## 用它

```bash
npm i -D dsh-sticker-hub
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs pull    # 按 sources.yaml 拉上游图，统一落到 library/gallery/
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs tag     # 给没进索引的图打标
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs stats   # 看看现在多少张
```

把 `resources/gallery/` 也拷进同一个 `library/gallery/`，标签表就能对上其中一部分；剩下的按 `ATTRIBUTION.md` 自己去上游取。

许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。
