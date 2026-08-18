/**
 * AudioHub Story Cache Instrumentation
 * ══════════════════════════════════════
 * Paste this ENTIRE script into the browser console.
 * It monkey-patches every writer of "audiohub-stories" localStorage.
 *
 * After pasting, reproduce the bug:
 *   1. Login as Admin
 *   2. Create a story
 *   3. Open Account
 *   4. Return to Home
 *
 * Every modification to audiohub-stories will be logged with:
 *   - timestamp
 *   - function name
 *   - file:line
 *   - call stack
 *   - old value length → new value length
 *   - whether any story IDs were removed
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'audiohub-stories';
  var callLog = [];
  var enabled = true;

  function getStackTrace() {
    var err = new Error();
    var stack = err.stack || '';
    // Remove the instrument frame and Error constructor
    var lines = stack.split('\n').slice(2, 12);
    return lines.map(function (l) { return l.trim(); }).join('\n    ');
  }

  function getCallerInfo() {
    var err = new Error();
    var stack = err.stack || '';
    var lines = stack.split('\n');
    // Find first frame that isn't this instrumentation code
    for (var i = 2; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('instrument-audiohub-stories') === -1 &&
          line.indexOf('getStackTrace') === -1 &&
          line.indexOf('getCallerInfo') === -1 &&
          line.indexOf('logWrite') === -1 &&
          line.indexOf('patchLocalStorage') === -1) {
        return line;
      }
    }
    return lines[2] ? lines[2].trim() : 'unknown';
  }

  function diffIds(oldVal, newVal) {
    try {
      var oldStories = oldVal ? JSON.parse(oldVal) : [];
      var newStories = newVal ? JSON.parse(newVal) : [];
      if (!Array.isArray(oldStories) || !Array.isArray(newStories)) return {};
      var oldIds = {};
      var newIds = {};
      oldStories.forEach(function (s) { if (s && s.id) oldIds[s.id] = true; });
      newStories.forEach(function (s) { if (s && s.id) newIds[s.id] = true; });
      var removed = [];
      var added = [];
      Object.keys(oldIds).forEach(function (id) { if (!newIds[id]) removed.push(id); });
      Object.keys(newIds).forEach(function (id) { if (!oldIds[id]) added.push(id); });
      return { removed: removed, added: added };
    } catch (e) { return {}; }
  }

  function logWrite(method, args, callerInfo) {
    if (!enabled) return;
    if (args[0] !== STORAGE_KEY) return;

    var newVal = args[1] || '';
    var oldVal = '';
    try { oldVal = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}

    var oldLen = oldVal.length;
    var newLen = newVal.length;
    var delta = newLen - oldLen;
    var diff = diffIds(oldVal, newVal);

    var entry = {
      n: callLog.length + 1,
      time: new Date().toISOString().slice(11, 23),
      method: method,
      caller: callerInfo,
      oldLen: oldLen,
      newLen: newLen,
      delta: delta,
      removed: diff.removed || [],
      added: diff.added || [],
      stack: getStackTrace()
    };

    callLog.push(entry);

    // Console output
    var color = delta < 0 ? 'color:red;font-weight:bold' : (delta > 0 ? 'color:green;font-weight:bold' : 'color:gray');
    console.groupCollapsed(
      '%c[STORY-CACHE #' + entry.n + '] ' + method + ' | ' + entry.time +
      ' | ' + oldLen + '→' + newLen + ' (' + (delta >= 0 ? '+' : '') + delta + ')' +
      (diff.removed && diff.removed.length ? ' | REMOVED: ' + diff.removed.length : ''),
      color
    );
    console.log('Caller:', callerInfo);
    console.log('Old length:', oldLen, '| New length:', newLen, '| Delta:', delta);
    if (diff.removed && diff.removed.length) {
      console.log('%cREMOVED IDs:', 'color:red;font-weight:bold', diff.removed);
    }
    if (diff.added && diff.added.length) {
      console.log('Added IDs:', diff.added);
    }
    console.log('Stack:\n    ' + entry.stack);
    console.groupEnd();
  }

  // ── Patch localStorage.setItem ──
  var origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    if (key === STORAGE_KEY) {
      logWrite('localStorage.setItem()', arguments, getCallerInfo());
    }
    return origSetItem(key, value);
  };

  // ── Patch localStorage.removeItem ──
  var origRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key) {
    if (key === STORAGE_KEY) {
      logWrite('localStorage.removeItem()', arguments, getCallerInfo());
    }
    return origRemoveItem(key);
  };

  // ── Patch AudioHubStories.write if it exists ──
  if (window.AudioHubStories) {
    // Patch read to log reads (lightweight)
    var origRead = window.AudioHubStories.read;
    if (typeof origRead === 'function') {
      window.AudioHubStories.read = function () {
        return origRead.call(window.AudioHubStories);
      };
    }

    // Patch sync to log calls
    var origSync = window.AudioHubStories.sync;
    if (typeof origSync === 'function') {
      window.AudioHubStories.sync = function () {
        console.log('%c[AUDIOHUB] sync() called', 'color:orange;font-weight:bold');
        console.log('Stack:\n    ' + getCallerInfo());
        return origSync.call(window.AudioHubStories);
      };
    }

    // Patch upsert to log calls
    var origUpsert = window.AudioHubStories.upsert;
    if (typeof origUpsert === 'function') {
      window.AudioHubStories.upsert = function (story) {
        console.log('%c[AUDIOHUB] upsert() called for:', 'color:cyan;font-weight:bold', story && story.id, story && story.title);
        console.log('Stack:\n    ' + getCallerInfo());
        return origUpsert.apply(window.AudioHubStories, arguments);
      };
    }

    // Patch remove to log calls
    var origRemove = window.AudioHubStories.remove;
    if (typeof origRemove === 'function') {
      window.AudioHubStories.remove = function (id) {
        console.log('%c[AUDIOHUB] remove() called for:', 'color:red;font-weight:bold', id);
        console.log('Stack:\n    ' + getCallerInfo());
        return origRemove.call(window.AudioHubStories, id);
      };
    }
  }

  // ── Expose API for querying ──
  window.__storyCacheLog = callLog;

  window.__storyCacheReport = function () {
    console.log('%c═══ STORY CACHE WRITE REPORT ═══', 'background:#1e293b;color:#f59e0b;font-size:14px;padding:4px 8px');
    console.log('Total writes:', callLog.length);
    callLog.forEach(function (entry) {
      var icon = entry.delta < 0 ? '🔴' : (entry.delta > 0 ? '🟢' : '⚪');
      console.log(
        icon + ' #' + entry.n + ' | ' + entry.time + ' | ' + entry.method +
        ' | ' + entry.oldLen + '→' + entry.newLen +
        (entry.removed.length ? ' | REMOVED: ' + entry.removed.join(', ') : ''),
        '\n    ' + entry.caller
      );
    });
  };

  window.__storyCacheReset = function () {
    callLog.length = 0;
    console.log('Log cleared.');
  };

  console.log('%c═══ AudioHub Story Cache Instrumentation Active ═══', 'background:#059669;color:white;font-size:14px;padding:4px 8px');
  console.log('Every write to "audiohub-stories" will be logged.');
  console.log('Commands:');
  console.log('  __storyCacheReport()  — print full report');
  console.log('  __storyCacheReset()   — clear log');
  console.log('  __storyCacheLog       — raw log array');
})();
