# dsh-sticker-hub

给 DeepSeek Harness（DSH）装一套**表情包库**：本地打标、语义检索、自动配图、以及「表情包大战」模式——你发一张，它回一张，一个字都不说。

插件本身**不带任何图片**，也不带任何密钥。图从哪来、用哪个识图模型、花谁的钱，全在你自己机器上决定。

```
MIT · 纯 JS 无运行时依赖 · Node ≥ 20 · 在 Windows 11 + DSH 桌面版 + QQ 官方机器人通道上实测
```

> **最短路径**：装插件 → 设置页填图库目录 → `node bin/sticker-hub.mjs pull` → `tag` → 在聊天里说「发个摸鱼的表情包」。
> 没有 QQ 也能用（工具 + GUI 内联图照常）；想玩大战才需要图片收发通道。

---

## 0. 能干什么

| 能力 | 说明 |
| --- | --- |
| 本地图库 | 一个目录 + 一份 `index-all.md` 表格，人可读、可 git 管 |
| 打标 | 用你配的识图模型给新图生成「名字 / 情绪 / 标签 / 什么时候用」 |
| 检索 | 按想表达的意思找图（`无语`、`庆祝`、`摸鱼`），带防复读降权 |
| 发送 | 交给任意「发文件」工具（默认 QQ 的 `qqbot_send_file`），不回文字 |
| 大战 | 开关 / 触发词 / 连发三张 任一条件进入，之后只回图 |
| GUI 内联图 | 聊天窗口里直接显示表情包（不需要 QQ / IM 通道） |
| 设置页 | DSH 界面「设置 → 表情包库」直接改，不用重启 |

### 0.1 GUI 里直接发图

插件注册一条只读图片路由：

```text
/sticker-hub/img?p=feed/xxx.gif      ← 相对地址，端口漂移也不怕
/sticker-hub/img/feed/xxx.gif        ← 前缀式备胎
```

`sticker_show` 工具就是拼这条地址返回 markdown（`![名字](/sticker-hub/img?p=…)`），聊天窗口里直接出图，不走 IM 的文件通道。
路由只接受回环地址（`127.0.0.1` / `::1`），路径锁死在图库目录内。

实测：DSH 桌面版聊天窗能直接渲染（2026-10-30 验证）。要是某个前端版本过滤了相对地址，就换同源绝对地址；再不行只能走真正的上传通道。


---

## 1. 三个前提

### 1.1 DSH 装好并且能跑

- 桌面版或 CLI 都行，Node ≥ 20。
- 能打开设置、能装插件（`~/.dsh/profiles/<name>/`）。

### 1.2 接一个能收发图片的 IM 通道（推荐 QQ）

想要「大战」必须有能看图、能发图的通道。QQ 的做法：

1. 打开 <https://q.qq.com>，注册开发者 → 创建**机器人应用**（个人开发者可选「沙箱」）。
2. 记下 **AppID** 与 **AppSecret**。
3. 「开发管理 → 沙箱配置 → 添加群聊」，把你的测试群号填进去（不填的话机器人进不了群，也搜不到）。
4. 在 DSH 里装通道插件并填凭据：

   ```bash
   dsh plugin --profile desktop add @tencent-connect/dsh-qqbot
   ```

   重启 DSH，用手机 QQ 扫码绑定，或直接在 `cordis.patch.yml` 里填 `appId` / `appSecret`。
5. 私聊机器人发一句话，能回话就通了。

> 没有 QQ 也能用插件：工具和检索照常，只是发不出去（`sticker_send` 会把文件路径还给你）。

### 1.3 配一个识图模型

只有「给新图自动打标」需要它。**任意 OpenAI 兼容的 vision endpoint 都行**：

```jsonc
// 例子：OpenAI
{ "baseUrl": "https://api.openai.com", "model": "gpt-4o-mini" }

// 例子：DMXAPI / 各类中转（价低，注意别把 key 写进仓库）
{ "baseUrl": "https://www.dmxapi.cn", "model": "qwen3.5-flash" }

// 例子：本地 ollama（免费，慢一点）
{ "baseUrl": "http://127.0.0.1:11434", "model": "qwen2.5vl:7b" }
```

