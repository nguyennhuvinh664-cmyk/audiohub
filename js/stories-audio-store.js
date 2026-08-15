(function () {
  var DB_NAME = 'audiohub-media';
  var DB_VERSION = 3;
  var STORE_NAME = 'storyAudio';
  var TRASH_STORE = 'storyAudioTrash';
  var COVER_STORE = 'storyCover';
  var AUDIO_STORE = 'storyAudio';

  function canUseApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function ensureStores(db) {
    if (!db.objectStoreNames.contains(AUDIO_STORE)) {
      db.createObjectStore(AUDIO_STORE, { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains(TRASH_STORE)) {
      db.createObjectStore(TRASH_STORE, { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains(COVER_STORE)) {
      db.createObjectStore(COVER_STORE, { keyPath: 'key' });
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
    return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  var SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
  var AUDIO_BUCKET = 'story-audio';
  var RENDER_API_BASE = '/api/v1';

  function uploadToSupabaseStorage(blob, path) {
    var url = SUPABASE_URL + '/storage/v1/object/' + AUDIO_BUCKET + '/' + path;
    console.log('[audio-store] Uploading to Supabase:', path, '| size:', blob.size, '| type:', blob.type);
    var formData = new FormData();
    formData.append('file', blob, path);
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'x-upsert': 'true'
      },
      body: formData
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          console.error('[audio-store] Supabase upload failed:', res.status, txt);
          throw new Error('Upload failed: ' + res.status + ' ' + txt);
        });
      }
      return res.json();
    }).then(function (data) {
      console.log('[audio-store] ✅ Supabase upload OK:', path);
      return path;
    });
  }

  function uploadToRenderBackend(blob, storyId) {
    var url = RENDER_API_BASE + '/stories/' + encodeURIComponent(storyId) + '/audio';
    var formData = new FormData();
    var fileName = (storyId || 'audio') + '.mp3';
    formData.append('audio', blob, fileName);
    var headers = {};
    var token = (window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function')
      ? window.AudioHubApi.getToken() : '';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData
    }).then(function (res) {
      if (!res.ok) throw new Error('Backend upload failed: ' + res.status);
      return res.json();
    }).then(function (data) {
      var ak = data && data.data && data.data.audioKey ? data.data.audioKey : null;
      return ak || storyId;
    });
  }

  function downloadFromSupabaseStorage(path) {
    var url = SUPABASE_URL + '/storage/v1/object/public/' + AUDIO_BUCKET + '/' + encodeURIComponent(path);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    return fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      },
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('Download failed: ' + res.status);
      return res.blob();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function downloadFromRenderBackend(key) {
    if (!key) return Promise.reject(new Error('Missing key'));
    var url = RENDER_API_BASE + '/media/audio/' + encodeURIComponent(String(key));
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    return fetch(url, { signal: controller.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('Backend download failed: ' + res.status);
      return res.blob();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function uploadToR2(blob, storyId) {
    var url = '/api/audio/' + encodeURIComponent(storyId);
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'audio/mpeg' },
      body: blob
    }).then(function (res) {
      if (!res.ok) throw new Error('R2 upload failed: ' + res.status);
      return storyId;
    });
  }

  function putAudio(blob, storyId, audioKey) {
    if (!blob) return Promise.resolve('');
    console.log('[audio-store] putAudio called | storyId:', storyId, '| audioKey:', audioKey, '| blob.size:', blob.size, '| blob.type:', blob.type);

    // Reject corrupt/empty audio (< 1KB) — don't upload garbage to cloud
    if (blob.size < 1000) {
      console.warn('[audio-store] ⚠ Rejecting tiny blob:', blob.size, 'bytes — not uploading to cloud');
      return Promise.resolve('');
    }

    // Always store locally first (so bindStoryAudio can find it by storyId)
    var localKey = storyId || makeKey();
    putAudioLocal(blob, localKey).catch(function () {});

    // Upload to cloud if we have any story ID
    if (storyId) {
      // Upload to R2 under BOTH audioKey AND storyId so any lookup path finds it
      // Download tries: audioKey first, then storyId — both must exist
      var r2Key = audioKey || storyId;
      return uploadToR2(blob, r2Key).then(function (key) {
        console.log('[audio-store] ✅ R2 upload OK (primary):', key);
        // Also upload under storyId if different (fallback for download)
        if (r2Key !== storyId) {
          uploadToR2(blob, storyId).then(function () {
            console.log('[audio-store] ✅ R2 upload OK (fallback storyId):', storyId);
          }).catch(function () {});
        }
        // Also try Supabase + Render in parallel (best-effort backup)
        uploadToSupabaseStorage(blob, r2Key + '.mp3').catch(function () {});
        uploadToRenderBackend(blob, r2Key).catch(function () {});
        return key;
      }).catch(function (err) {
        console.warn('[audio-store] ⚠ R2 failed, trying Supabase:', err && err.message);
        return uploadToSupabaseStorage(blob, r2Key + '.mp3').catch(function (err2) {
          console.warn('[audio-store] ⚠ Supabase failed, trying Render:', err2 && err2.message);
          return uploadToRenderBackend(blob, r2Key).catch(function (err3) {
            console.warn('[audio-store] ⚠ All cloud uploads failed');
            return localKey;
          });
        });
      });
    }

    // No story ID yet — already stored locally above
    return Promise.resolve(localKey);
  }

  function putAudioLocal(blob, optionalKey) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var key = optionalKey || makeKey();
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put({
          key: key,
          blob: blob,
          fileName: blob && blob.name ? String(blob.name) : '',
          size: blob && typeof blob.size === 'number' ? blob.size : 0,
          createdAt: new Date().toISOString()
        });

        tx.oncomplete = function () {
          try { db.close(); } catch (e) {}
          resolve(key);
        };

        tx.onerror = function () {
          try { db.close(); } catch (e) {}
          reject(tx.error || new Error('Failed to store audio'));
        };
      });
    });
  }

  function getAudioFromApi(key) {
    if (!key) return Promise.resolve(null);

    var MIN_VALID_SIZE = 1000; // Audio files < 1KB are corrupted/empty
    var attempts = [
      function () {
        var url = '/api/audio/' + encodeURIComponent(String(key)) + '?v=' + encodeURIComponent('' + Math.floor(Date.now() / 86400000));
        console.log('[audio-store] fetch R2:', url);
        return fetch(url, { cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        });
      },
      function () {
        console.log('[audio-store] fetch Supabase:', key);
        return downloadFromSupabaseStorage(key);
      },
      function () {
        console.log('[audio-store] fetch Render:', key);
        return downloadFromRenderBackend(key);
      }
    ];

    // Try each source, with retries for timing issues
    var tryIdx = 0;
    function tryNext() {
      if (tryIdx >= attempts.length) return Promise.resolve(null);
      var attempt = attempts[tryIdx++];
      return attempt().then(function (blob) {
        if (blob && blob.size >= MIN_VALID_SIZE) {
          console.log('[audio-store] OK:', key, blob.size, 'bytes');
          return blob;
        }
        console.log('[audio-store] too small:', key, blob ? blob.size : 0, 'bytes');
        return tryNext();
      }).catch(function (err) {
        console.log('[audio-store] failed:', key, err && err.message);
        return tryNext();
      });
    }

    // Retry entire chain up to 2 times with delays
    var retryCount = 0;
    var maxRetries = 2;
    var retryDelays = [0, 3000];

    return new Promise(function (resolve) {
      function runWithRetry() {
        if (retryCount >= maxRetries) { resolve(null); return; }
        var delay = retryDelays[retryCount++];
        setTimeout(function () {
          tryIdx = 0;
          tryNext().then(function (blob) {
            if (blob) { resolve(blob); return; }
            runWithRetry();
          });
        }, delay);
      }
      runWithRetry();
    });
  }

  function getAudio(key) {
    if (!key) {
      return Promise.resolve(null);
    }

    key = String(key);

    // Ensure we have a real JWT (not local fallback) before API calls.
    // In incognito, ensureGuestToken() sets a local fallback instantly,
    // then fetches a real JWT in background. We must wait for it.
    var authReady = (window.AudioHubAuth && typeof window.AudioHubAuth.ensureGuestToken === 'function')
      ? window.AudioHubAuth.ensureGuestToken()
      : Promise.resolve();

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(key);

        request.onsuccess = function () {
          var value = request.result;
          var localBlob = value && value.blob ? value.blob : null;
          try {
            db.close();
          } catch (error) {
          }

          if (localBlob) {
            resolve(localBlob);
            return;
          }

          // Wait for real JWT before hitting API (avoids 401 in incognito)
          authReady.then(function () {
            getAudioFromApi(key).then(function (blob) {
              // Cache in IndexedDB so subsequent plays are instant
              if (blob && blob.size >= 1000) {
                putAudioLocal(blob, key).catch(function () {});
              }
              resolve(blob);
            });
          });
        };

        request.onerror = function () {
          try {
            db.close();
          } catch (error) {
          }
          reject(request.error || new Error('Failed to load audio'));
        };
      });
    }).catch(function () {
      return authReady.then(function () {
        return getAudioFromApi(key).then(function (blob) {
          if (blob && blob.size >= 1000) {
            putAudioLocal(blob, key).catch(function () {});
          }
          return blob;
        });
      });
    });
  }

  function deleteAudio(key) {
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
          reject(tx.error || new Error('Failed to delete audio'));
        };
      });
    });
  }

  function moveToTrash(key, storyRef) {
    if (!key) {
      return Promise.resolve(false);
    }

    var storyId = '';
    var storySnapshot = null;

    if (storyRef && typeof storyRef === 'object') {
      storyId = storyRef.id ? String(storyRef.id) : '';
      storySnapshot = {
        id: storyId,
        title: storyRef.title ? String(storyRef.title) : '',
        author: storyRef.author ? String(storyRef.author) : '',
        genre: storyRef.genre ? String(storyRef.genre) : '',
        description: storyRef.description ? String(storyRef.description) : '',
        chapterTitle: storyRef.chapterTitle ? String(storyRef.chapterTitle) : '',
        visibility: storyRef.visibility ? String(storyRef.visibility) : 'Công khai',
        audioStatus: storyRef.audioStatus ? String(storyRef.audioStatus) : 'Sẵn sàng',
        coverKey: storyRef.coverKey ? String(storyRef.coverKey) : '',
        createdAt: storyRef.createdAt ? String(storyRef.createdAt) : ''
      };
    } else if (storyRef) {
      storyId = String(storyRef);
    }

    var isSyntheticMissingAudioKey = String(key).indexOf('missing-audio-') === 0;
    if (canUseApi() && storyId && !String(storyId).startsWith('s_') && !isSyntheticMissingAudioKey) {
      return window.AudioHubApi.request('/stories/' + encodeURIComponent(storyId), { method: 'DELETE' })
        .then(function () { return true; })
        .catch(function () { return false; });
    }

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME, TRASH_STORE], 'readwrite');
        var mainStore = tx.objectStore(STORE_NAME);
        var trashStore = tx.objectStore(TRASH_STORE);

        var request = mainStore.get(key);
        request.onsuccess = function () {
          var value = request.result;
          var now = new Date().toISOString();
          var resolvedKey = value && value.key ? String(value.key) : String(key);

          trashStore.put({
            key: resolvedKey,
            blob: value && value.blob ? value.blob : null,
            fileName: value && value.fileName ? value.fileName : '',
            size: value && typeof value.size === 'number' ? value.size : 0,
            createdAt: value && value.createdAt ? value.createdAt : now,
            deletedAt: now,
            story: storySnapshot
          });

          if (value) {
            mainStore.delete(key);
          }
        };

        tx.oncomplete = function () {
          try { db.close(); } catch (error) {}
          resolve(true);
        };

        tx.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(tx.error || new Error('Failed to move audio to trash'));
        };
      });
    });
  }

  function getTrash(key) {
    if (!key) {
      return Promise.resolve(null);
    }
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(TRASH_STORE, 'readonly');
        var store = tx.objectStore(TRASH_STORE);
        var request = store.get(key);

        request.onsuccess = function () {
          var value = request.result;
          try { db.close(); } catch (error) {}
          resolve(value || null);
        };

        request.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(request.error || new Error('Failed to load trash audio'));
        };
      });
    });
  }

  function listLocalTrash() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var items = [];
        var tx = db.transaction(TRASH_STORE, 'readonly');
        var store = tx.objectStore(TRASH_STORE);

        var request = store.openCursor();
        request.onsuccess = function () {
          var cursor = request.result;
          if (!cursor) {
            try { db.close(); } catch (error) {}
            items.sort(function (a, b) {
              return String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
            });
            resolve(items);
            return;
          }

          var value = cursor.value;
          if (value && value.key) {
            items.push({
              key: String(value.key),
              fileName: value.fileName || '',
              size: typeof value.size === 'number' ? value.size : 0,
              createdAt: value.createdAt || '',
              deletedAt: value.deletedAt || '',
              story: value.story || null
            });
          }
          cursor.continue();
        };

        request.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(request.error || new Error('Failed to list trash'));
        };
      });
    });
  }

  function listTrash() {
    if (!canUseApi()) {
      return listLocalTrash();
    }

    return Promise.all([
      window.AudioHubApi.request('/audio-trash', { method: 'GET' }).then(function (items) {
        return Array.isArray(items) ? items : [];
      }).catch(function () {
        return [];
      }),
      listLocalTrash().catch(function () {
        return [];
      })
    ]).then(function (result) {
      var apiItems = result[0] || [];
      var localItems = result[1] || [];
      var mergedByKey = {};

      apiItems.forEach(function (item) {
        if (!item || !item.key) {
          return;
        }
        mergedByKey[String(item.key)] = item;
      });

      localItems.forEach(function (item) {
        if (!item || !item.key) {
          return;
        }
        var key = String(item.key);
        if (!mergedByKey[key]) {
          mergedByKey[key] = item;
        }
      });

      var merged = Object.keys(mergedByKey).map(function (key) { return mergedByKey[key]; });
      merged.sort(function (a, b) {
        return String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
      });
      return merged;
    });
  }

  function deleteFromTrash(key) {
    if (!key) {
      return Promise.resolve(false);
    }

    var normalizedKey = String(key);
    var isLocalOnlyKey = normalizedKey.indexOf('missing-audio-') === 0 || normalizedKey.indexOf('a_') === 0;

    if (canUseApi() && !isLocalOnlyKey) {
      return window.AudioHubApi.request('/audio-trash/' + encodeURIComponent(normalizedKey), { method: 'DELETE' })
        .then(function () { return true; })
        .catch(function () { return false; });
    }

    key = normalizedKey;

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(TRASH_STORE, 'readwrite');
        var store = tx.objectStore(TRASH_STORE);
        store.delete(key);

        tx.oncomplete = function () {
          try { db.close(); } catch (error) {}
          resolve(true);
        };

        tx.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(tx.error || new Error('Failed to delete trash audio'));
        };
      });
    });
  }

  function restoreFromTrash(key) {
    if (!key) {
      return Promise.resolve(false);
    }

    var normalizedKey = String(key);
    var isLocalOnlyKey = normalizedKey.indexOf('missing-audio-') === 0 || normalizedKey.indexOf('a_') === 0;

    if (canUseApi() && !isLocalOnlyKey) {
      return window.AudioHubApi.request('/audio-trash/' + encodeURIComponent(normalizedKey) + '/restore', { method: 'POST' })
        .then(function () { return true; })
        .catch(function () { return false; });
    }

    key = normalizedKey;

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME, TRASH_STORE], 'readwrite');
        var mainStore = tx.objectStore(STORE_NAME);
        var trashStore = tx.objectStore(TRASH_STORE);

        var request = trashStore.get(key);
        request.onsuccess = function () {
          var value = request.result;
          if (!value) {
            return;
          }

          mainStore.put({
            key: String(value.key || key),
            blob: value.blob,
            fileName: value.fileName || '',
            size: typeof value.size === 'number' ? value.size : 0,
            createdAt: value.createdAt || new Date().toISOString()
          });

          trashStore.delete(key);
        };

        tx.oncomplete = function () {
          try { db.close(); } catch (error) {}
          resolve(true);
        };

        tx.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(tx.error || new Error('Failed to restore trash audio'));
        };
      });
    });
  }

  function cleanupTrash(retentionDays) {
    if (canUseApi()) {
      return window.AudioHubApi.request('/maintenance/cleanup-retention', { method: 'POST' })
        .then(function (result) { return result && typeof result.removed === 'number' ? result.removed : 0; })
        .catch(function () { return 0; });
    }

    var days = typeof retentionDays === 'number' ? retentionDays : 7;
    if (!days || days < 0) {
      days = 7;
    }

    var cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var removed = 0;
        var tx = db.transaction(TRASH_STORE, 'readwrite');
        var store = tx.objectStore(TRASH_STORE);

        var request = store.openCursor();
        request.onsuccess = function () {
          var cursor = request.result;
          if (!cursor) {
            return;
          }

          var value = cursor.value;
          var deletedAt = value && value.deletedAt ? Date.parse(value.deletedAt) : NaN;
          if (!isNaN(deletedAt) && deletedAt < cutoff) {
            cursor.delete();
            removed += 1;
          }
          cursor.continue();
        };

        tx.oncomplete = function () {
          try { db.close(); } catch (error) {}
          resolve(removed);
        };

        tx.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(tx.error || new Error('Failed to cleanup trash'));
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
            try { db.close(); } catch (error) {}
            resolve(keys);
            return;
          }

          if (cursor.key) {
            keys.push(String(cursor.key));
          }
          cursor.continue();
        };

        request.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(request.error || new Error('Failed to list audio keys'));
        };
      });
    });
  }

  function getAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var entries = [];
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.openCursor();
        request.onsuccess = function () {
          var cursor = request.result;
          if (!cursor) {
            try { db.close(); } catch (error) {}
            resolve(entries);
            return;
          }
          var val = cursor.value;
          if (val && val.blob) {
            entries.push({ key: String(cursor.key), blob: val.blob, createdAt: val.createdAt || '' });
          }
          cursor.continue();
        };
        request.onerror = function () {
          try { db.close(); } catch (error) {}
          reject(request.error || new Error('Failed to list audio entries'));
        };
      });
    });
  }

  window.AudioHubStoryAudio = {
    put: putAudio,
    get: getAudio,
    delete: deleteAudio,
    listKeys: listKeys,
    getAll: getAll,
    moveToTrash: moveToTrash,
    listTrash: listTrash,
    getTrash: getTrash,
    deleteFromTrash: deleteFromTrash,
    restoreFromTrash: restoreFromTrash,
    cleanupTrash: cleanupTrash,
    migrateToSupabase: function () {
      var STORIES_KEY = 'audiohub-stories';
      var stories = [];
      try { stories = JSON.parse(localStorage.getItem(STORIES_KEY) || '[]'); } catch (e) { return Promise.resolve([]); }
      if (!stories.length) return Promise.resolve([]);

      var toMigrate = stories.filter(function (s) {
        return s && s.id && s.audioKey && String(s.audioKey).indexOf('a_') === 0;
      });

      if (!toMigrate.length) return Promise.resolve([]);

      return openDb().then(function (db) {
        var results = [];
        var chain = Promise.resolve();

        toMigrate.forEach(function (story) {
          chain = chain.then(function () {
            return new Promise(function (resolve) {
              var tx = db.transaction(STORE_NAME, 'readonly');
              var store = tx.objectStore(STORE_NAME);
              var req = store.get(story.audioKey);
              req.onsuccess = function () {
                var blob = req.result && req.result.blob ? req.result.blob : null;
                if (!blob) { resolve(); return; }
                var path = story.id + '.mp3';
                uploadToSupabaseStorage(blob, path).then(function () {
                  // Update audioKey in localStorage
                  var updated = [];
                  try { updated = JSON.parse(localStorage.getItem(STORIES_KEY) || '[]'); } catch (e) {}
                  updated.forEach(function (s) {
                    if (s && s.id === story.id) s.audioKey = path;
                  });
                  try { localStorage.setItem(STORIES_KEY, JSON.stringify(updated)); } catch (e) {}
                  results.push({ id: story.id, key: path, status: 'ok' });
                  resolve();
                }).catch(function (err) {
                  results.push({ id: story.id, key: story.audioKey, status: 'fail', error: String(err) });
                  resolve();
                });
              };
              req.onerror = function () { resolve(); };
            });
          });
        });

        return chain.then(function () {
          try { db.close(); } catch (e) {}
          return results;
        });
      }).catch(function () { return []; });
    }
  };
})();
