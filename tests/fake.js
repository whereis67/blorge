// Two-user fake backend for Blorge team tests: in-memory db + room shared by several pages.
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const NM = path.join(__dirname, 'node_modules');
const store = new Map();            // path -> data
const subs = [];                    // {page, id, path, kind}
const rooms = new Map();            // name -> Map(pageId -> presence)
const pages = [];
const clone = (x) => JSON.parse(JSON.stringify(x));
const merge = (t, p) => { for (const k of Object.keys(p)) { const v = p[k]; if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], v); else t[k] = clone(v); } return t; };
const parent = (p) => p.split('/').slice(0, -1).join('/');
const docsOf = (collPath) => [...store.entries()].filter(([p]) => parent(p) === collPath).map(([p, d]) => [p.split('/').pop(), d]).sort((a, b) => a[0].localeCompare(b[0]));
function snapshotFor(sub) { return sub.kind === 'doc' ? { exists: store.has(sub.path), data: store.has(sub.path) ? clone(store.get(sub.path)) : null } : { docs: docsOf(sub.path).map(([id, d]) => ({ id, data: clone(d) })) }; }
async function notify(changedPath) {
  for (const sub of subs) {
    const hit = sub.kind === 'doc' ? sub.path === changedPath : parent(changedPath) === sub.path;
    if (!hit) continue;
    const snap = snapshotFor(sub), sig = JSON.stringify(snap);
    if (sub.sig === sig) continue; sub.sig = sig;
    const delay = sub.page.__lag || 0;
    setTimeout(() => sub.page.evaluate(([id, s]) => window.__deliver(id, s), [sub.id, snap]).catch(() => {}), delay);
  }
}
async function dbop(page, op, p, data, extra) {
  if (op === 'get') return store.has(p) ? { exists: true, data: clone(store.get(p)) } : { exists: false };
  if (op === 'list') return { docs: docsOf(p).map(([id, d]) => ({ id, data: clone(d) })) };
  if (op === 'set') { store.set(p, clone(data)); await notify(p); return; }
  if (op === 'update') { if (!store.has(p)) { const e = new Error('no doc'); e.code = 'invalid_argument'; throw e; } merge(store.get(p), data); await notify(p); return; }
  if (op === 'delete') { store.delete(p); await notify(p); return; }
  if (op === 'sub') { const sub = { page, id: extra.id, path: p, kind: extra.kind, sig: '' }; subs.push(sub); const snap = snapshotFor(sub); sub.sig = JSON.stringify(snap); setTimeout(() => page.evaluate(([id, s]) => window.__deliver(id, s), [sub.id, snap]).catch(() => {}), 5); return; }
  if (op === 'unsub') { const i = subs.findIndex((s) => s.page === page && s.id === extra.id); if (i >= 0) subs.splice(i, 1); return; }
}
function roomPush(name) {
  const m = rooms.get(name) || new Map();
  for (const pg of pages) { const peers = [...m.entries()].map(([pid, pres]) => ({ peer: 'p' + pid, by: pres.uid || null, isMe: pid === pg.__id, sameTab: pid === pg.__id, kind: 'viewer', guest: false, presence: pres, updatedAt: Date.now() })); pg.evaluate(([n, pe]) => window.__roomPeers && window.__roomPeers(n, pe), [name, peers]).catch(() => {}); }
}
const SHIM = (uid, name) => `(() => {
  const subs = new Map(); let n = 0;
  window.__deliver = (id, snap) => { const s = subs.get(id); if (s) s(snap); };
  const mkDoc = (snap, path) => ({ id: path.split('/').pop(), exists: !!snap.exists, data: () => snap.exists ? snap.data : undefined, metadata: { fromCache: false, hasPendingWrites: false } });
  const err = (e) => Object.assign(new Error(e.message), { code: e.code || 'unavailable' });
  const call = async (op, path, data, extra) => { try { return await window.__db(op, path, data, extra); } catch (e) { throw err(e); } };
  const docRef = (path) => ({ id: path.split('/').pop(), path,
    get: async () => { const r = await call('get', path); return mkDoc(r, path); },
    set: (d) => call('set', path, d), update: (d) => call('update', path, d), delete: () => call('delete', path),
    acquire: async () => ({ acquired: true }),
    onSnapshot(next) { const id = ++n; subs.set(id, (snap) => next(mkDoc(snap, path))); call('sub', path, null, { id, kind: 'doc' }); return () => { subs.delete(id); call('unsub', path, null, { id }); }; },
    collection: (p) => collRef(path + '/' + p) });
  const collRef = (path) => { const q = { path,
    doc: (id) => docRef(path + '/' + (id || 'a' + Math.random().toString(36).slice(2, 10))),
    add: async (d) => { const r = q.doc(); await r.set(d); return r; },
    where: () => q, orderBy: () => q, limit: () => q,
    get: async () => { const r = await call('list', path); const docs = r.docs.map((d) => mkDoc({ exists: true, data: d.data }, path + '/' + d.id)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; },
    onSnapshot(next) { const id = ++n; let prev = new Map();
      subs.set(id, (snap) => { const docs = snap.docs.map((d) => mkDoc({ exists: true, data: d.data }, path + '/' + d.id)); const cur = new Map(snap.docs.map((d) => [d.id, JSON.stringify(d.data)]));
        const changes = []; docs.forEach((d, i) => { if (!prev.has(d.id)) changes.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i }); else if (prev.get(d.id) !== cur.get(d.id)) changes.push({ type: 'modified', doc: d, oldIndex: i, newIndex: i }); });
        for (const [k] of prev) if (!cur.has(k)) changes.push({ type: 'removed', doc: mkDoc({ exists: true, data: {} }, path + '/' + k), oldIndex: 0, newIndex: -1 });
        prev = cur; next({ docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: {} }); });
      call('sub', path, null, { id, kind: 'coll' }); return () => { subs.delete(id); call('unsub', path, null, { id }); }; } }; return q; };
  const rooms = new Map();
  window.__roomPeers = (name, peers) => { const r = rooms.get(name); if (r) { r.cur = peers; r.handlers.forEach((h) => h({ peers, joined: [], left: [], updated: [] })); } };
  const mkRoom = (name) => { const r = { cur: [], handlers: [], connected: () => true, presence: (p) => window.__room('presence', name, p), peers: () => r.cur, onPeers(h) { r.handlers.push(h); h({ peers: r.cur, joined: r.cur, left: [], updated: [] }); return () => {}; }, leave: async () => { window.__room('leave', name); }, emit: async () => {}, on: () => () => {}, onConnection: () => () => {} }; rooms.set(name, r); window.__room('join', name); return r; };
  const user = { me: async () => ({ id: ${JSON.stringify(uid)}, name: ${JSON.stringify(name)}, avatarUrl: '', isOwner: false, canEdit: false }), can: async () => true, id: async () => ${JSON.stringify(uid)}, isOwner: () => false, canEdit: () => false, profiles: async () => ({}) };
  window.claude = { use: async (nm) => nm === 'db' ? { doc: docRef, collection: collRef } : nm === 'user' ? user : nm === 'room' ? { join: async (n) => mkRoom(n), presence: () => {}, onPeers: () => () => {} } : null };
})();`;

