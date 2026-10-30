/**
 * dsh-sticker-hub — 客户端半边（设置页）。
 *
 * 只做一件事：一个能在 GUI 里改的面板——大战开关、触发词、连发阈值、图库目录、识图模型。
 * 服务端是 index.js 的 /sticker-hub/api/config（只允许 loopback）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-sticker-hub',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const API = '/sticker-hub/api/config';

    const CSS = [
      '.sh-wrap{padding:16px 18px;font-size:13px;line-height:1.55}',
      '.sh-row{display:flex;align-items:center;gap:10px;margin:10px 0}',
      '.sh-lab{width:132px;flex:0 0 auto;opacity:.75}',
      '.sh-in{flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;font:inherit}',
      '.sh-in:focus{outline:none;border-color:rgba(90,150,255,.8)}',
      '.sh-btn{padding:6px 14px;border-radius:6px;border:1px solid rgba(128,128,128,.35);background:rgba(90,150,255,.14);color:inherit;font:inherit;cursor:pointer}',
      '.sh-btn:hover{background:rgba(90,150,255,.24)}',
      '.sh-btn[disabled]{opacity:.5;cursor:default}',
      '.sh-tip{opacity:.6;font-size:12px;margin-top:4px}',
      '.sh-ok{color:#3aa76d}.sh-err{color:#d9534f}',
      '.sh-sep{height:1px;background:rgba(128,128,128,.18);margin:14px 0}',
      '.sh-stk{display:inline-block;max-height:180px;max-width:100%;vertical-align:middle;margin:3px 2px;border-radius:8px}',
    ].join('\n');

    function Row(props) {
      return h('div', { className: 'sh-row' },
        h('div', { className: 'sh-lab' }, props.label),
        props.children);
    }

    function Panel() {
      const [cfg, setCfg] = React.useState(null);
      const [msg, setMsg] = React.useState('');
      const [busy, setBusy] = React.useState(false);

      const load = React.useCallback(() => {
        fetch(API, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => { if (j.ok) setCfg(j); else setMsg(j.error || '读取失败'); })
          .catch((e) => setMsg(String(e)));
      }, []);
      React.useEffect(load, [load]);

      const save = () => {
        setBusy(true);
        const body = {
          battle: Boolean(cfg.battle),
          triggerWords: String(cfg.triggerWordsText || (cfg.triggerWords || []).join(','))
            .split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
          streakThreshold: Number(cfg.streakThreshold) || 3,
          libraryDir: cfg.libraryDir || '',
          vision: {
            baseUrl: (cfg.vision && cfg.vision.baseUrl) || '',
            model: (cfg.vision && cfg.vision.model) || '',
            keyFile: (cfg.vision && cfg.vision.keyFile) || '',
            apiKey: (cfg.vision && cfg.vision.apiKey) || '',
          },
        };
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then((r) => r.json())
          .then((j) => { setMsg(j.ok ? '已保存（立刻生效，不用重启）' : (j.error || '保存失败')); load(); })
          .catch((e) => setMsg(String(e)))
          .finally(() => setBusy(false));
      };

      if (!cfg) return h('div', { className: 'sh-wrap' }, '读取中…', msg ? h('div', { className: 'sh-err' }, msg) : null);

      const packs = cfg.packs || {};
      return h('div', { className: 'sh-wrap' },
        h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 } }, '表情包库'),
        h('div', { className: 'sh-tip' },
          `共 ${cfg.total || 0} 张 · `,
          Object.entries(packs).map(([k, v]) => `${k} ${v}`).join(' / ') || '空库',
          ` · 目录 ${cfg.libraryDir || ''}`,
          cfg.libraryDirExists === false ? h('span', { className: 'sh-err' }, ' ← 这个目录不存在') : null),

        h('div', { className: 'sh-sep' }),

        h(Row, { label: '表情包大战' },
          h('input', {
            type: 'checkbox', checked: Boolean(cfg.battle),
            onChange: (e) => setCfg({ ...cfg, battle: e.target.checked }),
          }),
          h('span', { className: 'sh-tip' }, '开启后只回表情包、不写字')),

        h(Row, { label: '触发词' },
          h('input', {
            className: 'sh-in',
            defaultValue: (cfg.triggerWords || []).join('，'),
            placeholder: '表情包的大战，表情包大战',
            onChange: (e) => setCfg({ ...cfg, triggerWordsText: e.target.value }),
          })),

        h(Row, { label: '连发几张进入' },
          h('input', {
            className: 'sh-in', type: 'number', min: 1, max: 10,
            defaultValue: cfg.streakThreshold || 3,
            onChange: (e) => setCfg({ ...cfg, streakThreshold: Number(e.target.value) }),
          })),

        h(Row, { label: '图库目录' },
          h('input', {
            className: 'sh-in',
            defaultValue: cfg.libraryDir || '',
            placeholder: '留空 = ~/.dsh/sticker-hub/library（也可以填你自己已有的表情包目录）',
            onChange: (e) => setCfg({ ...cfg, libraryDir: e.target.value }),
          }),
          h('span', { className: 'sh-tip' }, '目录里要有一份 index-all.md 表格；改完点保存，立刻生效')),

        h(Row, { label: '界面渲染标记' },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('input', {
              type: 'checkbox',
              defaultChecked: cfg.guiMarkers !== false,
              onChange: (e) => setCfg({ ...cfg, guiMarkers: e.target.checked }),
            }),
            h('span', { className: 'sh-tip', style: { marginTop: 0 } }, '正文里的 [sticker:名字] 直接显示成图（刷新页面生效）'))),

        h('div', { className: 'sh-sep' }),
        h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '识图模型（给新图自动打标）'),

        h(Row, { label: 'Base URL' },
          h('input', {
            className: 'sh-in', placeholder: 'https://www.dmxapi.cn',
            defaultValue: (cfg.vision && cfg.vision.baseUrl) || '',
            onChange: (e) => setCfg({ ...cfg, vision: { ...cfg.vision, baseUrl: e.target.value } }),
          })),

        h(Row, { label: '模型 id' },
          h('input', {
            className: 'sh-in', placeholder: 'qwen3.5-flash / gpt-4o-mini',
            defaultValue: (cfg.vision && cfg.vision.model) || '',
            onChange: (e) => setCfg({ ...cfg, vision: { ...cfg.vision, model: e.target.value } }),
          })),

        h(Row, { label: '密钥文件' },
          h('input', {
            className: 'sh-in', placeholder: 'C:/Users/you/.dsh/vision-key.txt',
            defaultValue: (cfg.vision && cfg.vision.keyFile) || '',
            onChange: (e) => setCfg({ ...cfg, vision: { ...cfg.vision, keyFile: e.target.value } }),
          })),
        h('div', { className: 'sh-tip' },
          cfg.vision && cfg.vision.hasKey ? '密钥已就绪（文件里一行 api key，别提交进 git）' : '还没有读取到密钥'),

        h('div', { className: 'sh-sep' }),
        h('div', { className: 'sh-row' },
          h('button', { className: 'sh-btn', disabled: busy, onClick: save }, busy ? '保存中…' : '保存'),
          h('button', { className: 'sh-btn', onClick: load }, '刷新'),
          h('span', { className: msg.startsWith('已保存') ? 'sh-ok' : 'sh-err' }, msg)),
      );
    }

    // ── 正文标记 [sticker:名字] 在界面里渲染成图 ──────────────────────
    // 原理：盯 DOM，把文本节点里的标记换成 <img>。只在「消息已经落地」时动手，
    // React 重渲染会把文本改回去，所以同一节点处理过就记进 WeakSet；重渲染后
    // 若是全新节点会再处理一次。任何异常都不许影响聊天本身，全部吞掉。
    const MARK_RE = /\[sticker:([^\]\n]{1,80})\]/gu;
    const pickCache = new Map();

    function resolveMark(name) {
      const key = name.trim().toLowerCase();
      if (pickCache.has(key)) return pickCache.get(key);
      const p = fetch(`/sticker-hub/api/pick?q=${encodeURIComponent(name.trim())}`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((j) => (j && j.ok ? j : null))
        .catch(() => null);
      pickCache.set(key, p);
      return p;
    }

    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'PRE', 'CODE']);

    function ignorable(node) {
      const el = node.parentElement;
      if (!el) return true;
      if (SKIP.has(el.tagName)) return true;
      if (el.closest('pre,code,textarea,input,[contenteditable="true"],.sh-wrap')) return true;
      return false;
    }

    function spliceNode(node, index, len, url, alt) {
      const text = node.nodeValue || '';
      const before = text.slice(0, index);
      const after = text.slice(index + len);
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      const img = document.createElement('img');
      img.className = 'sh-stk';
      img.src = url;
      img.alt = alt || '';
      img.title = alt || '';
      img.loading = 'lazy';
      frag.appendChild(img);
      let tail = null;
      if (after) {
        tail = document.createTextNode(after);
        frag.appendChild(tail);
      }
      node.parentNode.replaceChild(frag, node);
      return tail;
    }

    async function processNode(start) {
      let node = start;
      for (let guard = 0; guard < 8 && node && node.isConnected; guard += 1) {
        const text = node.nodeValue || '';
        MARK_RE.lastIndex = 0;
        const m = MARK_RE.exec(text);
        if (!m) return;
        const hit = await resolveMark(m[1]);
        if (!node.isConnected) return;
        if (!hit) {
          // 图库里没有：标记直接抹掉，别把 [sticker:x] 露给用户
          node.nodeValue = text.slice(0, m.index) + text.slice(m.index + m[0].length);
          continue;
        }
        node = spliceNode(node, m.index, m[0].length, hit.url, hit.name);
      }
    }

    function installMarkerRenderer(ctx) {
      if (document.body?.dataset.shMarker === 'on') return;
      if (document.body) document.body.dataset.shMarker = 'on';

      // 面板里关掉了就别装
      let enabled = true;
      fetch('/sticker-hub/api/config', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((j) => { if (j && j.guiMarkers === false) enabled = false; })
        .catch(() => {});

      const queue = new Set();
      let timer = null;
      const flush = () => {
        timer = null;
        if (!enabled) { queue.clear(); return; }
        const nodes = [...queue];
        queue.clear();
        for (const n of nodes) processNode(n).catch(() => {});
      };
      const enqueue = (root) => {
        if (!root) return;
        if (root.nodeType === Node.TEXT_NODE) { queue.add(root); }
        else {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) if (n.nodeValue && n.nodeValue.includes('[sticker:')) queue.add(n);
        }
        if (queue.size && !timer) timer = setTimeout(flush, 700);
      };

      const mo = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'characterData') { if (r.target.nodeValue?.includes('[sticker:')) queue.add(r.target); }
          else for (const n of r.addedNodes) { if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE) enqueue(n); }
        }
        if (queue.size && !timer) timer = setTimeout(flush, 700);
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });

      ctx.effect(() => () => {
        try { mo.disconnect(); } catch { /* gone */ }
        if (timer) clearTimeout(timer);
        if (document.body) delete document.body.dataset.shMarker;
      }, 'sticker-hub: marker renderer');

      enqueue(document.body);
    }

    function apply(ctx) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-plugin', 'dsh-sticker-hub');
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
      ctx.effect(() => () => { try { styleEl.remove(); } catch { /* gone */ } }, 'sticker-hub: styles');

      try { installMarkerRenderer(ctx); } catch (e) { console.warn('[sticker-hub] 标记渲染没装上', e); }

      const slots = ctx.get('slots');
      if (!slots) { console.error('[sticker-hub] slots service missing'); return; }
      slots.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: 'sticker-hub',
        order: 62,
        label: '表情包库',
        title: '表情包库',
      }, () => h(Panel)));
    }

    return { inject: ['slots'], apply };
  },
});