密钥**不要写在插件配置里**，写一个一行文本文件（例：`C:/Users/you/.dsh/vision-key.txt`），把路径填给 `keyFile`。插件只读那一行，日志里也不会打印。

---

## 2. 装插件

```bash
# 方式 A：直接从 GitHub 装
dsh plugin --profile desktop add github:lukcyspring/dsh-sticker-hub

# 方式 B：从本地目录（开发中，改完代码立刻见效）
cd ~/.dsh/profiles/desktop
npm install /path/to/dsh-sticker-hub --no-save

# 方式 C：发布到 npm 之后
dsh plugin --profile desktop add dsh-sticker-hub
```

装完重启 DSH。设置里会出现「表情包库」一页。

> **装不上/装上了但不显示**：DSH 的插件要同时出现在 profile `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 里，只加依赖不写 bundles，宿主不会去加载它。

---

## 3. 拉图库

插件仓库里的 `sources.yaml` 只记来源，不存图：

```yaml
sources:
  - id: my-source
    repo: https://github.com/<owner>/<repo>
    subdir: stickers        # 仓库里图片所在目录
    license: 见仓库 README  # 会原样写进入库条目
```

```bash
node bin/sticker-hub.mjs pull            # 全部拉
node bin/sticker-hub.mjs pull dsh-meme   # 只拉一个
node bin/sticker-hub.mjs stats           # 看看有多少张
```

`pull` 走 GitHub 的 tarball（`api.github.com/repos/<owner>/<repo>/tarball`），**不用装 git**；解包用系统自带的 `tar`。
`subdir` 没填的条目不拉（图不在仓库里，比如 nekowhale 走自建镜像分发）。

图片落在 `~/.dsh/sticker-hub/library/<id>/`，索引是同目录的 `index-all.md`。

**自己的图**：直接丢进 `library/feed/`，再跑一次打标即可。

---

## 4. 打标

```bash
node bin/sticker-hub.mjs tag --limit 20   # 先试 20 张，看看质量
node bin/sticker-hub.mjs tag              # 全量
```

或者在聊天里让 agent 做：

> 把 `~/Downloads/猫猫搓手.gif` 存进表情包库

agent 会用 `sticker_learn` 调识图模型，自动补名字、情绪、标签和「什么时候用」，然后写进 `index-all.md`。

打标质量的两个经验：

- **GIF 要抽三帧拼图再送模型**。只给中间一帧，模型会把「捏脸」读成「吹气」、「搓手」读成「加油」。
- 标签写「在做什么」不写「像谁」。角色名可以留一两个，但动作才是检索时真正会命中的东西。

---

## 5. 用起来

### 5.1 工具

| 工具 | 干什么 |
| --- | --- |
| `sticker_search` | 按意思找候选，返回名字/情绪/标签/什么时候用 |
| `sticker_send` | 发一张（`query` 自动挑、或 `path` 指定） |
| `sticker_learn` | 把一张图入库并打标 |
| `sticker_battle` | 大战开 / 关 / 查状态 / 记一次「收到图」 |
| `sticker_stats` | 库有多大、标签多密、大战开没开 |

### 5.2 表情包大战

三种任一条件进入：

1. 设置页把「表情包大战」打开；
2. 聊天里发一句触发词（默认 `表情包的大战` / `表情包大战` / `开战`）；
3. **连续发三张表情包**（默认阈值 3，可在设置页改）。

进入之后：**只回图，不写字**。收到你的图 → 识图 → 在库里找最贴的那张 → 发回来。

它怎么知道你在发图？通道插件会把下行图片存成本地文件并把路径交给 agent；agent 调 `sticker_learn`（可选入库）或 `sticker_search` + `sticker_send`。

> 想让它更快、更狠（连 agent 输出文字都掐掉），见 `docs/HARD-MODE.md` 里的出站拦截补丁——**改的是通道插件的 dist，升级会覆盖，自己权衡**。

### 5.3 正文标记 `[sticker:名字]`（推荐）

在回复正文里写 `[sticker:变身]`，通道层把它拆成「文字段 + 图片段」按顺序发出去：图的位置由文字决定、QQ 和 GUI 一个写法、省一次工具往返。名字找不到就用情绪词同类随机；都对不上就丢掉标记、绝不硬凑。

两个通道各走各的，都是这一句标记：

- **QQ**：改通道插件的 `dist/transport/outbound.js`（与 HARD-MODE 同一个位置），装法与注意事项见 `docs/MARKER.md`。
- **GUI**：插件自带客户端渲染——盯 DOM 把标记换成 `<img>`（走 `/sticker-hub/api/pick` 换地址）。设置页「界面渲染标记」可以关；被前端重渲染覆盖时最多退回成文字，不影响聊天。

---

## 6. 设置页

「设置 → 表情包库」：

- 大战开关、触发词、连发阈值
- 图库目录（默认 `~/.dsh/sticker-hub/library`）
- 识图 Base URL / 模型 / 密钥文件路径
- 实时显示库大小与各来源张数

改完立刻生效，不用重启（服务端每次调用都重读 `state.json`）。

---

## 7. 常见问题

| 症状 | 原因 / 处理 |
| --- | --- |
| `图库是空的` | 没跑 `pull`，或 `libraryDir` 指错了 |
| `识图未配置` | 设置页没填模型，或 `keyFile` 路径不对；也可临时用环境变量 `STICKER_VISION_KEY` |
| `识图 HTTP 401/403` | 密钥不对，或这个中转不支持 `image_url` 那种格式 |
| `识图 HTTP 400` | 图片太大（默认上限 8 MB）或 base64 后超限；GIF 先用 Pillow 抽帧 |
| 发不出图 | 通道没有「发文件」工具，或文件不在允许目录内（QQ 默认只允许 media + 工作目录） |
| 同一张图反复发 | 用了旧版本；现在有「最近用过的降权」，可把 `avoidWindow` 调大 |
| 大战模式不退出 | 设置页关掉，或让 agent 调 `sticker_battle {action:"off"}` |

---

## 8. 版权与开源边界

- 插件仓库**不含图片**，只含 `sources.yaml`（仓库地址 + 许可说明）和代码。
- 用户自己跑 `pull`，图片就留在用户自己的机器上，许可归属原仓库。
- 插件不含任何 key / token / 内网地址。`~/.dsh/sticker-hub/state.json` 只在你本机。
- 代码 MIT；图片按各自来源的许可，**转载图库前先看人家 README**。

---

## 9. 卸载

```bash
dsh plugin --profile desktop remove dsh-sticker-hub
rm -rf ~/.dsh/sticker-hub     # 图库与状态，自己确认后再删
```

---

## 10. 开发

```bash
npm test          # 冒烟测试：假 ctx + 临时图库，不碰你本机数据
```

| 文件 | 干什么 |
| --- | --- |
| `index.js` | 服务端：配置、图库解析、检索、识图、路由、6 个工具、`createBridge()` |
| `client.js` | 设置页 + `[sticker:]` 的界面渲染器（MutationObserver 换 `<img>`） |
| `bin/sticker-hub.mjs` | `pull` / `tag` / `stats` 三个 CLI 子命令 |
| `sources.yaml` | 图库来源清单（仓库地址 + 许可），只有元数据 |
| `docs/HARD-MODE.md` | 出站拦截的硬模式补丁（连文字都不发） |
| `docs/MARKER.md` | `[sticker:名字]` 两个通道的接法 |

状态全在 `~/.dsh/sticker-hub/state.json`（可用 `DSH_HOME` 改根目录），服务端每次调用都重读，所以改配置不用重启；改 `client.js` 要重启宿主才会重新加载。
