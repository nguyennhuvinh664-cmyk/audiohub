(function () {
  var DB_NAME = 'audiohub-media';
  var DB_VERSION = 3;
  var STORE_NAME = 'storyCover';
  var COVER_STORE = 'storyCover';
  var AUDIO_STORE = 'storyAudio';
  var TRASH_STORE = 'storyAudioTrash';

  function canUseApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function ensureStores(db) {
    if (!db.objectStoreNames.contains(COVER_STORE)) {
      db.createObjectStore(COVER_STORE, { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains(AUDIO_STORE)) {
      db.createObjectStore(AUDIO_STORE, { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains(TRASH_STORE)) {
      db.createObjectStore(TRASH_STORE, { keyPath: 'key' });
    }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('indexedDB not supported'));
        return;
      }

      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        ensureStores(db);
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  function makeKey() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function storeLocal(key, blob) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put({ key: key, blob: blob, createdAt: new Date().toISOString() });

        tx.oncomplete = function () {
          try { db.close(); } catch (e) {}
          resolve(key);
        };

        tx.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(tx.error || new Error('Failed to store cover'));
        };
      });
    });
  }

  function putCover(blob, storyId) {
    // Upload to Supabase Storage (cross-device accessible, no CORS issues)
    if (storyId && !String(storyId).startsWith('s_') && blob) {
      var SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
      var filePath = storyId + '/cover';
      var uploadUrl = SUPABASE_URL + '/storage/v1/object/story-covers/' + encodeURIComponent(filePath);

      function tryUpload(method) {
        return fetch(uploadUrl, {
          method: method,
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'image/jpeg'
          },
          body: blob
        });
      }

      tryUpload('POST').then(function (r) {
        if (r.ok) return r;
        // If 409 (already exists), try PUT to overwrite
        if (r.status === 409) return tryUpload('PUT');
        // Retry once on failure
        return new Promise(function (resolve) {
          setTimeout(function () { tryUpload('POST').then(resolve).catch(function () { resolve(null); }); }, 2000);
        });
      }).catch(function () {
        // Retry once on network error
        return new Promise(function (resolve) {
          setTimeout(function () { tryUpload('POST').then(resolve).catch(function () { resolve(null); }); }, 2000);
        });
      }).catch(function () {});
    }

    // API path: upload to Render backend AND save locally
    if (canUseApi() && storyId && !String(storyId).startsWith('s_') && blob) {
      var form = new FormData();
      form.append('cover', blob, blob.name || 'cover.jpg');
      return window.AudioHubApi.request('/stories/' + encodeURIComponent(storyId) + '/cover', {
        method: 'POST',
        body: form
      }).then(function (result) {
        var serverKey = result && result.coverKey ? String(result.coverKey) : '';
        var localKey = serverKey || makeKey();
        storeLocal(localKey, blob).catch(function () {});
        return serverKey || localKey;
      });
    }

    // Local-only path
    var localKey = makeKey();
    return storeLocal(localKey, blob);
  }

  function getCover(key) {
    if (!key) {
      return Promise.resolve(null);
    }

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          var value = request.result;
          try { db.close(); } catch (e) {}

          // Found locally
          if (value && value.blob) {
            resolve(value.blob);
            return;
          }

          // Not in IndexedDB — try multiple fallbacks
          tryFetchCover(key, storeLocal).then(resolve).catch(function () { resolve(null); });
        };

        request.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(request.error || new Error('Failed to load cover'));
        };
      });
    });
  }

  // Try fetching cover from Supabase Storage (direct URL, fast CDN)
  function tryFetchCover(key, cacheFn) {
    var SUPABASE_DIRECT = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
    var SUPABASE_STORAGE = SUPABASE_DIRECT + '/storage/v1/object/public/story-covers/';

    function fetchWithTimeout(url, timeoutMs) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      return fetch(url, { signal: controller.signal }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('Failed');
        return res.blob();
      }).catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
    }

    // Single source: Supabase Storage direct (fast CDN, no proxy)
    return fetchWithTimeout(SUPABASE_STORAGE + encodeURIComponent(key), 5000)
      .then(function (blob) {
        if (blob && blob.size > 0) {
          if (cacheFn) cacheFn(key, blob).catch(function () {});
          return blob;
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function deleteCover(key) {
    if (!key) {
      return Promise.resolve(false);
    }

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.delete(key);

        tx.oncomplete = function () {
          try { db.close(); } catch (e) {}
          resolve(true);
        };

        tx.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(tx.error || new Error('Failed to delete cover'));
        };
      });
    });
  }

  function listKeys() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var keys = [];
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);

        var request = store.openCursor();
        request.onsuccess = function () {
          var cursor = request.result;
          if (!cursor) {
            try { db.close(); } catch (e) {}
            resolve(keys);
            return;
          }

          if (cursor.key) {
            keys.push(String(cursor.key));
          }
          cursor.continue();
        };

        request.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(request.error || new Error('Failed to list cover keys'));
        };
      });
    });
  }

  window.AudioHubStoryCover = {
    put: putCover,
    get: getCover,
    delete: deleteCover,
    listKeys: listKeys
  };
})();
