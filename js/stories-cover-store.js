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
    // Upload cover_data to D1 (cross-device accessible)
    if (storyId && !String(storyId).startsWith('s_') && blob) {
      // Convert blob to base64 data URL, then save to D1
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        if (dataUrl && dataUrl.indexOf('data:image') === 0) {
          fetch('/api/stories/' + encodeURIComponent(storyId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: storyId, cover_data: dataUrl })
          }).then(function (r) {
            if (r.ok) console.log('[cover-store] ✅ cover saved to D1 for', storyId);
          }).catch(function () {});
        }
      };
      reader.readAsDataURL(blob);
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

  // Try fetching cover from D1 (cover_data field)
  function tryFetchCover(key, cacheFn) {
    // key could be a story ID or cover key. Try fetching story from D1 to get cover_data.
    if (!key || String(key).startsWith('c_')) return Promise.resolve(null);
    return fetch('/api/stories/' + encodeURIComponent(key))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (story) {
        if (!story || !story.cover_data) return null;
        // Convert data URL to blob
        var dataUrl = story.cover_data;
        var parts = dataUrl.split(',');
        var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
        var raw = atob(parts[1] || '');
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        var blob = new Blob([arr], { type: mime });
        if (blob.size > 0 && cacheFn) cacheFn(key, blob).catch(function () {});
        return blob;
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

  /* ── Default cover generator (canvas) ─────────────────────────────── */
  var COVER_GRADIENTS = [
    ['#0ea5e9', '#2563eb'], ['#f97316', '#f59e0b'], ['#a855f7', '#7c3aed'],
    ['#14b8a6', '#0d9488'], ['#ec4899', '#db2777'], ['#6366f1', '#4f46e5'],
    ['#f43f5e', '#e11d48'], ['#0891b2', '#0e7490']
  ];

  function generateDefaultCover(storyOrTitle, genre, size) {
    var s = size || 400;
    try {
      var canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';

      var title = String(storyOrTitle && storyOrTitle.title || storyOrTitle || '').trim();
      var g = String(genre || (storyOrTitle && storyOrTitle.genre) || '').trim();

      // Pick gradient by hashing title
      var hash = 0;
      for (var i = 0; i < title.length; i++) hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
      var pair = COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];

      // Draw gradient
      var grd = ctx.createLinearGradient(0, 0, s, s);
      grd.addColorStop(0, pair[0]);
      grd.addColorStop(1, pair[1]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, s, s);

      // Subtle pattern overlay
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (var py = 0; py < s; py += 12) {
        ctx.fillRect(0, py, s, 1);
      }

      // Genre badge
      if (g) {
        ctx.font = 'bold ' + Math.round(s * 0.048) + 'px sans-serif';
        var tw = ctx.measureText(g).width;
        var bx = 20, by = s - 30;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(bx - 8, by - 16, tw + 16, 24, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(g, bx, by);
      }

      // Title text (2 lines max)
      if (title) {
        var maxW = s * 0.7;
        var words = title.split(/\s+/);
        var lines = [];
        var line = '';
        ctx.font = 'bold ' + Math.round(s * 0.085) + 'px sans-serif';
        for (var wi = 0; wi < words.length; wi++) {
          var test = line ? (line + ' ' + words[wi]) : words[wi];
          if (ctx.measureText(test).width > maxW && line) {
            lines.push(line);
            line = words[wi];
            if (lines.length >= 2) break;
          } else {
            line = test;
          }
        }
        if (line && lines.length < 3) lines.push(line);

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var lineH = s * 0.11;
        var startY = s * 0.42 - ((lines.length - 1) * lineH) / 2;
        for (var li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], s / 2, startY + li * lineH);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Headphones icon placeholder (circle with play triangle)
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.75, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(s / 2 - s * 0.02, s * 0.75 - s * 0.03);
      ctx.lineTo(s / 2 + s * 0.03, s * 0.75);
      ctx.lineTo(s / 2 - s * 0.02, s * 0.75 + s * 0.03);
      ctx.closePath();
      ctx.fill();

      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      return '';
    }
  }

  window.AudioHubStoryCover = {
    put: putCover,
    get: getCover,
    delete: deleteCover,
    listKeys: listKeys,
    generateDefault: generateDefaultCover
  };
})();
