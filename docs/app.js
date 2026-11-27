(function () {
  'use strict';

  var REPO = 'kuberbassi/semester';
  var RELEASES_FALLBACK = 'https://github.com/' + REPO + '/releases/latest';
  var API_LATEST = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  // ── Footer Year ────────────────────────────────────────────────────────────
  var yearEl = document.getElementById('footer-year');
  if (yearEl) {
    yearEl.textContent = String(Math.max(2026, new Date().getFullYear()));
  }

  // ── Theme Toggle (Obsidian Dark / Porcelain Light) ─────────────────────────
  var themeToggle = document.getElementById('theme-toggle');
  var sunIcon = document.getElementById('theme-icon-sun');
  var moonIcon = document.getElementById('theme-icon-moon');

  function syncThemeIcons() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    if (sunIcon && moonIcon) {
      sunIcon.style.display = current === 'dark' ? 'block' : 'none';
      moonIcon.style.display = current === 'light' ? 'block' : 'none';
    }
  }
  syncThemeIcons();

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('semester_site_theme', next);
      } catch (_) { /* ignore */ }
      syncThemeIcons();
    });
  }

  // ── OS Detection for Primary Hero CTA ──────────────────────────────────────
  function detectPlatform() {
    var ua = (navigator.userAgent || '').toLowerCase();
    if (ua.indexOf('android') !== -1) return 'android';
    if (ua.indexOf('win') !== -1) return 'windows';
    return 'other';
  }

  var platform = detectPlatform();
  var releaseState = {
    tag: 'v1.0.0',
    publishedAt: null,
    notes: 'Visit GitHub Releases for the full changelog and build artifacts.',
    winSetup: null,
    winPortable: null,
    androidApk: null,
  };

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(iso) {
    if (!iso) return 'Latest build';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return 'Latest build';
    }
  }

  function applyReleaseUI() {
    var navVer = document.getElementById('nav-version');
    var heroReleaseText = document.getElementById('hero-release-text');
    var releaseTag = document.getElementById('release-tag');
    var releaseDate = document.getElementById('release-date');
    var winBtn = document.getElementById('win-download-btn');
    var winFile = document.getElementById('win-filename');
    var winSize = document.getElementById('win-size');
    var winPortable = document.getElementById('win-portable-link');
    var guideWinFile = document.getElementById('guide-win-file');
    var hashCmd = document.getElementById('hash-cmd');
    var androidBtn = document.getElementById('android-download-btn');
    var androidFile = document.getElementById('android-filename');
    var androidSize = document.getElementById('android-size');
    var primaryBtn = document.getElementById('primary-download-btn');
    var primaryLabel = document.getElementById('primary-download-label');
    var primaryMeta = document.getElementById('primary-download-meta');
    var cardWin = document.getElementById('card-windows');
    var cardAndroid = document.getElementById('card-android');

    if (navVer) navVer.textContent = releaseState.tag;
    if (releaseTag) releaseTag.textContent = releaseState.tag;
    if (releaseDate) releaseDate.textContent = formatDate(releaseState.publishedAt);
    if (heroReleaseText) {
      heroReleaseText.textContent = 'Latest release ' + releaseState.tag + ' · Windows x64 & Android';
    }

    var winAsset = releaseState.winSetup || releaseState.winPortable;
    if (winAsset) {
      if (winBtn) winBtn.setAttribute('href', winAsset.browser_download_url);
      if (winFile) winFile.textContent = winAsset.name;
      if (winSize) winSize.textContent = formatBytes(winAsset.size);
      if (guideWinFile) guideWinFile.textContent = winAsset.name;
      if (hashCmd) {
        hashCmd.textContent = 'Get-FileHash "$env:USERPROFILE\\Downloads\\' + winAsset.name + '" -Algorithm SHA256';
      }
    }
    if (releaseState.winPortable && winPortable) {
      winPortable.setAttribute('href', releaseState.winPortable.browser_download_url);
      winPortable.textContent = 'Download portable ' + releaseState.winPortable.name + ' (' + formatBytes(releaseState.winPortable.size) + ')';
    }

    if (releaseState.androidApk) {
      if (androidBtn) androidBtn.setAttribute('href', releaseState.androidApk.browser_download_url);
      if (androidFile) androidFile.textContent = releaseState.androidApk.name;
      if (androidSize) androidSize.textContent = formatBytes(releaseState.androidApk.size);
    }

    if (platform === 'android') {
      if (cardWin) cardWin.classList.remove('recommended');
      if (cardAndroid) cardAndroid.classList.add('recommended');
      if (primaryBtn) primaryBtn.setAttribute('href', releaseState.androidApk ? releaseState.androidApk.browser_download_url : RELEASES_FALLBACK);
      if (primaryLabel) primaryLabel.textContent = 'Download for Android (APK)';
      if (primaryMeta) {
        primaryMeta.textContent = 'Android 8.0+ · ' + (releaseState.androidApk ? formatBytes(releaseState.androidApk.size) : 'Native APK');
      }
    } else {
      if (primaryBtn) primaryBtn.setAttribute('href', winAsset ? winAsset.browser_download_url : RELEASES_FALLBACK);
      if (primaryLabel) primaryLabel.textContent = 'Download for Windows (x64)';
      if (primaryMeta) {
        primaryMeta.textContent = 'Windows 10 / 11 (x64) · NSIS Setup (' + (winAsset ? formatBytes(winAsset.size) : '~5.8 MB') + ')';
      }
    }
  }

  applyReleaseUI();

  // Hydrate dynamically from GitHub Releases API (gracefully silent if offline or no release yet)
  fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (data) {
      if (!data || !data.tag_name) return;
      releaseState.tag = String(data.tag_name).replace(/^semester-/i, '');
      releaseState.publishedAt = data.published_at || null;
      releaseState.notes = (data.body && data.body.trim())
        ? data.body.trim()
        : 'Release ' + data.tag_name + ' published on GitHub Releases.';

      var assets = Array.isArray(data.assets) ? data.assets : [];
      for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        var name = String(a.name || '').toLowerCase();
        if (name.endsWith('-setup.exe') || name.endsWith('.msi')) {
          releaseState.winSetup = a;
        } else if (name.endsWith('.exe')) {
          releaseState.winPortable = a;
        } else if (name.endsWith('.apk')) {
          releaseState.androidApk = a;
        }
      }
      applyReleaseUI();
    })
    .catch(function () {
      // Fallback links to GitHub Releases remain active.
    });

  // ── Release Notes Modal ────────────────────────────────────────────────────
  var modal = document.getElementById('notes-modal');
  var modalTitle = document.getElementById('notes-modal-title');
  var modalBody = document.getElementById('notes-modal-body');
  var openNotesBtn = document.getElementById('open-notes-btn');
  var closeNotesBtn = document.getElementById('close-notes-btn');

  function closeModal() {
    if (modal) modal.classList.remove('open');
  }

  if (openNotesBtn && modal) {
    openNotesBtn.addEventListener('click', function () {
      if (modalTitle) modalTitle.textContent = 'Semester ' + releaseState.tag + ' — Release Notes';
      if (modalBody) modalBody.textContent = releaseState.notes;
      modal.classList.add('open');
    });
  }
  if (closeNotesBtn) closeNotesBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // ── Copy SHA-256 Verification Command ──────────────────────────────────────
  var copyBtn = document.getElementById('copy-hash-btn');
  var hashCmdEl = document.getElementById('hash-cmd');
  if (copyBtn && hashCmdEl) {
    copyBtn.addEventListener('click', function () {
      var text = hashCmdEl.textContent || '';
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = 'Copied';
        setTimeout(function () {
          copyBtn.textContent = 'Copy';
        }, 1600);
      }).catch(function () { /* ignore */ });
    });
  }

  // ── Interactive Native Window Preview (Tabs + Live Bunk-Guard Simulator) ───
  var tabBtns = document.querySelectorAll('[data-preview-tab]');
  for (var t = 0; t < tabBtns.length; t++) {
    tabBtns[t].addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var target = btn.getAttribute('data-preview-tab');
      for (var j = 0; j < tabBtns.length; j++) {
        var isMatch = tabBtns[j] === btn;
        tabBtns[j].classList.toggle('active', isMatch);
        tabBtns[j].setAttribute('aria-selected', isMatch ? 'true' : 'false');
      }
      var panes = document.querySelectorAll('.preview-view');
      for (var k = 0; k < panes.length; k++) {
        panes[k].classList.toggle('active', panes[k].id === 'preview-' + target);
      }
    });
  }

  var TARGET_PCT = 75;
  var DIAL_CIRC = 2 * Math.PI * 42;
  var demoSubjects = [
    { code: 'CIC-209', name: 'Data Structures', attended: 29, total: 36 },
    { code: 'ES-201', name: 'Computational Methods', attended: 24, total: 34 },
    { code: 'ECC-207', name: 'Digital Logic & Design', attended: 23, total: 28 },
    { code: 'CIC-205', name: 'Discrete Mathematics', attended: 21, total: 26 },
  ];

  var listEl = document.getElementById('preview-subject-list');
  var dialArc = document.getElementById('preview-dial-arc');
  var overallPctEl = document.getElementById('preview-overall-pct');
  var overallCountEl = document.getElementById('preview-overall-count');
  var bunkPillEl = document.getElementById('preview-bunk-pill');
  var riskPillEl = document.getElementById('preview-risk-pill');

  function renderPreviewDashboard() {
    var totalAtt = 0;
    var totalCls = 0;
    var riskCount = 0;

    for (var i = 0; i < demoSubjects.length; i++) {
      var s = demoSubjects[i];
      totalAtt += s.attended;
      totalCls += s.total;
      if ((s.attended / Math.max(1, s.total)) * 100 < TARGET_PCT) {
        riskCount++;
      }
    }

    var pct = totalCls > 0 ? (totalAtt / totalCls) * 100 : 0;
    var rounded = Math.round(pct);
    var safeBunks = Math.max(0, Math.floor((totalAtt * 100 - TARGET_PCT * totalCls) / TARGET_PCT));
    var needed = pct < TARGET_PCT ? Math.ceil((TARGET_PCT * totalCls - totalAtt * 100) / (100 - TARGET_PCT)) : 0;

    if (dialArc) {
      dialArc.style.strokeDashoffset = String(DIAL_CIRC * (1 - Math.min(100, pct) / 100));
    }
    if (overallPctEl) overallPctEl.textContent = rounded + '%';
    if (overallCountEl) {
      overallCountEl.textContent = totalAtt + ' / ' + totalCls + ' eligible classes · Goal ' + TARGET_PCT + '%';
    }
    if (bunkPillEl) {
      if (pct >= TARGET_PCT) {
        bunkPillEl.textContent = safeBunks + (safeBunks === 1 ? ' Safe Bunk' : ' Safe Bunks');
        bunkPillEl.className = 'stat-pill good tabular';
      } else {
        bunkPillEl.textContent = 'Need ' + needed + ' cls';
        bunkPillEl.className = 'stat-pill risk tabular';
      }
    }
    if (riskPillEl) {
      riskPillEl.textContent = riskCount === 0
        ? 'All Subjects On Track'
        : riskCount + ' Below Target';
      riskPillEl.className = riskCount === 0 ? 'stat-pill good tabular' : 'stat-pill risk tabular';
    }

    if (!listEl) return;
    listEl.textContent = '';

    for (var idx = 0; idx < demoSubjects.length; idx++) {
      (function (index) {
        var sub = demoSubjects[index];
        var subPct = Math.round((sub.attended / Math.max(1, sub.total)) * 100);
        var below = subPct < TARGET_PCT;

        var row = document.createElement('div');
        row.className = 'sub-row';

        var meta = document.createElement('div');
        meta.className = 'sub-meta';
        var code = document.createElement('div');
        code.className = 'sub-code';
        code.textContent = sub.code + ' · ' + sub.attended + '/' + sub.total;
        var name = document.createElement('div');
        name.className = 'sub-name';
        name.textContent = sub.name;
        meta.appendChild(code);
        meta.appendChild(name);

        var controls = document.createElement('div');
        controls.className = 'sub-controls';

        var pctSpan = document.createElement('span');
        pctSpan.className = 'sub-pct tabular';
        pctSpan.style.color = below ? 'var(--rose)' : 'var(--emerald)';
        pctSpan.textContent = subPct + '%';

        var plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'mini-mark-btn present';
        plusBtn.title = 'Mark Present (+1)';
        plusBtn.setAttribute('aria-label', 'Mark ' + sub.name + ' present');
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', function () {
          demoSubjects[index].attended += 1;
          demoSubjects[index].total += 1;
          renderPreviewDashboard();
        });

        var minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'mini-mark-btn absent';
        minusBtn.title = 'Mark Absent';
        minusBtn.setAttribute('aria-label', 'Mark ' + sub.name + ' absent');
        minusBtn.textContent = '−';
        minusBtn.addEventListener('click', function () {
          demoSubjects[index].total += 1;
          renderPreviewDashboard();
        });

        controls.appendChild(pctSpan);
        controls.appendChild(plusBtn);
        controls.appendChild(minusBtn);

        row.appendChild(meta);
        row.appendChild(controls);
        listEl.appendChild(row);
      })(idx);
    }
  }

  renderPreviewDashboard();
})();
