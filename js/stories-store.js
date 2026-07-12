(function () {
  var STORAGE_KEY = 'audiohub-stories';

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function dedupeStories(stories) {
    var list = Array.isArray(stories) ? stories : [];
    var byId = {};
    list.forEach(function (item) {
      if (!item || !item.id) return;
      byId[String(item.id)] = normalizeStory(item);
    });

    var values = Object.keys(byId).map(function (id) { return byId[id]; });
    var pickedByFingerprint = {};

    values.forEach(function (story) {
      var fingerprint = [
        String(story.title || '').trim().toLowerCase(),
        String(story.author || '').trim().toLowerCase(),
        String(story.chapterTitle || '').trim().toLowerCase()
      ].join('::');
      if (!fingerprint || fingerprint === '::::') {
        pickedByFingerprint[String(story.id)] = story;
        return;
      }
      var current = pickedByFingerprint[fingerprint];
      if (!current) {
        pickedByFingerprint[fingerprint] = story;
        return;
      }
      var currentTime = Date.parse(String(current.updatedAt || current.createdAt || '')) || 0;
      var nextTime = Date.parse(String(story.updatedAt || story.createdAt || '')) || 0;
      if (nextTime >= currentTime) {
        pickedByFingerprint[fingerprint] = story;
      }
    });

    return Object.keys(pickedByFingerprint).map(function (key) {
      return pickedByFingerprint[key];
    }).sort(function (a, b) {
      var ta = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
      var tb = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
      return tb - ta;
    });
  }

  function readLocalStories() {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    var parsed = safeParse(raw, []);
    var next = dedupeStories(Array.isArray(parsed) ? parsed : []).map(function (story) {
      var metrics = computeListenMetrics(story);
      story.listenHistory = metrics.history;
      story.listenCount = metrics.listenCount;
      story.listenCount2d = metrics.listenCount2d;
      story.listenCount7d = metrics.listenCount7d;
      return story;
    });
    // Only write back if dedup or cap changed the data
    var deduped = dedupeStories(Array.isArray(parsed) ? parsed : []);
    var needsWrite = deduped.length !== (Array.isArray(parsed) ? parsed : []).length
      || next.length !== deduped.length;
    if (needsWrite) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
      } catch (error) {}
    }
    return next;
  }

  function writeLocalStories(stories) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch (e) {
      // localStorage full — strip large base64 fields and retry
      var slimmed = stories.map(function (s) {
        var copy = Object.assign({}, s);
        delete copy.coverData;
        delete copy.coverDataUrl;
        delete copy.coverLegacyDataUrl;
        delete copy.readingText;
        return copy;
      });
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed));
      } catch (e2) {
        // Still full — keep only the 10 most recent stories
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed.slice(0, 10)));
      }
    }
  }

  function makeId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalize(value, fallback) {
    return value ? String(value).trim() : fallback;
  }

  function normalizeNumber(value) {
    var num = Number(value);
    return isNaN(num) || num < 0 ? 0 : num;
  }

  function normalizeCompleted(story) {
    var flag = story && story.isCompleted;
    if (typeof flag === 'boolean') {
      return flag;
    }
    var status = normalize(story && story.status, '');
    return status.toLowerCase() === 'hoàn thành' || status.toLowerCase() === 'hoan thanh' || status.toLowerCase() === 'completed' || status.toLowerCase() === 'full';
  }

  function normalizeHashtagToken(value) {
    return String(value || '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  function normalizeHashtags(values) {
    var list = Array.isArray(values) ? values : [];
    var seen = {};
    return list.map(normalizeHashtagToken).filter(function (tag) {
      if (!tag) return false;
      if (seen[tag]) return false;
      seen[tag] = true;
      return true;
    });
  }

  function extractYoutubeId(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    var patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = raw.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function normalizeYoutubeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var id = extractYoutubeId(raw);
    return id ? ('https://www.youtube.com/watch?v=' + id) : raw;
  }

  function normalizeYoutubeId(value, fallbackUrl) {
    return extractYoutubeId(value) || extractYoutubeId(fallbackUrl) || '';
  }

  function resolveAuthorFallback() {
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
      var parsed = raw ? JSON.parse(raw) : null;
      var name = parsed && parsed.isLoggedIn ? String(parsed.name || '').trim() : '';
      if (name) return name;
      var email = parsed && parsed.isLoggedIn ? String(parsed.email || '').trim() : '';
      if (email && email.indexOf('@') > 0) return email.split('@')[0];
    } catch (error) {
    }
    return 'Tài khoản AudioHub';
  }

  function sanitizeAuthor(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    var lower = text.toLowerCase();
    if (lower === 'ẩn danh' || lower === 'an danh' || lower === 'anonymous') return '';
    return text;
  }

  function normalizeStory(story) {
    var cleanedAuthor = sanitizeAuthor(story && story.author);
    var youtubeUrl = normalizeYoutubeUrl(story && story.youtubeUrl);
    var youtubeId = normalizeYoutubeId(story && story.youtubeId, youtubeUrl);
    return {
      id: story && story.id ? String(story.id) : makeId(),
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(cleanedAuthor, resolveAuthorFallback()),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      readingText: normalize(story && story.readingText, ''),
      hashtags: normalizeHashtags(story && story.hashtags),
      chapterTitle: normalize(story && story.chapterTitle, 'Chương 1'),
      visibility: normalize(story && story.visibility, 'Công khai'),
      audioStatus: normalize(story && story.audioStatus, story && story.audioKey ? 'Sẵn sàng' : 'Chưa có'),
      coverDataUrl: story && story.coverDataUrl ? String(story.coverDataUrl) : '',
      coverData: story && story.coverData ? String(story.coverData) : '',
      coverKey: story && story.coverKey ? String(story.coverKey) : '',
      audioKey: story && story.audioKey ? String(story.audioKey) : '',
      youtubeUrl: youtubeUrl,
      youtubeId: youtubeId,
      listenCount: normalizeNumber(story && story.listenCount),
      listenCount2d: normalizeNumber(story && story.listenCount2d),
      listenCount7d: normalizeNumber(story && story.listenCount7d),
      chapters: Array.isArray(story && story.chapters) ? story.chapters : (function () {
        var sid = story && story.id ? String(story.id) : '';
        var stored = sid ? getChaptersForStory(sid) : [];
        return stored.length ? stored : [];
      })(),
      chapterCount: normalizeNumber(story && story.chapterCount) || (function () {
        var sid = story && story.id ? String(story.id) : '';
        var stored = sid ? getChaptersForStory(sid) : [];
        return stored.length ? stored.length : 0;
      })(),
      status: normalize(story && story.status, ''),
      isCompleted: normalizeCompleted(story),
      listenHistory: pruneListenHistory(story && story.listenHistory),
      coverLegacyDataUrl: story && story.coverDataUrl ? String(story.coverDataUrl).slice(0, 30) : '',
      createdAt: story && story.createdAt ? story.createdAt : new Date().toISOString(),
      updatedAt: story && story.updatedAt ? story.updatedAt : new Date().toISOString()
    };
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function pruneListenHistory(history) {
    var now = Date.now();
    var maxAge = 30 * 24 * 60 * 60 * 1000;
    return toArray(history).filter(function (value) {
      var time = Number(value);
      return !isNaN(time) && time > 0 && now - time <= maxAge;
    });
  }

  function computeListenMetrics(story) {
    var now = Date.now();
    var twoDays = 2 * 24 * 60 * 60 * 1000;
    var sevenDays = 7 * 24 * 60 * 60 * 1000;
    var history = pruneListenHistory(story && story.listenHistory);
    var count2d = 0;
    var count7d = 0;
    history.forEach(function (time) {
      var diff = now - Number(time);
      if (diff <= sevenDays) count7d += 1;
      if (diff <= twoDays) count2d += 1;
    });
    return {
      history: history,
      listenCount: Math.max(normalizeNumber(story && story.listenCount), history.length),
      listenCount2d: count2d,
      listenCount7d: count7d
    };
  }

  // ── Chapters localStorage layer (backup until DB migration runs) ──
  var CHAPTERS_KEY = 'audiohub-chapters-v1';
  function readChaptersStore() {
    try { return JSON.parse(localStorage.getItem(CHAPTERS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeChaptersStore(obj) {
    try { localStorage.setItem(CHAPTERS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function saveChaptersForStory(sid, chapters) {
    if (!sid || !Array.isArray(chapters)) return;
    var store = readChaptersStore();
    store[sid] = chapters;
    writeChaptersStore(store);
  }
  function getChaptersForStory(sid) {
    if (!sid) return [];
    var store = readChaptersStore();
    return Array.isArray(store[sid]) ? store[sid] : [];
  }

  function upsertLocalStory(story) {
    var stories = readLocalStories();
    var entry = normalizeStory(story);

    // Save chapters to separate localStorage if present
    if (Array.isArray(story.chapters) && story.chapters.length) {
      saveChaptersForStory(entry.id, story.chapters);
      entry.chapters = story.chapters;
      entry.chapterCount = story.chapters.length;
    }

    // Merge chapters from localStorage if not in entry
    if (!entry.chapters || !entry.chapters.length) {
      var stored = getChaptersForStory(entry.id);
      if (stored.length) {
        entry.chapters = stored;
        entry.chapterCount = stored.length;
      }
    }

    var existingIndex = stories.findIndex(function (item) {
      return item.id === entry.id;
    });

    if (existingIndex >= 0) {
      stories.splice(existingIndex, 1);
    }

    stories.unshift(entry);
    writeLocalStories(stories.slice(0, 50));
    return entry;
  }

  function getLocalStoryById(id) {
    if (!id) {
      return null;
    }
    return readLocalStories().find(function (story) {
      return story.id === id;
    }) || null;
  }

  function removeLocalStory(id) {
    if (!id) {
      return false;
    }

    var stories = readLocalStories();
    var nextStories = stories.filter(function (story) {
      return story.id !== id;
    });

    if (nextStories.length === stories.length) {
      return false;
    }

    writeLocalStories(nextStories);
    return true;
  }

  function canUseApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function mapStoryPayload(story) {
    var chapters = Array.isArray(story && story.chapters) ? story.chapters : [];
    return {
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(sanitizeAuthor(story && story.author), resolveAuthorFallback()),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      readingText: normalize(story && story.readingText, ''),
      hashtags: normalizeHashtags(story && story.hashtags),
      chapterTitle: normalize(story && story.chapterTitle, 'Chương 1'),
      chapters: JSON.stringify(chapters),
      chapterCount: chapters.length || Number(story && story.chapterCount) || 0,
      visibility: normalize(story && story.visibility, 'Công khai'),
      audioStatus: normalize(story && story.audioStatus, story && story.audioKey ? 'Sẵn sàng' : 'Chưa có'),
      status: normalize(story && story.status, ''),
      isCompleted: normalizeCompleted(story),
      coverKey: story && story.coverKey ? String(story.coverKey) : null,
      coverData: story && story.coverData ? String(story.coverData) : null,
      audioKey: story && story.audioKey ? String(story.audioKey) : null,
      youtubeUrl: story && story.youtubeUrl ? normalizeYoutubeUrl(story.youtubeUrl) : null,
      youtubeId: story && story.youtubeId ? normalizeYoutubeId(story.youtubeId, story && story.youtubeUrl) : normalizeYoutubeId('', story && story.youtubeUrl)
    };
  }

  function upsertStory(story) {
    var localEntry = upsertLocalStory(story);

    // Always try to sync to backend — even without a real token yet,
    // the guest token may become available shortly. If the API rejects
    // (401), the story is still safe in localStorage.
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (hasApi) {
      var payload = mapStoryPayload(localEntry);
      if (localEntry.id && !String(localEntry.id).startsWith('s_')) {
        window.AudioHubApi.request('/stories/' + encodeURIComponent(localEntry.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      } else {
        // Skip if syncLocalStoriesToApi() is already handling this story
        if (_syncingStories[localEntry.id]) {
          return localEntry;
        }
        _syncingStories[localEntry.id] = true;
        window.AudioHubApi.request('/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (created) {
          delete _syncingStories[localEntry.id];
          if (!created || !created.id) {
            return;
          }
          // Preserve chapters from local entry before removing
          var savedChapters = Array.isArray(localEntry.chapters) ? localEntry.chapters : [];
          removeLocalStory(localEntry.id);
          upsertLocalStory({
            id: created.id,
            title: localEntry.title,
            author: localEntry.author,
            genre: localEntry.genre,
            description: localEntry.description,
            readingText: localEntry.readingText,
            hashtags: localEntry.hashtags,
            chapterTitle: localEntry.chapterTitle,
            chapters: savedChapters,
            chapterCount: savedChapters.length || localEntry.chapterCount || 0,
            visibility: localEntry.visibility,
            audioStatus: localEntry.audioStatus,
            coverKey: localEntry.coverKey,
            audioKey: localEntry.audioKey,
            youtubeUrl: localEntry.youtubeUrl,
            youtubeId: localEntry.youtubeId,
            createdAt: created.createdAt || localEntry.createdAt,
            updatedAt: created.updatedAt || new Date().toISOString()
          });
        }).catch(function () {
          delete _syncingStories[localEntry.id];
        });
      }
    }

    return localEntry;
  }

  function getStoryById(id) {
    return getLocalStoryById(id);
  }

  function clearListenHistory(id) {
    if (!id) return false;
    var story = getLocalStoryById(id);
    if (!story) return false;

    story.listenHistory = [];
    story.listenCount = normalizeNumber(story.listenCount);
    story.listenCount2d = 0;
    story.listenCount7d = 0;
    story.updatedAt = new Date().toISOString();
    upsertLocalStory(story);
    notifyStoriesUpdated();

    if (canUseApi() && !String(story.id || '').startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(String(story.id)) + '/listen/clear', { method: 'POST' })
        .catch(function (err) { console.error('Failed to clear listen history on API:', err); });
    }
    return true;
  }

  function trackListen(id) {
    if (!id) return null;
    var story = getLocalStoryById(id);

    // If story not in localStorage, still call API to record listen
    if (!story) {
      if (canUseApi() && !String(id).startsWith('s_')) {
        window.AudioHubApi.request('/stories/' + encodeURIComponent(id) + '/listen', { method: 'POST' })
          .catch(function () {});
      }
      return null;
    }

    var history = pruneListenHistory(story.listenHistory);
    history.push(Date.now());
    story.listenHistory = history;
    var metrics = computeListenMetrics(story);
    story.listenHistory = metrics.history;
    story.listenCount = metrics.listenCount;
    story.listenCount2d = metrics.listenCount2d;
    story.listenCount7d = metrics.listenCount7d;
    story.updatedAt = new Date().toISOString();
    upsertLocalStory(story);
    notifyStoriesUpdated();
    if (window.AudioHubHall && typeof window.AudioHubHall.add === 'function') {
      window.AudioHubHall.add(50);
    }

    if (canUseApi() && !String(story.id || '').startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(String(story.id)) + '/listen', { method: 'POST' })
        .then(function (result) {
          var payload = result && result.data ? result.data : result;
          if (!payload) return;
          var latest = getLocalStoryById(story.id);
          if (!latest) return;
          latest.listenCount = normalizeNumber(payload.listenCount);
          latest.listenCount2d = normalizeNumber(payload.listenCount2d);
          latest.listenCount7d = normalizeNumber(payload.listenCount7d);
          upsertLocalStory(latest);
          notifyStoriesUpdated();
        })
        .catch(function () {});
    }

    return story;
  }

  function notifyStoriesUpdated() {
    try {
      window.dispatchEvent(new CustomEvent('audiohub:stories-updated'));
    } catch (error) {
    }
  }

  function notifyStoriesSynced() {
    try {
      window.dispatchEvent(new CustomEvent('audiohub:stories-synced'));
    } catch (error) {
    }
  }

  function parseTime(value) {
    var time = Date.parse(String(value || ''));
    return isNaN(time) ? 0 : time;
  }

  function mergeStoryWithLocal(remoteEntry, localEntry) {
    if (!localEntry) {
      return remoteEntry;
    }

    var localIsDraft = String(localEntry.id || '').startsWith('s_');
    if (localIsDraft) {
      return null;
    }

    var remoteUpdated = parseTime(remoteEntry && remoteEntry.updatedAt);
    var localUpdated = parseTime(localEntry && localEntry.updatedAt);

    if (localUpdated > remoteUpdated) {
      return normalizeStory(localEntry);
    }

    var merged = normalizeStory(remoteEntry);
    if (!merged.coverKey && localEntry.coverKey) merged.coverKey = String(localEntry.coverKey);
    if (!merged.audioKey && localEntry.audioKey) merged.audioKey = String(localEntry.audioKey);
    if (!merged.youtubeUrl && localEntry.youtubeUrl) merged.youtubeUrl = String(localEntry.youtubeUrl);
    if (!merged.youtubeId && localEntry.youtubeId) merged.youtubeId = String(localEntry.youtubeId);
    if (!merged.readingText && localEntry.readingText) merged.readingText = String(localEntry.readingText);
    // Preserve local chapters if remote has none
    if ((!merged.chapters || !merged.chapters.length) && Array.isArray(localEntry.chapters) && localEntry.chapters.length) {
      merged.chapters = localEntry.chapters;
      merged.chapterCount = localEntry.chapters.length;
    }

    var mergedAuthor = sanitizeAuthor(merged.author);
    var localAuthor = sanitizeAuthor(localEntry && localEntry.author);
    if (!mergedAuthor && localAuthor) {
      merged.author = localAuthor;
    }

    return merged;
  }

  function syncFromApi() {
    if (!canUseApi()) {
      // Not logged in → fetch public stories from API
      return window.AudioHubApi.request('/stories/public', { method: 'GET' })
        .then(function (publicStories) {
          var localStories = readLocalStories();
          if (!Array.isArray(publicStories) || !publicStories.length) {
            notifyStoriesSynced();
            return localStories;
          }
          var normalized = publicStories.map(function (story) {
            return normalizeStory(story);
          }).filter(Boolean);

          // Build index of API stories by ID
          var apiIds = {};
          normalized.forEach(function (s) { apiIds[String(s.id)] = true; });

          // Keep local stories that are NOT in the API (e.g. s_ drafts not yet synced)
          var localOnly = localStories.filter(function (item) {
            if (!item || !item.id) return false;
            if (apiIds[String(item.id)]) return false;
            return true;
          });

          var merged = normalized.concat(localOnly).slice(0, 50);
          writeLocalStories(merged);
          notifyStoriesUpdated();
          notifyStoriesSynced();
          return merged;
        })
        .catch(function () {
          var localStories = readLocalStories();
          notifyStoriesSynced();
          return localStories;
        });
    }

    return window.AudioHubApi.request('/stories', { method: 'GET' })
      .then(function (remoteStories) {
        if (!Array.isArray(remoteStories)) {
          return readLocalStories();
        }

        var localStories = readLocalStories();
        var localById = {};
        localStories.forEach(function (item) {
          if (item && item.id) {
            localById[String(item.id)] = item;
          }
        });

        // Merge remote stories with local — remote wins for conflicts
        var remoteIds = {};
        var normalized = remoteStories.map(function (story) {
          var entry = normalizeStory(story);
          remoteIds[String(entry.id)] = true;
          var local = localById[String(entry.id)] || null;
          return mergeStoryWithLocal(entry, local);
        }).filter(Boolean);

        // PRESERVE local stories not in remote response (e.g. public stories from other users)
        var localOnly = localStories.filter(function (item) {
          if (!item || !item.id) return false;
          if (remoteIds[String(item.id)]) return false;
          // Remove stale s_ drafts when backend is available
          if (canUseApi() && String(item.id).startsWith('s_')) return false;
          return true;
        });

        // Khi real login (canUseApi), bỏ local s_ drafts vì đó là demo data chưa upload thật
        var drafts = canUseApi() ? [] : localStories.filter(function (story) {
          return story && story.id && String(story.id).startsWith('s_');
        }).map(function (story) {
          return normalizeStory(story);
        });

        var mergedStories = drafts.concat(normalized).concat(localOnly).slice(0, 50);
        writeLocalStories(mergedStories);
        notifyStoriesUpdated();
        notifyStoriesSynced();
        return mergedStories;
      })
      .catch(function () {
        var fallbackStories = readLocalStories();
        notifyStoriesSynced();
        return fallbackStories;
      });
  }

  function migrateAnonymousAuthors() {
    var fallbackAuthor = resolveAuthorFallback();
    if (!fallbackAuthor) return;

    var stories = readLocalStories();
    var changed = false;
    var nextStories = stories.map(function (story) {
      var current = sanitizeAuthor(story && story.author);
      if (current) return story;
      changed = true;
      var updated = Object.assign({}, story);
      updated.author = fallbackAuthor;
      updated.updatedAt = new Date().toISOString();
      return normalizeStory(updated);
    });

    if (changed) {
      writeLocalStories(nextStories);
      notifyStoriesUpdated();
    }
  }

  function removeStory(id) {
    var removed = removeLocalStory(id);
    if (removed && canUseApi() && id && !String(id).startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () {});
    }
    return removed;
  }

  // Force-sync ALL local stories to backend (for fixing stale localStorage)
  function forceSyncAllToApi() {
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (!hasApi) return Promise.reject(new Error('No API client'));

    // Wake up Render free tier — it sleeps after inactivity and takes 30-60s to start
    var baseUrl = window.AudioHubApi.getBaseUrl ? window.AudioHubApi.getBaseUrl() : 'https://audiohub-276v.onrender.com/api/v1';
    var healthUrl = baseUrl.replace('/api/v1', '') + '/health';
    var maxRetries = 6;
    var attempt = 0;

    function wakeUp() {
      attempt++;
      console.log('[forceSync] Wake-up attempt ' + attempt + '/' + maxRetries + ' — pinging backend...');
      // Use no-cors to trigger wake-up without CORS blocking
      fetch(healthUrl, { method: 'GET', mode: 'no-cors' }).catch(function () {});

      // Wait 15s for Render to fully start, then check with real request
      return new Promise(function (resolve) {
        setTimeout(function () {
          console.log('[forceSync] Checking if backend is ready...');
          fetch(healthUrl, { method: 'GET' })
            .then(function (res) {
              if (res.ok) {
                console.log('[forceSync] ✅ Backend is awake and ready!');
                resolve(true);
              } else {
                retryOrGiveUp();
              }
            })
            .catch(function () {
              retryOrGiveUp();
            });

          function retryOrGiveUp() {
            if (attempt >= maxRetries) {
              console.log('[forceSync] ❌ Backend not ready after ' + maxRetries + ' attempts, proceeding anyway...');
              resolve(false);
            } else {
              console.log('[forceSync] Backend not ready, retrying in 15s...');
              resolve(wakeUp());
            }
          }
        }, 15000);
      });
    }

    return wakeUp().then(function () {
      return forceSyncAllInner();
    });
  }

  function forceSyncAllInner() {
    var localStories = readLocalStories();
    var results = [];
    localStories.forEach(function (story) {
      if (!story || !story.id) return;
      var payload = mapStoryPayload(story);
      var isLocal = String(story.id).startsWith('s_');
      var promise = isLocal
        ? window.AudioHubApi.request('/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (created) {
            if (created && created.id) {
              var savedChapters = Array.isArray(story.chapters) ? story.chapters : [];
              removeLocalStory(story.id);
              upsertLocalStory({
                id: created.id, title: story.title, author: story.author,
                genre: story.genre, description: story.description,
                readingText: story.readingText, hashtags: story.hashtags,
                chapterTitle: story.chapterTitle, chapters: savedChapters,
                chapterCount: savedChapters.length || story.chapterCount || 0,
                visibility: story.visibility, audioStatus: story.audioStatus,
                coverKey: story.coverKey, audioKey: story.audioKey,
                youtubeUrl: story.youtubeUrl, youtubeId: story.youtubeId,
                createdAt: created.createdAt || story.createdAt,
                updatedAt: created.updatedAt || new Date().toISOString()
              });
              return { oldId: story.id, newId: created.id, title: story.title, ok: true };
            }
            return { oldId: story.id, title: story.title, ok: false, reason: 'no-id' };
          })
        : window.AudioHubApi.request('/stories/' + encodeURIComponent(story.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function () {
            return { id: story.id, title: story.title, ok: true };
          }).catch(function () {
            // PATCH failed — story not in backend, try POST instead
            return window.AudioHubApi.request('/stories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).then(function (created) {
              if (created && created.id) {
                var savedChapters = Array.isArray(story.chapters) ? story.chapters : [];
                removeLocalStory(story.id);
                upsertLocalStory({
                  id: created.id, title: story.title, author: story.author,
                  genre: story.genre, description: story.description,
                  readingText: story.readingText, hashtags: story.hashtags,
                  chapterTitle: story.chapterTitle, chapters: savedChapters,
                  chapterCount: savedChapters.length || story.chapterCount || 0,
                  visibility: story.visibility, audioStatus: story.audioStatus,
                  coverKey: story.coverKey, audioKey: story.audioKey,
                  youtubeUrl: story.youtubeUrl, youtubeId: story.youtubeId,
                  createdAt: created.createdAt || story.createdAt,
                  updatedAt: created.updatedAt || new Date().toISOString()
                });
                return { oldId: story.id, newId: created.id, title: story.title, ok: true };
              }
              return { oldId: story.id, title: story.title, ok: false, reason: 'post-failed' };
            }).catch(function (e) {
              return { oldId: story.id, title: story.title, ok: false, reason: String(e.message || e) };
            });
          });
      results.push(promise);
    });
    return Promise.all(results);
  }

  window.AudioHubStories = {
    read: readLocalStories,
    upsert: upsertStory,
    getById: getStoryById,
    remove: removeStory,
    sync: syncFromApi,
    trackListen: trackListen,
    clearListenHistory: clearListenHistory,
    forceSyncAll: forceSyncAllToApi
  };

  // Auto-sync local s_ stories to backend (one-time per story)
  // Track stories currently being synced to prevent duplicate POSTs
  var _syncingStories = {};
  function syncLocalStoriesToApi() {
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (!hasApi) return;
    var localStories = readLocalStories();
    var localDrafts = localStories.filter(function (s) {
      if (!s || !s.id || !String(s.id).startsWith('s_')) return false;
      // Skip stories already being synced by upsertStory()
      if (_syncingStories[s.id]) return false;
      return true;
    });
    if (!localDrafts.length) return;

    localDrafts.forEach(function (story) {
      // Mark as syncing to prevent upsertStory() from also POSTing
      _syncingStories[story.id] = true;

      // Try to upload audio from IndexedDB first
      var audioPromise = (story.audioKey && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function')
        ? window.AudioHubStoryAudio.get(story.audioKey).then(function (blob) {
            return blob ? { audioKey: story.audioKey, audioBlob: blob } : { audioKey: story.audioKey };
          }).catch(function () { return { audioKey: story.audioKey }; })
        : Promise.resolve({});

      audioPromise.then(function (audioInfo) {
        var payload = mapStoryPayload(story);

        window.AudioHubApi.request('/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (created) {
          delete _syncingStories[story.id];
          if (!created || !created.id) return;

          // Upload audio blob to new story if we have one
          if (audioInfo.audioBlob) {
            var audioForm = new FormData();
            audioForm.append('audio', audioInfo.audioBlob, 'audio.mp3');
            window.AudioHubApi.request('/stories/' + encodeURIComponent(created.id) + '/audio', {
              method: 'POST',
              body: audioForm
            }).catch(function () {});
          }

          var savedChapters = Array.isArray(story.chapters) ? story.chapters : [];
          removeLocalStory(story.id); // Remove old s_ entry
          upsertLocalStory({
            id: created.id,
            title: story.title,
            author: story.author,
            genre: story.genre,
            description: story.description,
            readingText: story.readingText,
            hashtags: story.hashtags,
            chapterTitle: story.chapterTitle,
            chapters: savedChapters,
            chapterCount: savedChapters.length || story.chapterCount || 0,
            visibility: story.visibility,
            audioStatus: story.audioStatus,
            coverKey: story.coverKey,
            audioKey: story.audioKey,
            youtubeUrl: story.youtubeUrl,
            youtubeId: story.youtubeId,
            createdAt: created.createdAt || story.createdAt,
            updatedAt: created.updatedAt || new Date().toISOString()
          });
        }).catch(function () {
          delete _syncingStories[story.id];
        });
      });
    });
  }

  migrateAnonymousAuthors();

  // Wait for guest token (from auth-state.js) before syncing local stories to backend.
  // ensureGuestToken() is async — if it hasn't resolved yet, retry shortly.
  function trySyncThenFetch(attempt) {
    var hasToken = !!(window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && window.AudioHubApi.getToken());
    if (!hasToken && attempt < 5) {
      setTimeout(function () { trySyncThenFetch(attempt + 1); }, 800);
      return;
    }
    syncLocalStoriesToApi();
    setTimeout(function () {
      syncFromApi().then(function () {
        migrateAnonymousAuthors();
      });
    }, 1500);
  }
  trySyncThenFetch(0);
})();
