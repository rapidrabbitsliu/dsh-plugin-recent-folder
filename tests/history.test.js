import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual pure helpers without rendering or emulating React/DOM.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('    const parentOf =');
const end = source.indexOf('\n    return {\n      inject:', start);
const { parentOf, createHistory } = vm.runInNewContext(`(() => { const KEY = 'test-history';\n${source.slice(start, end)}\nreturn { parentOf, createHistory }; })()`);
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('parent uses Host breadcrumbs for Windows, POSIX and UNC paths', () => {
  for (const [parent, path] of [['D:\\projects', 'D:\\projects\\a'], ['/srv', '/srv/a'], ['\\\\server\\share', '\\\\server\\share\\a']]) {
    assert.equal(parentOf({ path, crumbs: [{ path: parent }, { path }] }), parent);
  }
});
test('root remains itself', () => {
  assert.equal(parentOf({ path: 'D:\\', crumbs: [{ path: 'D:\\' }] }), 'D:\\');
  assert.equal(parentOf({ path: '/', crumbs: [] }), '/');
});
test('history persists across instances and is isolated by Host home', () => {
  const store = storage();
  const first = createHistory(() => store);
  assert.equal(first.read('home-a'), undefined);
  assert.equal(first.save('home-a', 'D:\\projects'), true);
  first.save('home-b', '/srv');
  const second = createHistory(() => store);
  assert.equal(second.read('home-a'), 'D:\\projects');
  assert.equal(second.read('home-b'), '/srv');
  assert.equal(second.read('home-c'), undefined);
});
test('denied storage keeps in-page history without throwing', () => {
  const history = createHistory(() => { throw Error('denied'); });
  assert.equal(history.save('/home/a', '/srv'), false);
  assert.equal(history.read('/home/a'), '/srv');
});
test('failed write overrides stale readable storage in this page', () => {
  const store = storage();
  const history = createHistory(() => store);
  history.save('home', '/old');
  store.setItem = () => { throw Error('quota'); };
  assert.equal(history.save('home', '/new'), false);
  assert.equal(history.read('home'), '/new');
});
test('corrupt values are ignored and repaired on save', () => {
  for (const value of ['null', '[]', 'false', '{broken', '{"home":42}', '{"home":""}']) {
    const store = storage();
    store.setItem('test-history', value);
    const history = createHistory(() => store);
    assert.equal(history.read('home'), undefined);
    assert.equal(history.save('home', '/valid'), true);
    assert.equal(createHistory(() => store).read('home'), '/valid');
  }
});
test('prototype-like Host keys are treated as data', () => {
  const store = storage();
  const history = createHistory(() => store);
  assert.equal(history.read('__proto__'), undefined);
  history.save('__proto__', '/data');
  assert.equal(createHistory(() => store).read('__proto__'), '/data');
});
test('bundle resources and dependency-free manifest are complete', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.name, 'dsh-plugin-recent-folder');
  assert.equal(manifest.dependencies, undefined);
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(new URL(`../locale/${lang}.json`, import.meta.url)));
    assert.ok(locale.meta.title && locale.meta.description);
  }
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md']) {
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url)).length);
  }
  assert.ok(!source.includes("require('@deepseek-ai/"));
  assert.ok(source.includes('priority: -10'));
});
