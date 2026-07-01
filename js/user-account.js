(function() {
  'use strict';

  /* ═══ HELPERS ═══ */
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function fmt(n) { return (n || 0).toLocaleString('vi-VN'); }
  function fmtMoney(n) { return fmt(Math.abs(n)) + (n >= 0 ? '' : '') + '₫'; }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('vi-VN'); } catch(e) { return '--'; } }
  function fmtTimeAgo(s) {
    var diff = Date.now() - new Date(s).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return mins + ' phút trước';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' giờ trước';
    var days = Math.floor(hrs / 24);
    return days + ' ngày trước';
  }

  var PAGE_SIZE = 12;

  /* ═══ DEVICE DETECTION ═══ */
  function detectDevice() {
    var ua = navigator.userAgent;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      if (/iPad|Tablet/i.test(ua)) return 'Tablet';
      return 'Mobile';
    }
    return 'Desktop';
  }

  /* ═══ AUTH DATA ═══ */
  function getAuth() {
    try {
      var raw = localStorage.getItem('audiohub-demo-auth');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function getAvatar() {
    try {
      return localStorage.getItem('audiohub-account-avatar-v1') || '';
    } catch(e) { return ''; }
  }

  /* ═══ LIBRARY DATA ═══ */
  function getLibrary() {
    try {
      var raw = localStorage.getItem('audiohub-library');
      return raw ? JSON.parse(raw) : { favorites: [], history: [] };
    } catch(e) { return { favorites: [], history: [] }; }
  }

  function getStories() {
    try {
      if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
        return window.AudioHubStories.read() || [];
      }
      var raw = localStorage.getItem('audiohub-stories');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function getPlaylists() {
    try {
      var raw = localStorage.getItem('audiohub-playlists-v1');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch(e) { return []; }
  }

  /* ═══ WALLET DATA ═══ */
  function getWallet() {
    try {
      var raw = localStorage.getItem('audiohub-wallet-v1');
      return raw ? JSON.parse(raw) : { balance: 0, transactions: [] };
    } catch(e) { return { balance: 0, transactions: [] }; }
  }

  function saveWallet(data) {
    localStorage.setItem('audiohub-wallet-v1', JSON.stringify(data));
  }

  /* ═══ NOTIFICATIONS DATA ═══ */
  function getNotifications() {
    try {
      var raw = localStorage.getItem('audiohub-notifications-v1');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch(e) { return []; }
  }

  function saveNotifications(list) {
    localStorage.setItem('audiohub-notifications-v1', JSON.stringify(list));
  }

  /* ═══ UNLOCKED CHAPTERS ═══ */
  function getUnlockedChapters() {
    try {
      var raw = localStorage.getItem('audiohub-unlocked-chapters-v1');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch(e) { return []; }
  }

  /* ═══ SEED SAMPLE DATA ═══ */
  function seedNotifications() {
    var list = getNotifications();
    if (list.length > 0) return;
    var samples = [
      { id: 'n1', type: 'system', title: 'Chào mừng bạn đến với AudioHub!', message: 'Khám phá hàng nghìn truyện audio chất lượng cao.', isRead: false, createdAt: new Date().toISOString() },
      { id: 'n2', type: 'story_update', title: 'Truyện mới cập nhật', message: 'Thiên Long Bát Bộ - Chương mới đã có sẵn.', isRead: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'n3', type: 'payment', title: 'Nạp tiền thành công', message: 'Bạn đã nạp 50.000₫ vào ví thành công.', isRead: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'n4', type: 'reminder', title: 'Tiếp tục nghe!', message: 'Bạn đã nghe dở “Tam Quốc Diễn Nghọa”. Hãy tiếp tục nào!', isRead: true, createdAt: new Date(Date.now() - 172800000).toISOString() }
    ];
    saveNotifications(samples);
  }

  /* ═══ DOM REFS ═══ */
  var $ = function(sel) { return document.querySelector(sel); };
  var $$ = function(sel) { return document.querySelectorAll(sel); };

  /* ═══ RENDER PROFILE ═══ */
  function renderProfile() {
    var auth = getAuth();
    if (!auth) return;

    var name = auth.name || 'Người dùng';
    var email = auth.email || 'user@audiohub.vn';
    var initials = auth.initials || name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
    var tier = auth.tier || 'Hội viên';
    var joined = auth.createdAt ? fmtDate(auth.createdAt) : '14/05/2026';

    var nameEl = $('[data-ua-name]');
    var emailEl = $('[data-ua-email]');
    var initialsEl = $('[data-ua-initials]');
    var tierEl = $('[data-ua-tier]');
    var joinedEl = $('[data-ua-joined]');
    var deviceEl = $('[data-ua-device]');

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (initialsEl) initialsEl.textContent = initials;
    if (tierEl) tierEl.textContent = tier;
    if (joinedEl) joinedEl.textContent = joined;
    if (deviceEl) deviceEl.textContent = detectDevice() + ' / ' + (navigator.platform || 'Web');

    // Info grid
    var infoName = $('[data-ua-info-name]');
    var infoEmail = $('[data-ua-info-email]');
    var infoJoined = $('[data-ua-info-joined]');
    var infoTier = $('[data-ua-info-tier]');
    var infoDevice = $('[data-ua-info-device]');
    var infoStatus = $('[data-ua-info-status]');
    if (infoName) infoName.textContent = name;
    if (infoEmail) infoEmail.textContent = email;
    if (infoJoined) infoJoined.textContent = joined;
    if (infoTier) infoTier.textContent = tier;
    if (infoDevice) infoDevice.textContent = detectDevice();
    if (infoStatus) infoStatus.textContent = '● Đang hoạt động';

    // Avatar
    var avatarEl = $('[data-ua-avatar]');
    var avatar = getAvatar();
    if (avatarEl && avatar) {
      avatarEl.innerHTML = '<img src="' + esc(avatar) + '" alt="Avatar" />';
    }

    // Stats
    var lib = getLibrary();
    var stories = getStories();
    var playlists = getPlaylists();
    var chapters = getUnlockedChapters();

    var statListens = $('[data-ua-stat-listens]');
    var statFavs = $('[data-ua-stat-favorites]');
    var statPls = $('[data-ua-stat-playlists]');
    var statCh = $('[data-ua-stat-chapters]');
    if (statListens) statListens.textContent = fmt(lib.history ? lib.history.length : 0);
    if (statFavs) statFavs.textContent = fmt(lib.favorites ? lib.favorites.length : 0);
    if (statPls) statPls.textContent = fmt(playlists.length);
    if (statCh) statCh.textContent = fmt(chapters.length);
  }

  /* ═══ RENDER HISTORY ═══ */
  function renderHistory() {
    var container = $('[data-ua-history-list]');
    if (!container) return;

    var lib = getLibrary();
    var stories = getStories();
    var history = lib.history || [];

    if (!history.length) {
      container.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-headphones"></i><p>Chưa có lịch sử nghe</p></div>';
      return;
    }

    // Sort by most recent
    history.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

    var html = '';
    var shown = {};
    history.forEach(function(h) {
      var sid = h.storyId || h.id;
      if (shown[sid]) return;
      shown[sid] = true;
      var story = stories.find(function(s) { return String(s.id) === String(sid); });
      if (!story) return;
      var title = story.title || 'Truyện mới';
      var genre = story.genre || 'Khác';
      var chapter = h.chapter || h.chapterIdx || 0;
      var time = h.timestamp ? fmtTimeAgo(h.timestamp) : '';

      html += '<a href="story-detail.html?id=' + encodeURIComponent(sid) + '" class="ua-list-item">'
        + '<div class="ua-list-thumb"><i class="fa-solid fa-headphones"></i></div>'
        + '<div class="ua-list-info">'
        + '<div class="ua-list-title">' + esc(title) + '</div>'
        + '<div class="ua-list-meta">' + esc(genre) + ' • Chương ' + (chapter + 1) + ' • ' + time + '</div>'
        + '</div>'
        + '<div class="ua-list-actions">'
        + '<button type="button" class="btn btn--primary btn--sm" data-ua-continue="' + esc(sid) + '"><i class="fa-solid fa-play"></i> Tiếp</button>'
        + '</div>'
        + '</a>';
    });

    container.innerHTML = html || '<div class="ua-empty"><i class="fa-solid fa-headphones"></i><p>Chưa có lịch sử nghe</p></div>';
  }

  /* ═══ RENDER FAVORITES ═══ */
  function renderFavorites() {
    var container = $('[data-ua-favorites-list]');
    if (!container) return;

    var lib = getLibrary();
    var stories = getStories();
    var favs = lib.favorites || [];

    if (!favs.length) {
      container.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-heart"></i><p>Chưa có truyện yêu thích</p></div>';
      return;
    }

    var html = '';
    favs.forEach(function(favId) {
      var story = stories.find(function(s) { return String(s.id) === String(favId); });
      if (!story) return;
      var title = story.title || 'Truyện mới';
      var genre = story.genre || 'Khác';
      var author = story.author || 'Ẩn danh';
      var views = story.listenCount || story.views || 0;

      html += '<a href="story-detail.html?id=' + encodeURIComponent(story.id) + '" class="ua-list-item">'
        + '<div class="ua-list-thumb"><i class="fa-solid fa-heart"></i></div>'
        + '<div class="ua-list-info">'
        + '<div class="ua-list-title">' + esc(title) + '</div>'
        + '<div class="ua-list-meta">' + esc(genre) + ' • ' + esc(author) + ' • ' + fmt(views) + ' lượt nghe</div>'
        + '</div>'
        + '</a>';
    });

    container.innerHTML = html || '<div class="ua-empty"><i class="fa-solid fa-heart"></i><p>Chưa có truyện yêu thích</p></div>';
  }

  /* ═══ RENDER PLAYLISTS ═══ */
  function renderPlaylists() {
    var container = $('[data-ua-playlist-list]');
    if (!container) return;

    var playlists = getPlaylists();
    if (!playlists.length) {
      container.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-list"></i><p>Chưa có playlist nào</p></div>';
      return;
    }

    var html = '';
    playlists.forEach(function(pl) {
      var count = (pl.entries || []).length;
      var state = String(pl.state || '').trim();
      var badgeText = state === 'done' ? 'Bản Full' : count + ' truyện';
      var firstEntry = (pl.entries || [])[0] || {};
      var storyId = firstEntry.storyId || firstEntry.key || '';
      var href = storyId ? ('story-detail.html?id=' + encodeURIComponent(storyId) + '&playlistId=' + encodeURIComponent(pl.id)) : '#';

      html += '<a href="' + href + '" class="ua-pl-card">'
        + '<div class="ua-pl-card__thumb">'
        + '<i class="fa-solid fa-list"></i>'
        + '<span class="ua-pl-card__badge">' + badgeText + '</span>'
        + '</div>'
        + '<div class="ua-pl-card__body">'
        + '<div class="ua-pl-card__title">' + esc(pl.name || 'Playlist') + '</div>'
        + '<div class="ua-pl-card__meta">' + count + ' truyện</div>'
        + '</div>'
        + '</a>';
    });

    container.innerHTML = html;
  }

  /* ═══ RENDER UNLOCKED CHAPTERS ═══ */
  function renderChapters() {
    var container = $('[data-ua-chapters-list]');
    if (!container) return;

    var chapters = getUnlockedChapters();
    var stories = getStories();

    if (!chapters.length) {
      container.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-lock-open"></i><p>Chưa có chương nào được mở khóa</p></div>';
      return;
    }

    // Group by story
    var groups = {};
    chapters.forEach(function(ch) {
      var sid = ch.storyId;
      if (!groups[sid]) {
        var story = stories.find(function(s) { return String(s.id) === String(sid); });
        groups[sid] = { story: story, items: [] };
      }
      groups[sid].items.push(ch);
    });

    var html = '';
    Object.keys(groups).forEach(function(sid) {
      var g = groups[sid];
      var story = g.story;
      var title = story ? story.title : 'Truyện';
      var genre = story ? (story.genre || '') : '';

      html += '<div class="ua-chapter-group">'
        + '<div class="ua-chapter-group__header">'
        + '<div class="ua-chapter-group__thumb"><i class="fa-solid fa-book"></i></div>'
        + '<div><div class="ua-chapter-group__title">' + esc(title) + '</div>'
        + '<div class="ua-chapter-group__meta">' + esc(genre) + ' • ' + g.items.length + ' chương</div></div>'
        + '</div>'
        + '<div class="ua-chapter-items">';

      g.items.sort(function(a, b) { return (a.chapterIdx || 0) - (b.chapterIdx || 0); });
      g.items.forEach(function(ch) {
        html += '<div class="ua-chapter-item">'
          + '<div class="ua-chapter-idx">' + ((ch.chapterIdx || 0) + 1) + '</div>'
          + '<div class="ua-chapter-info">'
          + '<div class="ua-chapter-name">Chương ' + ((ch.chapterIdx || 0) + 1) + '</div>'
          + '<div class="ua-chapter-date">' + fmtDate(ch.unlockedAt || ch.createdAt) + '</div>'
          + '</div>'
          + '<button type="button" class="ua-chapter-listen" data-ua-listen="' + esc(sid) + '" data-chapter="' + (ch.chapterIdx || 0) + '"><i class="fa-solid fa-play"></i> Nghe</button>'
          + '</div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  /* ═══ RENDER WALLET ═══ */
  function renderWallet() {
    var wallet = getWallet();
    var balanceEl = $('[data-ua-wallet-balance]');
    var txContainer = $('[data-ua-wallet-transactions]');
    var badge = $('[data-ua-wallet-badge]');

    if (balanceEl) balanceEl.textContent = fmt(wallet.balance) + '₫';
    if (badge) {
      if (wallet.balance > 0) {
        badge.textContent = fmt(wallet.balance) + '₫';
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!txContainer) return;

    var txs = wallet.transactions || [];
    if (!txs.length) {
      txContainer.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-receipt"></i><p>Chưa có giao dịch nào</p></div>';
      return;
    }

    var html = '';
    txs.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    txs.forEach(function(tx) {
      var iconClass = 'ua-tx-icon--topup';
      var icon = 'fa-solid fa-arrow-down';
      if (tx.type === 'UNLOCK') { iconClass = 'ua-tx-icon--unlock'; icon = 'fa-solid fa-lock-open'; }
      else if (tx.type === 'REFUND') { iconClass = 'ua-tx-icon--refund'; icon = 'fa-solid fa-rotate-left'; }

      var amountClass = tx.amount >= 0 ? 'ua-tx-amount--credit' : 'ua-tx-amount--debit';
      var amountPrefix = tx.amount >= 0 ? '+' : '-';

      html += '<div class="ua-tx-item">'
        + '<div class="ua-tx-icon ' + iconClass + '"><i class="' + icon + '"></i></div>'
        + '<div class="ua-tx-info">'
        + '<div class="ua-tx-desc">' + esc(tx.description || tx.type) + '</div>'
        + '<div class="ua-tx-date">' + fmtTimeAgo(tx.createdAt) + '</div>'
        + '</div>'
        + '<div class="ua-tx-amount ' + amountClass + '">' + amountPrefix + fmtMoney(tx.amount) + '</div>'
        + '</div>';
    });

    txContainer.innerHTML = html;
  }

  /* ═══ RENDER NOTIFICATIONS ═══ */
  function renderNotifications() {
    var container = $('[data-ua-notif-list]');
    var badge = $('[data-ua-notif-badge]');
    var list = getNotifications();

    var unread = list.filter(function(n) { return !n.isRead; }).length;
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!container) return;

    if (!list.length) {
      container.innerHTML = '<div class="ua-empty"><i class="fa-solid fa-bell-slash"></i><p>Không có thông báo mới</p></div>';
      return;
    }

    var html = '';
    list.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    list.forEach(function(n) {
      var iconClass = 'ua-notif-icon--system';
      var icon = 'fa-solid fa-bell';
      if (n.type === 'payment') { iconClass = 'ua-notif-icon--payment'; icon = 'fa-solid fa-wallet'; }
      else if (n.type === 'story_update') { icon = 'fa-solid fa-book'; }
      else if (n.type === 'reminder') { icon = 'fa-solid fa-clock'; }

      html += '<div class="ua-notif-item ' + (n.isRead ? '' : 'is-unread') + '" data-ua-notif-id="' + esc(n.id) + '">'
        + '<div class="ua-notif-icon ' + iconClass + '"><i class="' + icon + '"></i></div>'
        + '<div class="ua-notif-info">'
        + '<div class="ua-notif-title">' + esc(n.title) + '</div>'
        + '<div class="ua-notif-msg">' + esc(n.message) + '</div>'
        + '<div class="ua-notif-time">' + fmtTimeAgo(n.createdAt) + '</div>'
        + '</div>'
        + '</div>';
    });

    container.innerHTML = html;
  }

  /* ═══ TAB SWITCHING ═══ */
  function switchTab(tabName) {
    // Update sidebar nav
    $$('.ua-nav-item').forEach(function(btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-ua-tab') === tabName);
    });

    // Update bottom nav
    $$('.ua-bottomnav__item').forEach(function(btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-ua-btab') === tabName);
    });

    // Update panels
    $$('.ua-panel').forEach(function(panel) {
      var isActive = panel.getAttribute('data-ua-panel') === tabName;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });

    // Render on first view
    if (tabName === 'history') renderHistory();
    else if (tabName === 'favorites') renderFavorites();
    else if (tabName === 'playlists') renderPlaylists();
    else if (tabName === 'chapters') renderChapters();
    else if (tabName === 'wallet') renderWallet();
    else if (tabName === 'notifications') renderNotifications();

    // Save active tab
    try { localStorage.setItem('ua-active-tab-v1', tabName); } catch(e) {}
  }

  /* ═══ EVENT HANDLERS ═══ */

  // Sidebar nav clicks
  $$('.ua-nav-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-ua-tab');
      switchTab(tab);
    });
  });

  // Bottom nav clicks (mobile)
  $$('.ua-bottomnav__item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-ua-btab');
      switchTab(tab);
      // Update bottom nav active state
      $$('.ua-bottomnav__item').forEach(function(b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
    });
  });

  // Stat cards click to navigate
  $$('.ua-stat-card[data-ua-stat-link]').forEach(function(card) {
    card.addEventListener('click', function() {
      var tab = card.getAttribute('data-ua-stat-link');
      if (tab) switchTab(tab);
    });
  });

  // Mobile sidebar toggle
  var sidebarToggle = $('[data-ua-sidebar-toggle]');
  var sidebar = $('[data-ua-sidebar]');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function() {
      sidebar.classList.toggle('is-open');
      sidebarToggle.textContent = sidebar.classList.contains('is-open') ? '✕ Đóng menu' : '☰ Menu';
    });
  }

  // Avatar edit
  var avatarEdit = $('[data-ua-avatar-edit]');
  var avatarInput = $('[data-ua-avatar-input]');
  if (avatarEdit && avatarInput) {
    avatarEdit.addEventListener('click', function() { avatarInput.click(); });
    avatarInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { showToast('Kích thước tỗi đa 3MB'); return; }
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        localStorage.setItem('audiohub-account-avatar-v1', dataUrl);
        var avatarEl = $('[data-ua-avatar]');
        if (avatarEl) avatarEl.innerHTML = '<img src="' + esc(dataUrl) + '" alt="Avatar" />';
        showToast('Đã cập nhật ảnh đại diện');
      };
      reader.readAsDataURL(file);
    });
  }

  // Wallet topup
  var topupBtn = $('[data-ua-wallet-topup]');
  var topupModal = $('#ua-topup-modal');

  function openModal() { if (topupModal) { topupModal.hidden = false; topupModal.style.display = 'flex'; } }
  function closeModal() { if (topupModal) { topupModal.hidden = true; topupModal.style.display = 'none'; } }

  if (topupBtn && topupModal) {
    topupBtn.addEventListener('click', function() { openModal(); });

    // Close button clicks
    document.addEventListener('click', function(e) {
      var closeBtn = e.target.closest('[data-ua-modal-close]');
      if (closeBtn) { closeModal(); return; }
      // Backdrop click
      if (e.target === topupModal) { closeModal(); return; }
    });

    // Preset buttons
    $$('.ua-preset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        $$('.ua-preset').forEach(function(b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var amount = btn.getAttribute('data-ua-topup-amount');
        var input = $('[data-ua-topup-input]');
        if (input) input.value = amount;
      });
    });

    // Confirm topup
    var confirmBtn = $('[data-ua-topup-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        var input = $('[data-ua-topup-input]');
        var amount = parseInt(input ? input.value : '0', 10);
        if (!amount || amount < 1000) { showToast('Số tiền tối thiểu là 1.000₫'); return; }

        var wallet = getWallet();
        wallet.balance += amount;
        wallet.transactions.push({
          id: 'tx_' + Date.now(),
          type: 'TOPUP',
          amount: amount,
          description: 'Nạp tiền vào ví',
          createdAt: new Date().toISOString()
        });
        saveWallet(wallet);
        closeModal();
        if (input) input.value = '';
        $$('.ua-preset').forEach(function(b) { b.classList.remove('is-active'); });
        renderWallet();
        renderProfile();
        showToast('Đã nạp ' + fmt(amount) + '₫ thành công!');
      });
    }
  }

  // Notification click to mark read
  document.addEventListener('click', function(e) {
    var notifItem = e.target.closest('[data-ua-notif-id]');
    if (!notifItem) return;
    var id = notifItem.getAttribute('data-ua-notif-id');
    var list = getNotifications();
    var found = list.find(function(n) { return n.id === id; });
    if (found && !found.isRead) {
      found.isRead = true;
      saveNotifications(list);
      renderNotifications();
    }
  });

  // Mark all notifications read
  var readAllBtn = $('[data-ua-notif-read-all]');
  if (readAllBtn) {
    readAllBtn.addEventListener('click', function() {
      var list = getNotifications();
      list.forEach(function(n) { n.isRead = true; });
      saveNotifications(list);
      renderNotifications();
      showToast('Đã đánh dấu tất cả là đã đọc');
    });
  }

  // Create playlist
  var createPlToggles = document.querySelectorAll('[data-ua-playlist-toggle]');
  var createPlForms = document.querySelectorAll('[data-ua-create-playlist]');
  var createPlBtns = document.querySelectorAll('[data-ua-playlist-create]');
  var createPlInputs = document.querySelectorAll('[data-ua-playlist-name]');

  createPlToggles.forEach(function(toggle, idx) {
    var form = createPlForms[idx];
    var input = createPlInputs[idx];
    if (!toggle || !form) return;
    toggle.addEventListener('click', function() {
      form.hidden = !form.hidden;
      if (!form.hidden && input) {
        setTimeout(function() { input.focus(); }, 50);
      }
    });
  });

  createPlBtns.forEach(function(btn, idx) {
    var input = createPlInputs[idx];
    var form = createPlForms[idx];
    if (!btn || !input) return;
    btn.addEventListener('click', function() {
      var name = input.value.trim();
      if (!name) { showToast('Nhập tên playlist'); return; }
      var playlists = getPlaylists();
      playlists.push({
        id: 'pl_' + Date.now(),
        name: name,
        entries: [],
        state: 'ongoing',
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('audiohub-playlists-v1', JSON.stringify(playlists));
      input.value = '';
      if (form) form.hidden = true;
      renderPlaylists();
      renderProfile();
      showToast('Đã tạo playlist "' + name + '"');
    });
  });

  // Toast
  function showToast(msg) {
    var toast = $('#ua-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.hidden = true; }, 3000);
  }

  /* ═══ MOBILE NAV ═══ */
  var navToggle = document.querySelector('[data-nav-toggle]');
  var navDrawer = document.querySelector('[data-nav-drawer]');
  var navOverlay = document.querySelector('[data-nav-overlay]');
  var navClose = document.querySelector('[data-nav-close]');
  function openNav() { if (navDrawer) navDrawer.classList.add('is-open'); if (navOverlay) navOverlay.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeNav() { if (navDrawer) navDrawer.classList.remove('is-open'); if (navOverlay) navOverlay.classList.remove('is-open'); document.body.style.overflow = ''; }
  if (navToggle) navToggle.addEventListener('click', openNav);
  if (navClose) navClose.addEventListener('click', closeNav);
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

  /* ═══ INIT ═══ */
  seedNotifications();
  renderProfile();

  // Restore last active tab
  var lastTab = 'profile';
  try { lastTab = localStorage.getItem('ua-active-tab-v1') || 'profile'; } catch(e) {}
  switchTab(lastTab);

})();
