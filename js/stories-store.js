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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
    } catch (error) {
    }
    return next;
  }

  function writeLocalStories(stories) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
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

  function normalizeStory(story) {
    return {
      id: story && story.id ? String(story.id) : makeId(),
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(story && story.author, 'Ẩn danh'),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      readingText: normalize(story && story.readingText, ''),
      hashtags: normalizeHashtags(story && story.hashtags),
      chapterTitle: normalize(story && story.chapterTitle, 'Chương 1'),
      visibility: normalize(story && story.visibility, 'Riêng tư'),
      audioStatus: normalize(story && story.audioStatus, story && story.audioKey ? 'Sẵn sàng' : 'Chưa có'),
      coverDataUrl: '',
      coverKey: story && story.coverKey ? String(story.coverKey) : '',
      audioKey: story && story.audioKey ? String(story.audioKey) : '',
      listenCount: normalizeNumber(story && story.listenCount),
      listenCount2d: normalizeNumber(story && story.listenCount2d),
      listenCount7d: normalizeNumber(story && story.listenCount7d),
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

  function upsertLocalStory(story) {
    var stories = readLocalStories();
    var entry = normalizeStory(story);
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
    return {
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(story && story.author, 'Ẩn danh'),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      readingText: normalize(story && story.readingText, ''),
      hashtags: normalizeHashtags(story && story.hashtags),
      chapterTitle: normalize(story && story.chapterTitle, 'Chương 1'),
      visibility: normalize(story && story.visibility, 'Riêng tư'),
      audioStatus: normalize(story && story.audioStatus, story && story.audioKey ? 'Sẵn sàng' : 'Chưa có'),
      coverKey: story && story.coverKey ? String(story.coverKey) : null,
      audioKey: story && story.audioKey ? String(story.audioKey) : null
    };
  }

  function upsertStory(story) {
    var localEntry = upsertLocalStory(story);

    if (canUseApi()) {
      var payload = mapStoryPayload(localEntry);
      if (localEntry.id && !String(localEntry.id).startsWith('s_')) {
        window.AudioHubApi.request('/stories/' + encodeURIComponent(localEntry.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      } else {
        window.AudioHubApi.request('/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (created) {
          if (!created || !created.id) {
            return;
          }
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
            visibility: localEntry.visibility,
            audioStatus: localEntry.audioStatus,
            coverKey: localEntry.coverKey,
            audioKey: localEntry.audioKey,
            createdAt: created.createdAt || localEntry.createdAt,
            updatedAt: created.updatedAt || new Date().toISOString()
          });
        }).catch(function () {});
      }
    }

    return localEntry;
  }

  function getStoryById(id) {
    return getLocalStoryById(id);
  }

  function trackListen(id) {
    if (!id) return null;
    var story = getLocalStoryById(id);
    if (!story) return null;

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
    if (!merged.readingText && localEntry.readingText) merged.readingText = String(localEntry.readingText);
    return merged;
  }

  function syncFromApi() {
    if (!canUseApi()) {
      return Promise.resolve(readLocalStories());
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

        var normalized = remoteStories.map(function (story) {
          var entry = normalizeStory(story);
          var local = localById[String(entry.id)] || null;
          return mergeStoryWithLocal(entry, local);
        }).filter(Boolean);

        var drafts = localStories.filter(function (story) {
          return story && story.id && String(story.id).startsWith('s_');
        }).map(function (story) {
          return normalizeStory(story);
        });

        var mergedStories = drafts.concat(normalized).slice(0, 50);
        writeLocalStories(mergedStories);
        notifyStoriesUpdated();
        return mergedStories;
      })
      .catch(function () {
        return readLocalStories();
      });
  }

  function removeStory(id) {
    var removed = removeLocalStory(id);
    if (removed && canUseApi() && id && !String(id).startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () {});
    }
    return removed;
  }

  window.AudioHubStories = {
    read: readLocalStories,
    upsert: upsertStory,
    getById: getStoryById,
    remove: removeStory,
    sync: syncFromApi,
    trackListen: trackListen
  };

  syncFromApi();
})();