async function makeUser(browser, uid, name, html, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage(); page.__id = uid; pages.push(page); page.__lag = extra.lag || 0;
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|net::/.test(m.text())) page.errs.push('console: ' + m.text()); });
  await page.exposeFunction('__db', (op, p, d, e) => dbop(page, op, p, d, e).catch((er) => { throw Object.assign(new Error(er.message), { code: er.code }); }));
  await page.exposeFunction('__room', (op, name, p) => { const m = rooms.get(name) || rooms.set(name, new Map()).get(name); if (op === 'join') m.set(uid, { ...(m.get(uid) || {}) }); if (op === 'presence') m.set(uid, { ...(m.get(uid) || {}), ...p }); if (op === 'leave') m.delete(uid); roomPush(name); });
  await page.addInitScript(SHIM(uid, name));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://app.local/')) return r.fulfill({ body: html, contentType: 'text/html' }); let m;
    if ((m = u.match(/unpkg\.com\/blockly@[^/]+\/(.*)$/))) return r.fulfill({ path: path.join(NM, 'blockly', m[1]) }); if ((m = u.match(/continuous-toolbox@[^/]+\/(.*)$/))) return r.fulfill({ path: path.join(NM, '@blockly/continuous-toolbox', m[1]) }); if ((m = u.match(/three@[^/]+\/(.*)$/))) return r.fulfill({ path: path.join(NM, 'three', m[1]) }); return r.abort(); });
  store.set('profiles/' + uid, { username: name.toLowerCase(), displayName: name, avatar: 'blob-cyan', bio: '', joinedAt: Date.now() });
  return page;
}
module.exports = { store, makeUser, chromium, dbop };
