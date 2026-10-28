// IndexedDB: outbox for messages typed offline (F-LOW-2) and a local copy of conversations (S8, offline reading).
const DB = 'kajar';
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('outbox', { keyPath: 'client_msg_id' });
      db.createObjectStore('convs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const outbox = {
  put: (item) => tx('outbox', 'readwrite', (s) => s.put(item)),
  del: (id) => tx('outbox', 'readwrite', (s) => s.delete(id)),
  async all() {
    const db = await open();
    const items = await reqP(db.transaction('outbox').objectStore('outbox').getAll());
    return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
};

export const convs = {
  put: (c) => tx('convs', 'readwrite', (s) => s.put({ ...c, messages: (c.messages || []).slice(-40) })),
  async get(id) {
    const db = await open();
    return reqP(db.transaction('convs').objectStore('convs').get(id));
  },
  async all() {
    const db = await open();
    const items = await reqP(db.transaction('convs').objectStore('convs').getAll());
    return items.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },
};

export async function clearLocal() {
  const db = await open();
  await new Promise((resolve) => {
    const t = db.transaction(['convs', 'outbox'], 'readwrite');
    t.objectStore('convs').clear();
    t.objectStore('outbox').clear();
    t.oncomplete = resolve;
  });
  for (const k of Object.keys(localStorage)) if (k.startsWith('kajar-draft') || k.startsWith('kajar-tes')) localStorage.removeItem(k);
  if ('caches' in window) await caches.delete('kajar-data');
}
