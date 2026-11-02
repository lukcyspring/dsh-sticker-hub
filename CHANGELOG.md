# 更新记录

## 0.1.7（2026-11-02）

**改（回退到「最早能用的玩法」）**
- `sticker_send` 默认**只挑图**：返回图的名字 + 相对路径，由调用方自己用发文件工具发（`qqbot_send_file` 这种带会话上下文的调用）。理由：插件内部代发走 `tools.execute`，在 bridged exec 里拿不到会话上下文，会「返回成功但什么也没发」，之前还把它渲染成 `已发 X`，属于谎报。
- `sendFileTool` 默认从 `qqbot_send_file` 改成空串；填了才尝试自己发（成功率取决于宿主，不建议）。
- 渲染口径：发出去了显示 `已发 X`，只挑图显示 `挑好了 X`，失败显示 `未发出：原因`。
- 留 `~/.dsh/sticker-hub/send-debug.log` 诊断（`start`/`bot-ok`/`bot-fail`/`tools-probe`/`tool-ok`/`tool-fail`）。

**说明**
- 这条路径从 0.1.0 初始提交起就没改过（`git log -S "async function sendSticker"` 只有 `821418e` 一处），跟后来借鉴别的表情包项目**无关**；「最早能用」的是模型自己调发文件工具那条路。

## 0.1.6（2026-11-02）

**加**
- `sticker_send` 写 `~/.dsh/sticker-hub/send-debug.log`：记 `hasBot`/`botName`/可用方法、每条发送路径的返回值与错误。

## 0.1.5（2026-11-02）

**修**
- `sticker_send` 假成功：走 `tools.execute('qqbot_send_file')` 时不带会话 target，宿主在 bridged exec 里没有会话上下文，于是「返回成功但什么也没发」，日志还显示 `已发 X`。现在优先用 `globalThis.__qqBot.sendImage/sendFile(target, {localPath})` 直发（和表情包标记补丁同一条路），并且没显式 `target` 时从 `~/.dsh/sticker-hub/peer-map.json` 取最近一次 QQ 会话；两条都不行才退回 `tools` 通道。
- 底层工具失败时不再谎报 `已发`：`sendImage`/`sendFile` 抛错会带着原因落到 `未发出：…`。

## 0.1.4（2026-11-02）

**改**
- `sticker_send` 不再只认精确相对路径：传裸文件名（`8N03_xxx.gif`）或名字（`摸鱼鱼`）也能命中；找不到时错误信息改成「图库里没有 X（可以是名字、文件名或 gallery/xxx.gif 这样的相对路径；用 sticker_search 先找）」，不再报成「文件不存在 + 绝对路径」那种像丢图的误导
- `resources/sources.yaml` 的本地投喂目录从 `./feed` 改成 `./gallery`（单目录改造漏网），`pull` 不会再照旧建出废目录
- README 的图片路由示例改成 `gallery/xxx.gif`

**加**
- 冒烟测试补三条：裸文件名命中、名字命中、找不到时的提示可操作

## 0.1.3（2026-10-30）

**改**
- 图库改成**只有一个目录**：所有图都在 `gallery/`，不再按来源分子目录；`ingest`（`sticker_learn` / QQ 里收到新图）也统一落 `gallery/`
- `pull` 拉下来的图按内容哈希（sha256）去重后落进 `library/gallery/`，同名冲突加来源前缀，不再建 `<id>/` 子目录
- `resources/` 用同一策略重排：`resources/gallery/`（18 张）+ `index-all.md` + `_all.json`（每条带 `origin`）+ `tags-synonyms.json` + `sources.yaml` + `ATTRIBUTION.md`；旧 `resources/feed/` 删除
- 标签表按内容去重：680 张 → **614 张**，重复的 66 张不再重复列；同义词归并后词表 4483 → **4202**（`tags-synonyms.json` 74 组）
- `ATTRIBUTION.md` 按去重后的来源重算（ds 266 / 大肥鱼系 265 / 精选 65 / 投喂 18），并说明精选那批是用 SHA-256 逐字节反查确认来自前两套

**修**
- `bin/sticker-hub.mjs` 的 `pull` 漏 `createHash` 导入会在运行期 `createHash is not defined`

## 0.1.2（2026-10-30）

**加**
- `resources/`：18 张现成表情包（我们自己的投喂 + 从 dsh-pet 动作转的透明 GIF）+ 680 张的完整标签表（`index-all.md` / `_all.json`）+ `ATTRIBUTION.md` 逐来源许可说明
- `tools/build-resources.mjs`：从本地图库重新生成 `resources/`（`STICKER_LIB` 可覆盖源目录）
- 其余 662 张只留标签、图靠 `bin/sticker-hub.mjs pull` 从上游拉，其中 nekowhale 那 322 张是 CC BY-NC 4.0，不分发、不商用

**注**
- `resources/` 不进 npm 包（`files` 未列），只在 Git 仓库里

## 0.1.1（2026-10-30）

**修**
- 干净检出（没有 `node_modules`）跑 `npm test` 会 `ERR_MODULE_NOT_FOUND`：`@deepseek-ai/schemastery` 改成可选导入，宿主没提供时退化成同形骨架，于是单独评审/测试也能跑
- `docs/MARKER.md` 末尾多一个 `\r`，与仓库里其他文件行尾不一致

**顺手**
- `schemastery` 标为可选 peer 依赖（`peerDependenciesMeta.optional`）
- smoke 测试不再把 PNG 二进制打到日志里

## 0.1.0（2026-10-30）首个公开版本

**库**
- 一个目录 + 一份 `index-all.md` 表格就是图库，人可读、可 git 管
- 按内容检索（中文二元组 + 字段权重 + 覆盖度惩罚 + 用过的图降权）
- `pull / tag / stats` 三个 CLI 子命令；`sources.yaml` 只记来源不存图

**工具（6 个）**
- `sticker_search` / `sticker_send` / `sticker_learn` / `sticker_battle` / `sticker_stats` / `sticker_show`

**通道**
- 任意「发文件」工具都能发（默认 QQ 的 `qqbot_send_file`）
- GUI 内联图：`/sticker-hub/img?p=…` 只读路由，只 loopback、锁死图库目录
- 正文标记 `[sticker:名字]`：QQ 走通道补丁、GUI 走客户端渲染，一个写法两个通道

**大战**
- 三种进入方式：设置页开关、触发词、连发 N 张
- 可选硬模式：出站拦截，连 agent 的文字都掐掉（见 `docs/HARD-MODE.md`）

**开发**
- `npm test` 自带冒烟测试，假 ctx + 临时图库，不碰本机数据
