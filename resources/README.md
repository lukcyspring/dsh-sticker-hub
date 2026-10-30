# resources —— 表情包与标签数据

给 [dsh-sticker-hub](../README.md) 用的资源包。

| 文件 | 说明 |
| --- | --- |
| `feed/` | 18 张随仓库分发的表情包（我们自己的投喂 + dsh-pet 转的桌宠动作） |
| `index-all.md` | 680 张表情包的标签表（名字 / 情绪 / 标签 / 什么时候用） |
| `_all.json` | 同上，JSON 版，给插件和脚本读 |
| `sources.yaml` | 上游图库清单，`sticker-hub pull` 用 |
| `ATTRIBUTION.md` | 每个分区的来源与许可 |

## 只想拿标签

```bash
npm i -D dsh-sticker-hub
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs pull   # 拉上游图库
```

## 想连图一起用

把 `feed/` 里的图和 `sources.yaml` 拉下来的图合并进图库目录，再让插件指向它：

```bash
node node_modules/dsh-sticker-hub/bin/sticker-hub.mjs stats --dir <你的图库>
```

许可见 [ATTRIBUTION.md](ATTRIBUTION.md)。
