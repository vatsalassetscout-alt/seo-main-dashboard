export class AICache {
  private dbName = 'AISeoCache';
  private version = 3;
  private storeName = 'aiResponses';
  private db: IDBDatabase | null = null;
  public stats = { hits: 0, misses: 0 };
  private onStatsChange: (() => void) | null = null;

  constructor(onStatsChange?: () => void) {
    if (onStatsChange) this.onStatsChange = onStatsChange;
    this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject();
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });
  }

  public getKey(url: string, payload: any): string {
    return btoa(unescape(encodeURIComponent(url + JSON.stringify(payload)))).slice(0, 200);
  }

  public async get<T>(key: string): Promise<T | null> {
    if (!this.db) {
      try {
        await this.init();
      } catch (e) {
        return null;
      }
    }
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);

      req.onsuccess = () => {
        const entry = req.result;
        if (entry && Date.now() < entry.ttl) {
          this.stats.hits++;
          if (this.onStatsChange) this.onStatsChange();
          resolve(entry.data as T);
        } else {
          if (entry) this.delete(key);
          this.stats.misses++;
          if (this.onStatsChange) this.onStatsChange();
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  public async set(key: string, data: any, ttlSeconds: number = 7200): Promise<void> {
    if (!this.db) {
      try {
        await this.init();
      } catch (e) {
        return;
      }
    }
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({
        key,
        data,
        timestamp: Date.now(),
        ttl: Date.now() + ttlSeconds * 1000
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  public async delete(key: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction([this.storeName], 'readwrite');
    tx.objectStore(this.storeName).delete(key);
  }

  public async clear(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction([this.storeName], 'readwrite');
    tx.objectStore(this.storeName).clear();
    this.stats = { hits: 0, misses: 0 };
    if (this.onStatsChange) this.onStatsChange();
  }
}
