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

  function putCover(blob, storyId) {
    if (canUseApi() && storyId && !String(storyId).startsWith('s_') && blob) {
      var form = new FormData();
      form.append('cover', blob, blob.name || 'cover.jpg');
      return window.AudioHubApi.request('/stories/' + encodeURIComponent(storyId) + '/cover', {
        method: 'POST',
        body: form
      }).then(function (result) {
        return result && result.coverKey ? String(result.coverKey) : '';
      });
    }

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var key = makeKey();
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put({ key: key, blob: blob, createdAt: new Date().toISOString() });

        tx.oncomplete = function () {
          try {
            db.close();
          } catch (error) {
          }
          resolve(key);
        };

        tx.onerror = function () {
          try {
            db.close();
          } catch (error) {
          }
          reject(tx.error || new Error('Failed to store cover'));
        };
      });
    });
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
          try {
            db.close();
          } catch (error) {
          }
          resolve(value && value.blob ? value.blob : null);
        };

        request.onerror = function () {
          try {
            db.close();
          } catch (error) {
          }
          reject(request.error || new Error('Failed to load cover'));
        };
      });
    });
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
          try {
            db.close();
          } catch (error) {
          }
          resolve(true);
        };

        tx.onerror = function () {
          try {
            db.close();
          } catch (error) {
          }
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
            try {
              db.close();
            } catch (error) {
            }
            resolve(keys);
            return;
          }

          if (cursor.key) {
            keys.push(String(cursor.key));
          }
          cursor.continue();
        };

        request.onerror = function () {
          try {
            db.close();
          } catch (error) {
          }
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
