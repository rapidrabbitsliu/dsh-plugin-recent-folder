window.__ModuleLoader__.load({
  id: 'dsh-plugin-recent-folder',
  factory(require) {
    const React = require('react');
    const { createElement: h, useState, useEffect, useRef } = React;
    const NS = 'recent-folder';
    const KEY = 'dsh:recent-folder:v1';
    const dictionaries = {
      zh: { title: '选择工作区目录', hint: '默认打开上次工作区的父目录', home: '主目录', up: '上一级', go: '前往', path: '目录路径', open: '打开此目录', cancel: '取消', loading: '加载中…', empty: '此目录没有子文件夹', hidden: '显示隐藏文件夹', newFolder: '新建文件夹', name: '文件夹名称', create: '创建', fallback: '上次目录不可访问，已回到主目录。', truncated: '文件夹过多，仅显示开头部分。', location: '盘符 / 位置', storage: '浏览器未允许保存历史；本次页面内仍会记住目录。' },
      en: { title: 'Select Workspace Directory', hint: 'Starts in the parent of your last workspace', home: 'Home', up: 'Parent', go: 'Go', path: 'Directory path', open: 'Open this directory', cancel: 'Cancel', loading: 'Loading…', empty: 'No subfolders', hidden: 'Show hidden folders', newFolder: 'New folder', name: 'Folder name', create: 'Create', fallback: 'The previous directory is unavailable. Opened Home instead.', truncated: 'Too many folders; only the beginning is shown.', location: 'Drive / location', storage: 'Browser storage unavailable; history is remembered for this page only.' },
    };
    const css = `
.rf-mask{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;backdrop-filter:blur(5px);background:color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent)}
.rf-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;gap:16px;padding:24px;border:1px solid var(--dsw-alias-border-l1);border-radius:20px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.rf-dialog h2{font-size:18px;margin:0}.rf-hint{font-size:13px;color:var(--dsw-alias-label-secondary);margin:6px 0 0}.rf-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rf-path{flex:1;min-width:160px}.rf-dialog input{box-sizing:border-box;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}
.rf-dialog button{font:inherit;color:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 12px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}.rf-dialog button:hover{border-color:var(--dsw-alias-brand-primary)}.rf-dialog :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.rf-dialog button:disabled{opacity:.5;cursor:default}.rf-dialog .rf-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.rf-crumbs{display:flex;gap:6px;flex-wrap:wrap;max-height:90px;overflow:auto}.rf-crumbs button{padding:4px 7px;font-size:12px}.rf-list{min-height:150px;height:240px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:6px}.rf-list button{display:block;text-align:left;width:100%;border:0;background:transparent;overflow-wrap:anywhere}.rf-list button:hover{background:var(--dsw-alias-bg-layer-2)}.rf-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.rf-error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}.rf-note{font-size:13px;color:var(--dsw-alias-label-secondary)}
`;
    const errorText = e => e?.rpcError?.message || e?.message || String(e);
    const parentOf = listing => listing.crumbs.length > 1 ? listing.crumbs[listing.crumbs.length - 2].path : listing.path;
    // Scope each preference to its Host home as well as the browser origin.
    function createHistory(storage) {
      const memory = new Map();
      const unsaved = new Set();
      return {
        read(home) {
          if (unsaved.has(home)) return memory.get(home);
          try {
            const record = JSON.parse(storage()?.getItem(KEY) || '{}');
            const value = Object.hasOwn(record, home) ? record[home] : undefined;
            if (typeof value === 'string' && value) return value;
          } catch { /* Private mode or corrupt data: use in-memory history. */ }
          return memory.get(home);
        },
        save(home, path) {
          memory.set(home, path);
          unsaved.add(home);
          try {
            let record;
            try { record = JSON.parse(storage()?.getItem(KEY) || '{}'); } catch { record = {}; }
            if (!record || typeof record !== 'object' || Array.isArray(record)) record = {};
            const next = { ...record, [home]: path };
            const store = storage();
            if (!store) return false;
            store.setItem(KEY, JSON.stringify(next));
            unsaved.delete(home);
            return true;
          } catch { return false; }
        },
      };
    }
    return {
      inject: ['slots', 'uiWorkspace', 'locale'],
      apply(ctx) {
        const history = createHistory(() => window.localStorage);
        for (const [lang, dictionary] of Object.entries(dictionaries)) {
          ctx.effect(() => ctx.locale.register(NS, lang, dictionary));
        }
        function DirectoryFlow(props) {
          React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const t = ctx.locale.bind(NS);
          const [listing, setListing] = useState(null);
          const [draft, setDraft] = useState('');
          const [loading, setLoading] = useState(false);
          const [error, setError] = useState('');
          const [note, setNote] = useState('');
          const [hidden, setHidden] = useState(false);
          const [name, setName] = useState(null);
          const [creating, setCreating] = useState(false);
          const [submitting, setSubmitting] = useState(false);
          const dialog = useRef(null);
          const pathInput = useRef(null);
          const scan = useRef(null);
          const sequence = useRef(0);
          const generation = useRef(0);
          const owner = useRef(props);
          owner.current = props;
          const locked = props.busy || creating || submitting;
          const blocked = locked || loading;
          const close = () => { if (!locked) props.onCancel(); };
          async function navigate(path, initial = false) {
            scan.current?.abort();
            const controller = new AbortController();
            scan.current = controller;
            const seq = ++sequence.current;
            dialog.current?.focus();
            setLoading(true); setError(''); setName(null);
            try {
              let result;
              if (initial) {
                const home = await ctx.uiWorkspace.listDirectory(undefined, controller.signal);
                const previous = history.read(home.home);
                result = home;
                if (previous && previous !== home.path) {
                  try { result = await ctx.uiWorkspace.listDirectory(previous, controller.signal); }
                  catch (e) { if (controller.signal.aborted) throw e; setNote(t('fallback')); }
                }
              } else result = await ctx.uiWorkspace.listDirectory(path, controller.signal);
              if (!controller.signal.aborted && seq === sequence.current) {
                setListing(result); setDraft(result.path);
                dialog.current?.focus();
              }
            } catch (e) {
              if (!controller.signal.aborted && seq === sequence.current) setError(errorText(e));
            } finally {
              if (!controller.signal.aborted && seq === sequence.current) setLoading(false);
            }
          }
          useEffect(() => {
            if (!props.open) return;
            generation.current++;
            setListing(null); setError(''); setNote(''); setName(null); setSubmitting(false); setCreating(false);
            void navigate(undefined, true);
            return () => { generation.current++; sequence.current++; scan.current?.abort(); };
          }, [props.open]);
          useEffect(() => {
            if (props.open && name === null) dialog.current?.focus();
          }, [name]);
          useEffect(() => {
            if (!props.open) return;
            const previous = document.activeElement;
            const frame = requestAnimationFrame(() => pathInput.current?.focus());
            const onFocus = e => {
              if (dialog.current && !dialog.current.contains(e.target)) dialog.current.focus();
            };
            document.addEventListener('focusin', onFocus);
            return () => {
              cancelAnimationFrame(frame);
              document.removeEventListener('focusin', onFocus);
              if (previous?.isConnected && typeof previous.focus === 'function') previous.focus();
            };
          }, [props.open]);
          useEffect(() => { if (!props.busy && submitting) setSubmitting(false); }, [props.busy]);
          async function createFolder(e) {
            e.preventDefault();
            if (blocked || !listing || !name?.trim()) return;
            setCreating(true); setError('');
            const round = generation.current;
            try {
              const path = await ctx.uiWorkspace.createDirectory(listing.path, name.trim());
              if (round === generation.current && owner.current.open) await navigate(path);
            } catch (e) { if (round === generation.current && owner.current.open) setError(errorText(e)); }
            finally { if (round === generation.current && owner.current.open) setCreating(false); }
          }
          function confirm() {
            if (blocked || !listing) return;
            if (!history.save(listing.home, parentOf(listing))) setNote(t('storage'));
            setSubmitting(true);
            props.onPicked(listing.path);
          }
          function onKeyDown(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (name !== null) setName(null); else close(); }
            if (e.key === 'Tab') {
              const focusable = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];
              if (!focusable.length) { e.preventDefault(); return; }
              const first = focusable[0], last = focusable[focusable.length - 1];
              if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
          }
          if (!props.open) return null;
          const button = (label, onClick, extra = {}) => h('button', { type: 'button', disabled: blocked, onClick, ...extra }, label);
          const entries = listing?.entries.filter(e => hidden || !e.hidden) || [];
          return h('div', { className: 'rf-mask', onMouseDown: e => { if (e.target === e.currentTarget) close(); } },
            h('style', null, css),
            h('section', { className: 'rf-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('title'), 'aria-busy': blocked, tabIndex: -1, ref: dialog, onKeyDownCapture: onKeyDown, 'data-shortcut-modal': 'recent-folder' },
              h('header', null, h('h2', null, t('title')), h('p', { className: 'rf-hint' }, t('hint'))),
              h('form', { className: 'rf-line', onSubmit: e => { e.preventDefault(); if (!blocked && draft.trim()) void navigate(draft.trim()); } },
                h('input', { className: 'rf-path', ref: pathInput, value: draft, disabled: locked, 'aria-label': t('path'), onChange: e => setDraft(e.target.value) }),
                h('button', { type: 'submit', disabled: blocked || !draft.trim() }, t('go'))),
              h('nav', { className: 'rf-crumbs', 'aria-label': t('path') },
                button(t('home'), () => void navigate()),
                ...(listing?.crumbs || []).map(c => h('button', { type: 'button', key: c.path, disabled: blocked, onClick: () => void navigate(c.path) }, c.name))),
              listing?.roots?.length > 0 && h('div', { className: 'rf-crumbs', 'aria-label': t('location') }, ...listing.roots.map(c => h('button', { type: 'button', key: c.path, disabled: blocked, onClick: () => void navigate(c.path) }, c.name))),
              h('div', { className: 'rf-line' }, button(t('up'), () => void navigate(parentOf(listing)), { disabled: blocked || !listing || parentOf(listing) === listing.path }), button(t('newFolder'), () => setName(''), { disabled: blocked || !listing })),
              name !== null && h('form', { className: 'rf-line', onSubmit: createFolder }, h('input', { autoFocus: true, value: name, disabled: blocked, 'aria-label': t('name'), onChange: e => setName(e.target.value) }), h('button', { type: 'submit', disabled: blocked || !name.trim() }, t('create')), button(t('cancel'), () => setName(null))),
              h('div', { className: 'rf-list', 'aria-label': t('title') }, loading ? h('p', { role: 'status' }, t('loading')) : entries.length ? entries.map(entry => h('button', { type: 'button', key: entry.path, disabled: blocked, onClick: () => void navigate(entry.path) }, '▸  ' + entry.name)) : h('p', { className: 'rf-note' }, t('empty'))),
              error && h('div', { className: 'rf-error', role: 'alert' }, error),
              note && h('div', { className: 'rf-note', role: 'status' }, note),
              listing?.truncated && h('div', { className: 'rf-note' }, t('truncated')),
              h('footer', { className: 'rf-footer' }, h('label', null, h('input', { type: 'checkbox', checked: hidden, disabled: locked, onChange: e => setHidden(e.target.checked) }), ' ', t('hidden')),
                h('div', { className: 'rf-line' }, button(t('cancel'), close, { disabled: locked }), button(t('open'), confirm, { className: 'rf-primary', disabled: blocked || !listing })))));
        }
        for (const name of ['sidebar.workspaces.directoryFlow', 'conversation.hero.workspace.directoryFlow']) {
          ctx.slots.inject(name, () => ctx.slots.register({ name, priority: -10 }, DirectoryFlow));
        }
      },
    };
  },
});
