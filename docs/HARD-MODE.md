# 硬拦截模式（可选）

默认的「大战」是**软**的：靠 system prompt + `sticker_send` 工具，模型会自己只发图不写字。
软模式的好处是不动任何第三方代码、升级不炸；坏处是遇上不听话的模型，偶尔会漏出一句话。

硬模式把**出站文字直接掐掉**：在通道插件的出站路由里看一眼「大战是否开着」，开着就把文本事件丢掉，只放行 `qqbot_send_file` 发出的图。

## 拦截点

以 `@tencent-connect/dsh-qqbot` 为例（`dist/transport/outbound.js`）：

```js
route(session, raw) {
  const event = parseEvent(raw);
  if (event === undefined) return;

  // ← 加在这里
  if (globalThis.__stickerHub?.battle?.() === true) {
    if (event.type === 'assistant/chunk' || event.type === 'assistant/message' || event.type === 'tool/result') {
      return; // 文字一律不出站
    }
  }

  ...
}
```

插件在 `apply()` 末尾已经把 `globalThis.__stickerHub` 挂上了（`battle()` / `search()` / `abs()` / `usage()`），所以补丁只加这一段就够。

## 应用方式

```bash
# 1. 备份
cp node_modules/@tencent-connect/dsh-qqbot/dist/transport/outbound.js{,.bak-$(date +%s)}

# 2. 手工插入上面那 6 行，或写个 idempotent 补丁脚本（推荐，重装后能重放）

# 3. 重启 DSH
```

**代价**：改的是别人的 dist，插件升级会覆盖；换通道（飞书、微信）要各自再找拦截点。
所以硬模式**不是默认行为**，只给「就要快、就要狠」的人用。
