# 更新记录

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
