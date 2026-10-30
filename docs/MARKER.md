# 正文标记 `[sticker:名字]`（推荐姿势）

## 为什么

走工具调用发图，图的位置和顺序由模型自己排，容易插错地方，而且 QQ 与 GUI 要各写一套。
改成「模型在正文里写标记，通道层拆包」，一句话就解决三件事：**图的位置由文字决定、QQ 和 GUI 同一个写法、少一次工具往返**。

## 长什么样

正文里随便哪儿写：

```
行吧，本鱼陪你走一趟。

[sticker:变身]

图放这儿了。
```

- `[sticker:变身]` —— 按名字找（先全名，再文件名前缀）。
- `[sticker:委屈]` —— 名字对不上就按**情绪词**同类随机挑一张。
- 都没有？标记丢掉，文字照发，后台记一条 warn；绝不硬凑一张不对题的图。
- 一行可以写多个，出现几次发几张。

## 怎么接

标记写在正文里，正常聊天通道会把 `[sticker:变身]` 当文字发出去——所以要在通道层做一次拆包：

1. 通道插件把「模型输出文本」切开：文字段留在原地，图片段换成发图；
2. 发图用本机绝对路径，走通道自己的发图能力；
3. 流式输出时，标记可能被 chunk 劈成 `[stick` + `er:变身]`，切段逻辑要能把尾巴扣住（只扣 `[sticker:` 前缀，别把普通方括号也扣了）。

参考实现：`tools/patch-sticker-marker.mjs`（约 150 行，幂等，`--check` 看打没打、`--revert` 退回原文件、改前自动备份 `outbound.js.bak-marker-<ISO>`）。
它改的是 QQ 通道插件 `@tencent-connect/dsh-qqbot` 的 `dist/transport/outbound.js`，要点：

- 类字段 `__smPending`：按会话扣住没写完的标记尾巴；
- `__smRewrite(sessionId, text, flush)`：返回 `{text, markers, full}`；
- `__smSegments(sm)` / `__smSendSegments(record, text)`：按段顺序「文字 → 图 → 文字」发；
- `onChunk`：有标记就按段推，先 flush 已缓冲的文字再发图；
- `onMessage`：非流式整段一次到，走 `__smSendSegments`；
- `onTurnEnd`：清 pending。

**升级会覆盖 dist**，所以升级后要重打一遍（`node tools/patch-sticker-marker.mjs`）。

## GUI 怎么办

GUI 不用改通道插件：插件自带客户端渲染器——`MutationObserver` 盯聊天区文本节点，把 `[sticker:名字]` 换成 `<img>`（先向 `/sticker-hub/api/pick?q=` 换绝对地址；名字对不上就把标记抹掉，不留残字）。

- 设置页「界面渲染标记」可以关掉；
- 前端重渲染会把文本改回去，最坏结果是标记又露出来（不会崩），刷新页面即恢复；
- 想最保险就用 `sticker_show`（返回 `![名字](绝对地址)` 的 Markdown 图）。

## 给模型的说明（可以抄进系统提示）

> 想发表情包时，在正文里写 `[sticker:名字]`（名字不记得就写情绪词，如 `[sticker:委屈]`）。不要为此单独调工具，也不要在标记前后加解释。

## 附：v4 的坑（2026-10-30）

出站路由 \OutboundRouter\ 手里的 \ot\ 是个只有 \sendMarkdown\/\openStream\ 的瘦适配器（\gateway/bootstrap.js\ 里现搭的），直接 \	his.bot.sendImage(...)\ 会报 \sendImage is not a function\。v4 的补丁在 bootstrap 里加了 \globalThis.__qqBot = bot\，发图优先用它。日志出现 \image-no-api\ 就说明这条又退了。

