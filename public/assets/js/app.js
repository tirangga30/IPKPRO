(function (root) {
  'use strict';

  var IPKApp = root.IPKApp;
  var Scales = IPKApp.Scales;
  var Calc = IPKApp.Calculator;
  var Charts = IPKApp.Charts;
  var Api = IPKApp.Api;

  var FALLBACK_STORAGE_KEY = 'ipkpro_offline_v1';

  var state = normalizeInitialState(root.__IPKPRO_INITIAL__);
  var searchQuery = '';
  var pendingConfirmAction = null;
  var draftScale = null;

  // Sync queue & debounced timers
  var activeSyncCount = 0;
  var settingsTimer = null;
  var pendingSettingsPatch = {};
  var semesterTimers = {};
  var pendingSemesterPatches = {};
  var courseTimers = {};
  var pendingCoursePatches = {};
  var tempIdResolution = {};

  var dom = {};

  function normalizeInitialState(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        version: 1,
        theme: 'light',
        onboardingDismissed: false,
        profile: { name: '', nim: '', prodi: '', university: '' },
        scale: Scales.getDefaultScale(),
        retakePolicy: 'all',
        planner: { targetIpk: 3.5, totalTargetSks: 144 },
        semesters: [],
        auth: { authenticated: false, user: null },
        db: { connected: false, driver: 'unknown' }
      };
    }
    return raw;
  }

  function isDbMode() {
    return Boolean(state.db && state.db.connected);
  }

  function saveOfflineFallback() {
    if (isDbMode()) return;
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // ignore storage errors
    }
  }

  function tempUid(prefix) {
    return 'tmp_' + (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function isTempId(id) {
    return String(id || '').indexOf('tmp_') === 0;
  }

  function resolveRealId(id) {
    var key = String(id || '');
    return tempIdResolution[key] || key;
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function setSyncStatus(mode, text) {
    if (!dom.syncStatusPill || !dom.syncStatusText) return;
    dom.syncStatusPill.classList.remove('is-saving', 'is-error', 'is-offline');
    if (mode === 'saving') {
      dom.syncStatusPill.classList.add('is-saving');
    } else if (mode === 'error') {
      dom.syncStatusPill.classList.add('is-error');
    } else if (mode === 'offline') {
      dom.syncStatusPill.classList.add('is-offline');
    }
    dom.syncStatusText.textContent = text;
  }

  function trackSync(promise) {
    if (!isDbMode()) {
      saveOfflineFallback();
      return Promise.resolve(null);
    }
    activeSyncCount++;
    setSyncStatus('saving', 'Menyimpan...');
    return promise
      .then(function (res) {
        activeSyncCount = Math.max(0, activeSyncCount - 1);
        if (activeSyncCount === 0) {
          setSyncStatus('ready', 'Tersimpan di DB');
        }
        return res;
      })
      .catch(function (err) {
        activeSyncCount = Math.max(0, activeSyncCount - 1);
        setSyncStatus('error', 'Gagal Sinkron');
        showToast(err.message || 'Gagal menyimpan ke database.', { type: 'error' });
        throw err;
      });
  }

  function scheduleSettingsSave(patch) {
    if (!isDbMode()) {
      saveOfflineFallback();
      return;
    }
    Object.assign(pendingSettingsPatch, patch);
    setSyncStatus('saving', 'Menyimpan...');
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(flushSettingsSave, 380);
  }

  function flushSettingsSave(keepalive) {
    clearTimeout(settingsTimer);
    settingsTimer = null;
    if (!isDbMode()) return;
    var keys = Object.keys(pendingSettingsPatch);
    if (!keys.length) return;
    var payload = pendingSettingsPatch;
    pendingSettingsPatch = {};
    trackSync(Api.updateSettings(payload, keepalive ? { keepalive: true } : undefined)).catch(function () {});
  }

  function scheduleSemesterSave(semId, patch) {
    if (!isDbMode()) {
      saveOfflineFallback();
      return;
    }
    var key = String(semId);
    pendingSemesterPatches[key] = Object.assign(pendingSemesterPatches[key] || {}, patch);
    setSyncStatus('saving', 'Menyimpan...');
    clearTimeout(semesterTimers[key]);
    semesterTimers[key] = setTimeout(function () {
      flushSemesterSave(key, false);
    }, 380);
  }

  function flushSemesterSave(key, keepalive) {
    clearTimeout(semesterTimers[key]);
    delete semesterTimers[key];
    if (!isDbMode()) return;
    var payload = pendingSemesterPatches[key];
    if (!payload) return;
    var realId = resolveRealId(key);
    if (isTempId(realId)) return; // will flush once real ID resolves
    delete pendingSemesterPatches[key];
    trackSync(Api.updateSemester(realId, payload, keepalive ? { keepalive: true } : undefined)).catch(function () {});
  }

  function scheduleCourseSave(courseId, patch) {
    if (!isDbMode()) {
      saveOfflineFallback();
      return;
    }
    var key = String(courseId);
    pendingCoursePatches[key] = Object.assign(pendingCoursePatches[key] || {}, patch);
    setSyncStatus('saving', 'Menyimpan...');
    clearTimeout(courseTimers[key]);
    courseTimers[key] = setTimeout(function () {
      flushCourseSave(key, false);
    }, 350);
  }

  function flushCourseSave(key, keepalive) {
    clearTimeout(courseTimers[key]);
    delete courseTimers[key];
    if (!isDbMode()) return;
    var payload = pendingCoursePatches[key];
    if (!payload) return;
    var realId = resolveRealId(key);
    if (isTempId(realId)) return;
    delete pendingCoursePatches[key];
    trackSync(Api.updateCourse(realId, payload, keepalive ? { keepalive: true } : undefined)).catch(function () {});
  }

  function cacheDom() {
    dom.headerStudentSummary = document.getElementById('headerStudentSummary');
    dom.activeScaleLabel = document.getElementById('activeScaleLabel');
    dom.syncStatusPill = document.getElementById('syncStatusPill');
    dom.syncStatusText = document.getElementById('syncStatusText');
    dom.onboardingBanner = document.getElementById('onboardingBanner');
    dom.duplicateNoticeBanner = document.getElementById('duplicateNoticeBanner');
    dom.duplicateNoticeText = document.getElementById('duplicateNoticeText');

    dom.predikatBadge = document.getElementById('predikatBadge');
    dom.ipkGaugeCircle = document.getElementById('ipkGaugeCircle');
    dom.ipkValue = document.getElementById('ipkValue');
    dom.ipkScaleMax = document.getElementById('ipkScaleMax');
    dom.totalSksValue = document.getElementById('totalSksValue');
    dom.totalSksSub = document.getElementById('totalSksSub');
    dom.totalMutuValue = document.getElementById('totalMutuValue');
    dom.totalCoursesSub = document.getElementById('totalCoursesSub');
    dom.latestIpsValue = document.getElementById('latestIpsValue');
    dom.ipsDeltaSub = document.getElementById('ipsDeltaSub');
    dom.nextMaxSksValue = document.getElementById('nextMaxSksValue');
    dom.nextMaxSksSub = document.getElementById('nextMaxSksSub');
    dom.degreeProgressPct = document.getElementById('degreeProgressPct');
    dom.degreeProgressText = document.getElementById('degreeProgressText');
    dom.degreeProgressFill = document.getElementById('degreeProgressFill');

    dom.analyticsTitle = document.getElementById('analyticsTitle');
    dom.chartTrendPanel = document.getElementById('chartTrendPanel');
    dom.chartDistributionPanel = document.getElementById('chartDistributionPanel');
    dom.trendChartContainer = document.getElementById('trendChartContainer');
    dom.distributionContainer = document.getElementById('distributionContainer');

    dom.inputTargetIpk = document.getElementById('inputTargetIpk');
    dom.inputTotalTargetSks = document.getElementById('inputTotalTargetSks');
    dom.targetFeasibilityBadge = document.getElementById('targetFeasibilityBadge');
    dom.plannerHighlightLabel = document.getElementById('plannerHighlightLabel');
    dom.plannerRequiredIps = document.getElementById('plannerRequiredIps');
    dom.plannerDescription = document.getElementById('plannerDescription');
    dom.plannerRemainingSks = document.getElementById('plannerRemainingSks');
    dom.plannerMaxPossibleIpk = document.getElementById('plannerMaxPossibleIpk');

    dom.searchCourseInput = document.getElementById('searchCourseInput');
    dom.selectRetakePolicy = document.getElementById('selectRetakePolicy');
    dom.btnToggleAllSemesters = document.getElementById('btnToggleAllSemesters');
    dom.semestersContainer = document.getElementById('semestersContainer');
    dom.btnAddSemesterBottomLabel = document.getElementById('btnAddSemesterBottomLabel');

    dom.printTranscriptSection = document.getElementById('printTranscriptSection');
    dom.toastContainer = document.getElementById('toastContainer');

    dom.modalScale = document.getElementById('modalScale');
    dom.scalePresetsGrid = document.getElementById('scalePresetsGrid');
    dom.scaleEditorBody = document.getElementById('scaleEditorBody');

    dom.modalProfile = document.getElementById('modalProfile');
    dom.profileForm = document.getElementById('profileForm');
    dom.profileName = document.getElementById('profileName');
    dom.profileNim = document.getElementById('profileNim');
    dom.profileProdi = document.getElementById('profileProdi');
    dom.profileUniversity = document.getElementById('profileUniversity');

    dom.modalData = document.getElementById('modalData');
    dom.inputImportJson = document.getElementById('inputImportJson');

    dom.modalConfirm = document.getElementById('modalConfirm');
    dom.modalConfirmTitle = document.getElementById('modalConfirmTitle');
    dom.modalConfirmMessage = document.getElementById('modalConfirmMessage');
  }

  function applyTheme(theme) {
    var mode = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
  }

  function getSemesterById(semId) {
    var target = String(semId);
    for (var i = 0; i < state.semesters.length; i++) {
      if (String(state.semesters[i].id) === target) {
        return { semester: state.semesters[i], index: i };
      }
    }
    return null;
  }

  function getCourseById(sem, courseId) {
    var target = String(courseId);
    for (var i = 0; i < sem.courses.length; i++) {
      if (String(sem.courses[i].id) === target) {
        return { course: sem.courses[i], index: i };
      }
    }
    return null;
  }

  function showToast(message, options) {
    var opts = options || {};
    var toast = document.createElement('div');
    toast.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');

    var textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (typeof opts.onUndo === 'function') {
      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'Urungkan';
      undoBtn.addEventListener('click', function () {
        opts.onUndo();
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
      toast.appendChild(undoBtn);
    }

    dom.toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('toast-leaving');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, opts.duration || 4500);
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.hidden = true;
    var anyOpen = document.querySelector('.modal-backdrop:not([hidden])');
    if (!anyOpen) {
      document.body.classList.remove('modal-open');
    }
  }

  function askConfirm(title, message, onConfirm) {
    dom.modalConfirmTitle.textContent = title;
    dom.modalConfirmMessage.textContent = message;
    pendingConfirmAction = onConfirm;
    openModal(dom.modalConfirm);
  }

  function getIpsToneClass(ips, maxWeight) {
    if (ips === null || !Number.isFinite(ips)) return 'ips-neutral';
    var ratio = maxWeight > 0 ? ips / maxWeight : 0;
    if (ratio >= 0.875) return 'ips-excellent';
    if (ratio >= 0.72) return 'ips-good';
    if (ratio >= 0.5) return 'ips-fair';
    return 'ips-poor';
  }

  function formatNumberClean(num) {
    var n = Number(num) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function updateSummaryAndCharts(summary) {
    var maxWeight = summary.maxWeight || 4.0;
    var targetSks = Math.max(1, Number(state.planner.totalTargetSks) || 144);

    var profile = state.profile || {};
    var parts = [];
    if (profile.name) parts.push(profile.name);
    if (profile.nim) parts.push(profile.nim);
    if (profile.prodi) parts.push(profile.prodi);
    dom.headerStudentSummary.textContent =
      parts.length > 0 ? parts.join(' • ') : 'Kalkulator IPK, IPS & Perencana Studi';
    dom.activeScaleLabel.textContent = state.scale.name || 'Skala Nilai';

    var namedCount = 0;
    for (var s = 0; s < state.semesters.length; s++) {
      for (var c = 0; c < state.semesters[s].courses.length; c++) {
        if ((state.semesters[s].courses[c].name || '').trim()) namedCount++;
      }
    }
    dom.onboardingBanner.hidden = state.onboardingDismissed || state.semesters.length > 1 || namedCount >= 3;

    if (summary.duplicateAcrossSemestersCount > 0 && state.retakePolicy === 'all') {
      dom.duplicateNoticeBanner.hidden = false;
      dom.duplicateNoticeText.textContent =
        'Terdeteksi ' +
        summary.duplicateAcrossSemestersCount +
        ' mata kuliah dengan nama/kode sama di semester berbeda. Aktifkan "Ambil Nilai Terbaik" jika itu matkul mengulang.';
    } else {
      dom.duplicateNoticeBanner.hidden = true;
    }

    var radius = 56;
    var circumference = 2 * Math.PI * radius;
    var ratio = summary.hasCalculableCourses ? Math.max(0, Math.min(1, summary.ipk / maxWeight)) : 0;
    var offset = circumference * (1 - ratio);
    dom.ipkGaugeCircle.style.strokeDasharray = circumference.toFixed(2);
    dom.ipkGaugeCircle.style.strokeDashoffset = offset.toFixed(2);

    dom.ipkValue.textContent = summary.ipk.toFixed(2);
    dom.ipkScaleMax.textContent = 'dari ' + maxWeight.toFixed(2);

    dom.predikatBadge.textContent = summary.predikat.label;
    dom.predikatBadge.className = 'predikat-badge predikat-' + summary.predikat.tone;

    dom.totalSksValue.textContent = formatNumberClean(summary.totalSks);
    dom.totalSksSub.textContent = 'Target ' + targetSks + ' SKS';
    dom.totalMutuValue.textContent = summary.totalMutu.toFixed(2);
    dom.totalCoursesSub.textContent = summary.totalCountedCourses + ' matkul';

    if (summary.latestIps !== null) {
      dom.latestIpsValue.textContent = summary.latestIps.toFixed(2);
      if (summary.ipsDelta !== null) {
        var sign = summary.ipsDelta >= 0 ? '+' : '';
        dom.ipsDeltaSub.textContent = sign + summary.ipsDelta.toFixed(2) + ' vs lalu';
        dom.ipsDeltaSub.className = 'metric-sub ' + (summary.ipsDelta >= 0 ? 'text-success' : 'text-danger');
      } else {
        dom.ipsDeltaSub.textContent = 'Sem. terbaru';
        dom.ipsDeltaSub.className = 'metric-sub';
      }
    } else {
      dom.latestIpsValue.textContent = '—';
      dom.ipsDeltaSub.textContent = 'Belum ada nilai';
      dom.ipsDeltaSub.className = 'metric-sub';
    }

    if (summary.nextMaxSks.maxSks !== null) {
      dom.nextMaxSksValue.textContent = summary.nextMaxSks.maxSks + ' SKS';
      dom.nextMaxSksSub.textContent = summary.nextMaxSks.note;
    } else {
      dom.nextMaxSksValue.textContent = '—';
      dom.nextMaxSksSub.textContent = 'Estimasi IPS';
    }

    var pct = Math.min(100, Math.round((summary.totalSks / targetSks) * 100));
    dom.degreeProgressPct.textContent = pct + '%';
    dom.degreeProgressText.textContent = formatNumberClean(summary.totalSks) + ' / ' + targetSks + ' SKS';
    dom.degreeProgressFill.style.width = pct + '%';

    dom.inputTargetIpk.max = maxWeight.toFixed(2);
    if (document.activeElement !== dom.inputTargetIpk) {
      dom.inputTargetIpk.value = Number(state.planner.targetIpk).toFixed(2);
    }
    if (document.activeElement !== dom.inputTotalTargetSks) {
      dom.inputTotalTargetSks.value = targetSks;
    }

    var targetRes = Calc.calculateTargetIpk({
      currentSks: summary.totalSks,
      currentMutu: summary.totalMutu,
      maxWeight: maxWeight,
      targetIpk: state.planner.targetIpk,
      totalTargetSks: targetSks
    });

    dom.targetFeasibilityBadge.textContent = targetRes.badgeText;
    dom.targetFeasibilityBadge.className = 'status-pill status-' + targetRes.badgeTone;
    dom.plannerRemainingSks.textContent = formatNumberClean(targetRes.remainingSks) + ' SKS';
    dom.plannerMaxPossibleIpk.textContent = targetRes.maxPossibleIpk.toFixed(2);
    dom.plannerDescription.textContent = targetRes.description;

    if (targetRes.requiredAvgIps === null) {
      dom.plannerHighlightLabel.textContent = 'Status Target Kelulusan';
      dom.plannerRequiredIps.textContent = summary.totalSks > 0 ? summary.ipk.toFixed(2) : '—';
    } else {
      dom.plannerHighlightLabel.textContent = 'IPS Rata-rata Dibutuhkan';
      dom.plannerRequiredIps.textContent = targetRes.requiredAvgIps.toFixed(2);
    }

    Charts.renderTrendChart(dom.trendChartContainer, summary.timeline, maxWeight, Number(state.planner.targetIpk));
    Charts.renderDistribution(
      dom.distributionContainer,
      summary.distribution,
      summary.totalCountedCourses,
      summary.totalSks,
      maxWeight
    );

    dom.selectRetakePolicy.value = state.retakePolicy;
    var allCollapsed =
      state.semesters.length > 0 &&
      state.semesters.every(function (sItem) {
        return sItem.collapsed;
      });
    dom.btnToggleAllSemesters.textContent = allCollapsed ? 'Buka Semua' : 'Tutup Semua';
    dom.btnAddSemesterBottomLabel.textContent =
      'Tambah Semester Baru (Semester ' + (state.semesters.length + 1) + ')';
  }

  function buildGradeOptionsHtml(selectedGrade) {
    var sorted = Scales.sortScaleGrades(state.scale.grades || []);
    var html = '<option value="">— Pilih —</option>';
    var found = false;
    for (var i = 0; i < sorted.length; i++) {
      var g = sorted[i];
      var isSel = selectedGrade && String(selectedGrade).toUpperCase() === g.letter.toUpperCase();
      if (isSel) found = true;
      html +=
        '<option value="' +
        escapeHtml(g.letter) +
        '"' +
        (isSel ? ' selected' : '') +
        '>' +
        escapeHtml(g.letter) +
        ' (' +
        g.weight.toFixed(2) +
        ')</option>';
    }
    if (selectedGrade && !found) {
      html +=
        '<option value="' +
        escapeHtml(selectedGrade) +
        '" selected>' +
        escapeHtml(selectedGrade) +
        ' (Tidak ada di skala)</option>';
    }
    return html;
  }

  function renderCourseRowHtml(sem, course, courseResult, rowIndex, maxWeight) {
    var res = courseResult || {};
    var isIncluded = course.included !== false;
    var mutuText = res.calculable ? res.mutu.toFixed(2) : '—';
    var tone = res.gradeEntry ? Scales.getGradeTone(res.weight, maxWeight) : 'neutral';

    var statusBadges = '';
    if (!isIncluded) {
      statusBadges += '<span class="mini-badge badge-muted">Diabaikan</span>';
    } else if (res.supersededByIpk) {
      statusBadges +=
        '<span class="mini-badge badge-amber" title="Mata kuliah ini diulang di semester lain sehingga tidak dihitung di IPK kumulatif (tetap dihitung di IPS semester ini)">Digantikan di IPK</span>';
    } else if (res.unknownGrade) {
      statusBadges +=
        '<span class="mini-badge badge-rose" title="Huruf nilai tidak ditemukan di skala nilai aktif">Huruf Tidak Dikenal</span>';
    }

    var rowClass = 'course-row';
    if (!isIncluded) rowClass += ' is-excluded';
    if (res.supersededByIpk) rowClass += ' is-superseded';

    return (
      '<tr class="' +
      rowClass +
      '" data-sem-id="' +
      escapeHtml(sem.id) +
      '" data-course-id="' +
      escapeHtml(course.id) +
      '">' +
      '<td class="col-num mono" data-label="No">' +
      (rowIndex + 1) +
      '</td>' +
      '<td class="col-code" data-label="Kode MK">' +
      '<input type="text" class="cell-input input-code mono" data-field="code" value="' +
      escapeHtml(course.code) +
      '" placeholder="IF101" maxlength="16" aria-label="Kode Mata Kuliah">' +
      '</td>' +
      '<td class="col-name" data-label="Mata Kuliah">' +
      '<div class="course-name-wrap">' +
      '<input type="text" class="cell-input input-name" data-field="name" value="' +
      escapeHtml(course.name) +
      '" placeholder="Nama mata kuliah (mis. Kalkulus I)" aria-label="Nama Mata Kuliah">' +
      '<div class="course-badges">' +
      statusBadges +
      '</div>' +
      '</div>' +
      '</td>' +
      '<td class="col-sks" data-label="SKS">' +
      '<div class="sks-stepper">' +
      '<button type="button" class="sks-step-btn" data-action="dec-sks" aria-label="Kurangi SKS">−</button>' +
      '<input type="number" class="cell-input input-sks mono" data-field="sks" min="0" max="24" step="1" value="' +
      escapeHtml(course.sks) +
      '" aria-label="Jumlah SKS">' +
      '<button type="button" class="sks-step-btn" data-action="inc-sks" aria-label="Tambah SKS">+</button>' +
      '</div>' +
      '</td>' +
      '<td class="col-score" data-label="Angka (0-100)">' +
      '<input type="number" class="cell-input input-score mono" data-field="numericScore" min="0" max="100" step="0.5" value="' +
      (course.numericScore !== null && course.numericScore !== undefined ? escapeHtml(course.numericScore) : '') +
      '" placeholder="0–100" title="Opsional: isi angka 0–100 untuk konversi huruf otomatis" aria-label="Nilai Angka">' +
      '</td>' +
      '<td class="col-grade" data-label="Nilai Huruf">' +
      '<select class="cell-select input-grade tone-' +
      tone +
      '" data-field="grade" aria-label="Nilai Huruf">' +
      buildGradeOptionsHtml(course.grade) +
      '</select>' +
      '</td>' +
      '<td class="col-mutu mono" data-label="Mutu">' +
      '<span class="mutu-val">' +
      mutuText +
      '</span>' +
      '</td>' +
      '<td class="col-actions" data-label="Aksi">' +
      '<div class="row-actions">' +
      '<button type="button" class="btn-icon-xs ' +
      (isIncluded ? 'active' : '') +
      '" data-action="toggle-include" title="' +
      (isIncluded ? 'Matkul dihitung (klik untuk simulasi abaikan)' : 'Matkul diabaikan (klik untuk hitung kembali)') +
      '" aria-label="Toggle hitung mata kuliah">' +
      (isIncluded
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>') +
      '</button>' +
      '<button type="button" class="btn-icon-xs btn-del-row" data-action="delete-course" title="Hapus mata kuliah" aria-label="Hapus mata kuliah">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
      '</button>' +
      '</div>' +
      '</td>' +
      '</tr>'
    );
  }

  function renderSemesters(summary) {
    var query = searchQuery.trim().toLowerCase();
    var html = '';
    var visibleSemesterCount = 0;

    if (state.semesters.length === 0) {
      dom.semestersContainer.innerHTML =
        '<div class="empty-workspace">' +
        '<div class="empty-icon" aria-hidden="true">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' +
        '</div>' +
        '<h3>Belum Ada Semester</h3>' +
        '<p>Klik tombol <strong>Tambah Semester Baru</strong> untuk mulai memasukkan daftar mata kuliah dan nilaimu.</p>' +
        '<button type="button" class="btn btn-primary" data-action="add-first-semester">+ Tambah Semester 1</button>' +
        '</div>';
      return;
    }

    for (var s = 0; s < state.semesters.length; s++) {
      var sem = state.semesters[s];
      var semSum = summary.semesters[s] || { sks: 0, mutu: 0, ips: null, countedCourses: 0, courseMap: {} };

      var matchingCourses = [];
      for (var c = 0; c < sem.courses.length; c++) {
        var mk = sem.courses[c];
        if (!query) {
          matchingCourses.push({ course: mk, origIndex: c });
        } else {
          var hay = ((mk.code || '') + ' ' + (mk.name || '') + ' ' + (sem.name || '')).toLowerCase();
          if (hay.indexOf(query) !== -1) {
            matchingCourses.push({ course: mk, origIndex: c });
          }
        }
      }

      if (query && matchingCourses.length === 0) continue;

      visibleSemesterCount++;
      var ipsStr = semSum.ips !== null ? semSum.ips.toFixed(2) : '—';
      var ipsClass = getIpsToneClass(semSum.ips, summary.maxWeight);
      var isCollapsed = Boolean(sem.collapsed) && !query;

      var rowsHtml = '';
      if (matchingCourses.length === 0) {
        rowsHtml =
          '<tr class="empty-sem-row"><td colspan="8">' +
          '<div class="empty-sem-box">' +
          '<span>Belum ada mata kuliah di semester ini.</span>' +
          '<button type="button" class="btn btn-secondary btn-xs" data-action="add-course" data-sem-id="' +
          escapeHtml(sem.id) +
          '">+ Tambah Matkul Pertama</button>' +
          '</div>' +
          '</td></tr>';
      } else {
        for (var m = 0; m < matchingCourses.length; m++) {
          var item = matchingCourses[m];
          rowsHtml += renderCourseRowHtml(
            sem,
            item.course,
            semSum.courseMap[item.course.id],
            item.origIndex,
            summary.maxWeight
          );
        }
      }

      html +=
        '<article class="semester-card' +
        (isCollapsed ? ' is-collapsed' : '') +
        '" data-sem-id="' +
        escapeHtml(sem.id) +
        '">' +
        '<header class="semester-header">' +
        '<div class="sem-title-group">' +
        '<button type="button" class="btn-collapse" data-action="toggle-collapse" title="' +
        (isCollapsed ? 'Buka semester' : 'Tutup semester') +
        '" aria-label="Toggle buka tutup semester">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<div class="sem-inputs-wrap">' +
        '<input type="text" class="sem-name-input" data-sem-field="name" value="' +
        escapeHtml(sem.name) +
        '" aria-label="Nama Semester">' +
        '<input type="text" class="sem-period-input" data-sem-field="period" value="' +
        escapeHtml(sem.period || '') +
        '" placeholder="Ganjil / Genap / Tahun" aria-label="Periode Semester">' +
        '</div>' +
        '</div>' +
        '<div class="sem-meta-actions">' +
        '<div class="sem-stats-pills">' +
        '<span class="sem-stat-chip mono" data-sem-stat="courses">' +
        sem.courses.length +
        ' MK</span>' +
        '<span class="sem-stat-chip mono" data-sem-stat="sks">' +
        formatNumberClean(semSum.sks) +
        ' SKS</span>' +
        '<span class="sem-stat-chip mono hide-sm" data-sem-stat="mutu">Mutu: ' +
        semSum.mutu.toFixed(2) +
        '</span>' +
        '<span class="ips-pill mono ' +
        ipsClass +
        '" data-sem-stat="ips">IPS: ' +
        ipsStr +
        '</span>' +
        '</div>' +
        '<div class="sem-action-btns">' +
        '<button type="button" class="btn-icon-sm" data-action="move-sem-up" ' +
        (s === 0 ? 'disabled ' : '') +
        'title="Pindah ke atas" aria-label="Pindah semester ke atas">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>' +
        '</button>' +
        '<button type="button" class="btn-icon-sm" data-action="move-sem-down" ' +
        (s === state.semesters.length - 1 ? 'disabled ' : '') +
        'title="Pindah ke bawah" aria-label="Pindah semester ke bawah">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<button type="button" class="btn-icon-sm" data-action="duplicate-sem" title="Duplikat semester ini" aria-label="Duplikat semester">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
        '</button>' +
        '<button type="button" class="btn-icon-sm btn-del-sem" data-action="delete-sem" title="Hapus semester" aria-label="Hapus semester">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
        '</button>' +
        '</div>' +
        '</div>' +
        '</header>' +
        '<div class="semester-body"' +
        (isCollapsed ? ' hidden' : '') +
        '>' +
        '<div class="course-table-wrap">' +
        '<table class="course-table">' +
        '<thead>' +
        '<tr>' +
        '<th class="col-num">#</th>' +
        '<th class="col-code">Kode</th>' +
        '<th class="col-name">Mata Kuliah</th>' +
        '<th class="col-sks">SKS</th>' +
        '<th class="col-score">Angka <span class="th-opt">(opsional)</span></th>' +
        '<th class="col-grade">Nilai Huruf</th>' +
        '<th class="col-mutu">Mutu</th>' +
        '<th class="col-actions">Aksi</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>' +
        rowsHtml +
        '</tbody>' +
        '</table>' +
        '</div>' +
        '<div class="semester-footer">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="add-course" data-sem-id="' +
        escapeHtml(sem.id) +
        '">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
        '<span>Tambah Mata Kuliah</span>' +
        '</button>' +
        '<span class="sem-footer-hint">Tips: tekan <kbd>Enter</kbd> di baris matkul untuk tambah baris berikutnya dengan cepat.</span>' +
        '</div>' +
        '</div>' +
        '</article>';
    }

    if (query && visibleSemesterCount === 0) {
      dom.semestersContainer.innerHTML =
        '<div class="empty-workspace">' +
        '<h3>Tidak Ditemukan</h3>' +
        '<p>Tidak ada mata kuliah yang cocok dengan pencarian "<strong>' +
        escapeHtml(searchQuery) +
        '</strong>".</p>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="btnClearSearchInline">Bersihkan Pencarian</button>' +
        '</div>';
      var clrBtn = document.getElementById('btnClearSearchInline');
      if (clrBtn) {
        clrBtn.addEventListener('click', function () {
          searchQuery = '';
          dom.searchCourseInput.value = '';
          renderAll();
        });
      }
      return;
    }

    dom.semestersContainer.innerHTML = html;
  }

  function updateDomInPlaceAfterEdit() {
    var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
    updateSummaryAndCharts(summary);

    for (var s = 0; s < state.semesters.length; s++) {
      var sem = state.semesters[s];
      var semSum = summary.semesters[s];
      var card = dom.semestersContainer.querySelector('.semester-card[data-sem-id="' + sem.id + '"]');
      if (!card || !semSum) continue;

      var elCourses = card.querySelector('[data-sem-stat="courses"]');
      var elSks = card.querySelector('[data-sem-stat="sks"]');
      var elMutu = card.querySelector('[data-sem-stat="mutu"]');
      var elIps = card.querySelector('[data-sem-stat="ips"]');

      if (elCourses) elCourses.textContent = sem.courses.length + ' MK';
      if (elSks) elSks.textContent = formatNumberClean(semSum.sks) + ' SKS';
      if (elMutu) elMutu.textContent = 'Mutu: ' + semSum.mutu.toFixed(2);
      if (elIps) {
        elIps.textContent = 'IPS: ' + (semSum.ips !== null ? semSum.ips.toFixed(2) : '—');
        elIps.className = 'ips-pill mono ' + getIpsToneClass(semSum.ips, summary.maxWeight);
      }

      for (var c = 0; c < sem.courses.length; c++) {
        var course = sem.courses[c];
        var res = semSum.courseMap[course.id];
        var row = card.querySelector('tr.course-row[data-course-id="' + course.id + '"]');
        if (!row || !res) continue;

        row.classList.toggle('is-excluded', course.included === false);
        row.classList.toggle('is-superseded', Boolean(res.supersededByIpk));

        var mutuCell = row.querySelector('.mutu-val');
        if (mutuCell) {
          mutuCell.textContent = res.calculable ? res.mutu.toFixed(2) : '—';
        }

        var gradeSelect = row.querySelector('.input-grade');
        if (gradeSelect) {
          var tone = res.gradeEntry ? Scales.getGradeTone(res.weight, summary.maxWeight) : 'neutral';
          gradeSelect.className = 'cell-select input-grade tone-' + tone;
          if (document.activeElement !== gradeSelect) {
            gradeSelect.value = course.grade || '';
          }
        }

        var badgesWrap = row.querySelector('.course-badges');
        if (badgesWrap) {
          var badgesHtml = '';
          if (course.included === false) {
            badgesHtml += '<span class="mini-badge badge-muted">Diabaikan</span>';
          } else if (res.supersededByIpk) {
            badgesHtml +=
              '<span class="mini-badge badge-amber" title="Mata kuliah ini diulang di semester lain sehingga tidak dihitung di IPK kumulatif">Digantikan di IPK</span>';
          } else if (res.unknownGrade) {
            badgesHtml += '<span class="mini-badge badge-rose">Huruf Tidak Dikenal</span>';
          }
          badgesWrap.innerHTML = badgesHtml;
        }
      }
    }
  }

  function renderAll() {
    var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
    updateSummaryAndCharts(summary);
    renderSemesters(summary);
  }

  function swapSemesterDomId(oldId, newId) {
    tempIdResolution[oldId] = newId;
    var semRes = getSemesterById(oldId);
    if (semRes) semRes.semester.id = newId;
    var card = dom.semestersContainer.querySelector('.semester-card[data-sem-id="' + oldId + '"]');
    if (card) {
      card.setAttribute('data-sem-id', newId);
      var rows = card.querySelectorAll('[data-sem-id="' + oldId + '"]');
      for (var i = 0; i < rows.length; i++) {
        rows[i].setAttribute('data-sem-id', newId);
      }
    }
    if (pendingSemesterPatches[oldId]) {
      flushSemesterSave(oldId, false);
    }
  }

  function swapCourseDomId(oldId, newId) {
    tempIdResolution[oldId] = newId;
    for (var s = 0; s < state.semesters.length; s++) {
      var found = getCourseById(state.semesters[s], oldId);
      if (found) {
        found.course.id = newId;
        break;
      }
    }
    var row = dom.semestersContainer.querySelector('tr.course-row[data-course-id="' + oldId + '"]');
    if (row) {
      row.setAttribute('data-course-id', newId);
    }
    if (pendingCoursePatches[oldId]) {
      flushCourseSave(oldId, false);
    }
  }

  function addSemester() {
    var nextNum = state.semesters.length + 1;
    var periodGuess = nextNum % 2 === 1 ? 'Ganjil' : 'Genap';
    var tmpSemId = tempUid('sem');
    var tmpCourseId = tempUid('mk');

    var optimisticSem = {
      id: tmpSemId,
      name: 'Semester ' + nextNum,
      period: periodGuess,
      collapsed: false,
      courses: [{ id: tmpCourseId, code: '', name: '', sks: 3, grade: '', numericScore: null, included: true }]
    };

    state.semesters.push(optimisticSem);
    renderAll();

    var card = dom.semestersContainer.querySelector('.semester-card[data-sem-id="' + tmpSemId + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      var targetInput = card.querySelector('.input-name');
      if (targetInput) {
        setTimeout(function () {
          targetInput.focus();
        }, 50);
      }
    }

    if (isDbMode()) {
      trackSync(
        Api.createSemester({
          name: optimisticSem.name,
          period: optimisticSem.period,
          withInitialCourse: true
        })
      )
        .then(function (res) {
          if (res && res.semester) {
            swapSemesterDomId(tmpSemId, res.semester.id);
            if (res.semester.courses && res.semester.courses[0]) {
              swapCourseDomId(tmpCourseId, res.semester.courses[0].id);
            }
          }
        })
        .catch(function () {});
    } else {
      saveOfflineFallback();
    }
  }

  function addCourseToSemester(semId, focusNewRow) {
    var found = getSemesterById(semId);
    if (!found) return;
    found.semester.collapsed = false;
    var tmpCourseId = tempUid('mk');
    var newCourse = { id: tmpCourseId, code: '', name: '', sks: 3, grade: '', numericScore: null, included: true };
    found.semester.courses.push(newCourse);
    renderAll();

    if (focusNewRow) {
      var row = dom.semestersContainer.querySelector('tr.course-row[data-course-id="' + tmpCourseId + '"]');
      if (row) {
        var nameInput = row.querySelector('.input-name');
        if (nameInput) nameInput.focus();
      }
    }

    if (isDbMode()) {
      var realSemId = resolveRealId(semId);
      if (!isTempId(realSemId)) {
        trackSync(Api.createCourse(realSemId, { code: '', name: '', sks: 3, grade: '', included: true }))
          .then(function (res) {
            if (res && res.course) {
              swapCourseDomId(tmpCourseId, res.course.id);
            }
          })
          .catch(function () {});
      }
    } else {
      saveOfflineFallback();
    }
  }

  function renderScaleModal() {
    if (!draftScale) return;

    var presetsHtml = '';
    for (var i = 0; i < Scales.PRESET_SCALES.length; i++) {
      var p = Scales.PRESET_SCALES[i];
      var isSelected = draftScale.id === p.id;
      presetsHtml +=
        '<button type="button" class="preset-card' +
        (isSelected ? ' active' : '') +
        '" data-preset-id="' +
        escapeHtml(p.id) +
        '">' +
        '<strong>' +
        escapeHtml(p.name) +
        '</strong>' +
        '<span>' +
        escapeHtml(p.description) +
        '</span>' +
        '</button>';
    }
    dom.scalePresetsGrid.innerHTML = presetsHtml;

    var rowsHtml = '';
    for (var g = 0; g < draftScale.grades.length; g++) {
      var gr = draftScale.grades[g];
      rowsHtml +=
        '<tr data-grade-idx="' +
        g +
        '">' +
        '<td><input type="text" class="cell-input mono scale-letter-input" value="' +
        escapeHtml(gr.letter) +
        '" maxlength="6" aria-label="Huruf nilai"></td>' +
        '<td><input type="number" class="cell-input mono scale-weight-input" min="0" max="4" step="0.01" value="' +
        gr.weight +
        '" aria-label="Bobot nilai"></td>' +
        '<td><input type="number" class="cell-input mono scale-min-input" min="0" max="100" step="0.5" value="' +
        gr.minScore +
        '" aria-label="Nilai angka minimal"></td>' +
        '<td><button type="button" class="btn-icon-xs btn-del-row" data-del-grade="' +
        g +
        '" ' +
        (draftScale.grades.length <= 2 ? 'disabled ' : '') +
        'title="Hapus baris">✕</button></td>' +
        '</tr>';
    }
    dom.scaleEditorBody.innerHTML = rowsHtml;
  }

  function renderPrintTranscript() {
    var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
    var p = state.profile || {};
    var nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    var policyLabel =
      state.retakePolicy === 'best'
        ? 'Ambil Nilai Terbaik'
        : state.retakePolicy === 'latest'
        ? 'Ambil Nilai Terbaru'
        : 'Hitung Semua';

    var semTablesHtml = '';
    for (var s = 0; s < state.semesters.length; s++) {
      var sem = state.semesters[s];
      var semSum = summary.semesters[s];
      if (!sem.courses.length) continue;

      var rows = '';
      for (var c = 0; c < sem.courses.length; c++) {
        var mk = sem.courses[c];
        var res = semSum.courseMap[mk.id] || {};
        var note = '';
        if (mk.included === false) note = ' (Diabaikan)';
        else if (res.supersededByIpk) note = ' (Digantikan di IPK)';

        rows +=
          '<tr>' +
          '<td class="mono">' +
          (c + 1) +
          '</td>' +
          '<td class="mono">' +
          escapeHtml(mk.code || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(mk.name || 'Tanpa Nama') +
          '<span class="print-note">' +
          note +
          '</span></td>' +
          '<td class="mono num">' +
          escapeHtml(mk.sks) +
          '</td>' +
          '<td class="mono num">' +
          escapeHtml(mk.grade || '—') +
          '</td>' +
          '<td class="mono num">' +
          (res.gradeEntry ? res.weight.toFixed(2) : '—') +
          '</td>' +
          '<td class="mono num">' +
          (res.calculable ? res.mutu.toFixed(2) : '—') +
          '</td>' +
          '</tr>';
      }

      semTablesHtml +=
        '<div class="print-sem-block">' +
        '<div class="print-sem-head">' +
        '<strong>' +
        escapeHtml(sem.name) +
        (sem.period ? ' (' + escapeHtml(sem.period) + ')' : '') +
        '</strong>' +
        '<span class="mono">SKS: ' +
        formatNumberClean(semSum.sks) +
        ' | Mutu: ' +
        semSum.mutu.toFixed(2) +
        ' | IPS: ' +
        (semSum.ips !== null ? semSum.ips.toFixed(2) : '—') +
        '</span>' +
        '</div>' +
        '<table class="print-table">' +
        '<thead><tr><th>No</th><th>Kode</th><th>Mata Kuliah</th><th class="num">SKS</th><th class="num">Nilai</th><th class="num">Bobot</th><th class="num">Mutu</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody>' +
        '</table>' +
        '</div>';
    }

    dom.printTranscriptSection.innerHTML =
      '<div class="print-doc">' +
      '<div class="print-header">' +
      '<div>' +
      '<div class="print-univ">' +
      escapeHtml(p.university || 'LAPORAN HASIL STUDI &amp; SIMULASI IPK') +
      '</div>' +
      '<h1>TRANSKRIP AKADEMIK SEMENTARA</h1>' +
      '</div>' +
      '<div class="print-date">Dicetak: ' +
      escapeHtml(nowStr) +
      '</div>' +
      '</div>' +
      '<div class="print-student-meta">' +
      '<div><span>Nama</span><strong>: ' +
      escapeHtml(p.name || '—') +
      '</strong></div>' +
      '<div><span>NIM / NPM</span><strong class="mono">: ' +
      escapeHtml(p.nim || '—') +
      '</strong></div>' +
      '<div><span>Program Studi</span><strong>: ' +
      escapeHtml(p.prodi || '—') +
      '</strong></div>' +
      '<div><span>Skala / Aturan</span><strong>: ' +
      escapeHtml(state.scale.name) +
      ' (' +
      policyLabel +
      ')</strong></div>' +
      '</div>' +
      '<div class="print-summary-strip">' +
      '<div><span>IPK Kumulatif</span><strong class="mono">' +
      summary.ipk.toFixed(2) +
      ' / ' +
      summary.maxWeight.toFixed(2) +
      '</strong></div>' +
      '<div><span>Total SKS Lulus/Tempuh</span><strong class="mono">' +
      formatNumberClean(summary.totalSks) +
      ' SKS</strong></div>' +
      '<div><span>Total Angka Mutu</span><strong class="mono">' +
      summary.totalMutu.toFixed(2) +
      '</strong></div>' +
      '<div><span>Predikat</span><strong>' +
      escapeHtml(summary.predikat.label) +
      '</strong></div>' +
      '</div>' +
      semTablesHtml +
      '<div class="print-footer">' +
      'Dokumen ini dihasilkan oleh IPKPRO sebagai alat bantu perhitungan &amp; perencanaan akademik mahasiswa.' +
      '</div>' +
      '</div>';
  }

  function applyServerState(nextState) {
    var prevDb = state.db;
    var prevAuth = state.auth;
    state = normalizeInitialState(nextState);
    if (!state.db) state.db = prevDb;
    if (!state.auth) state.auth = prevAuth;
    applyTheme(state.theme);
    renderAll();
  }

  function bindEvents() {
    window.addEventListener('beforeunload', function () {
      flushSettingsSave(true);
      Object.keys(pendingSemesterPatches).forEach(function (k) {
        flushSemesterSave(k, true);
      });
      Object.keys(pendingCoursePatches).forEach(function (k) {
        flushCourseSave(k, true);
      });
    });

    document.getElementById('btnThemeToggle').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.theme);
      scheduleSettingsSave({ theme: state.theme });
    });

    document.getElementById('btnLoadDemo').addEventListener('click', function () {
      if (isDbMode()) {
        trackSync(Api.loadDemo()).then(function (data) {
          applyServerState(data);
          showToast('Contoh transkrip 4 semester dimuat ke database.', { type: 'success' });
        });
      }
    });

    document.getElementById('btnDismissOnboarding').addEventListener('click', function () {
      state.onboardingDismissed = true;
      dom.onboardingBanner.hidden = true;
      scheduleSettingsSave({ onboardingDismissed: true });
    });

    document.getElementById('btnSwitchToBestRetake').addEventListener('click', function () {
      state.retakePolicy = 'best';
      renderAll();
      scheduleSettingsSave({ retakePolicy: 'best' });
      showToast('Mode matkul mengulang diubah ke "Ambil Nilai Terbaik".', { type: 'success' });
    });

    var chartTabs = document.querySelectorAll('[data-chart-tab]');
    for (var i = 0; i < chartTabs.length; i++) {
      chartTabs[i].addEventListener('click', function () {
        var tab = this.getAttribute('data-chart-tab');
        for (var j = 0; j < chartTabs.length; j++) {
          var isAct = chartTabs[j].getAttribute('data-chart-tab') === tab;
          chartTabs[j].classList.toggle('active', isAct);
          chartTabs[j].setAttribute('aria-selected', isAct ? 'true' : 'false');
        }
        dom.chartTrendPanel.hidden = tab !== 'trend';
        dom.chartDistributionPanel.hidden = tab !== 'distribution';
        dom.analyticsTitle.textContent =
          tab === 'trend' ? 'Tren IPS & IPK per Semester' : 'Distribusi Nilai Huruf';
      });
    }

    dom.inputTargetIpk.addEventListener('input', function () {
      var val = parseFloat(this.value);
      if (!Number.isFinite(val)) return;
      var maxW = Scales.getScaleMaxWeight(state.scale);
      state.planner.targetIpk = Math.max(0, Math.min(maxW, val));
      var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
      updateSummaryAndCharts(summary);
      scheduleSettingsSave({ planner: cloneDeep(state.planner) });
    });

    dom.inputTotalTargetSks.addEventListener('input', function () {
      var val = parseInt(this.value, 10);
      if (!Number.isFinite(val) || val < 1) return;
      state.planner.totalTargetSks = Math.min(300, val);
      var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
      updateSummaryAndCharts(summary);
      scheduleSettingsSave({ planner: cloneDeep(state.planner) });
    });

    document.addEventListener('click', function (e) {
      var targetPill = e.target.closest('.quick-target-pill');
      if (targetPill) {
        state.planner.targetIpk = Number(targetPill.getAttribute('data-target'));
        dom.inputTargetIpk.value = state.planner.targetIpk.toFixed(2);
        var s1 = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
        updateSummaryAndCharts(s1);
        scheduleSettingsSave({ planner: cloneDeep(state.planner) });
        return;
      }

      var sksPill = e.target.closest('.quick-sks-pill');
      if (sksPill) {
        state.planner.totalTargetSks = Number(sksPill.getAttribute('data-sks'));
        dom.inputTotalTargetSks.value = state.planner.totalTargetSks;
        var s2 = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
        updateSummaryAndCharts(s2);
        scheduleSettingsSave({ planner: cloneDeep(state.planner) });
      }
    });

    document.getElementById('btnAddSemesterTop').addEventListener('click', addSemester);
    document.getElementById('btnAddSemesterBottom').addEventListener('click', addSemester);

    dom.searchCourseInput.addEventListener('input', function () {
      searchQuery = this.value;
      var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
      renderSemesters(summary);
    });

    dom.selectRetakePolicy.addEventListener('change', function () {
      state.retakePolicy = this.value;
      renderAll();
      scheduleSettingsSave({ retakePolicy: state.retakePolicy });
    });

    dom.btnToggleAllSemesters.addEventListener('click', function () {
      if (!state.semesters.length) return;
      var allCollapsed = state.semesters.every(function (s) {
        return s.collapsed;
      });
      var nextVal = !allCollapsed;
      for (var s = 0; s < state.semesters.length; s++) {
        state.semesters[s].collapsed = nextVal;
      }
      renderAll();
      if (isDbMode()) {
        trackSync(Api.toggleAllSemesters(nextVal)).catch(function () {});
      }
    });

    document.getElementById('btnResetAll').addEventListener('click', function () {
      askConfirm(
        'Reset Semua Data?',
        'Seluruh semester dan mata kuliah saat ini akan dihapus dan diganti dengan lembar kosong baru.',
        function () {
          if (isDbMode()) {
            trackSync(Api.resetWorkspace()).then(function (data) {
              applyServerState(data);
              showToast('Semua data direset ke awal.', { type: 'success' });
            });
          }
        }
      );
    });

    dom.semestersContainer.addEventListener('input', function (e) {
      var target = e.target;

      var semField = target.getAttribute('data-sem-field');
      if (semField) {
        var card = target.closest('.semester-card');
        if (!card) return;
        var semId = card.getAttribute('data-sem-id');
        var foundSem = getSemesterById(semId);
        if (!foundSem) return;
        foundSem.semester[semField] = target.value;
        updateDomInPlaceAfterEdit();
        var semPatch = {};
        semPatch[semField] = target.value;
        scheduleSemesterSave(semId, semPatch);
        return;
      }

      var courseField = target.getAttribute('data-field');
      if (courseField) {
        var row = target.closest('tr.course-row');
        if (!row) return;
        var rowSemId = row.getAttribute('data-sem-id');
        var courseId = row.getAttribute('data-course-id');
        var semRes = getSemesterById(rowSemId);
        if (!semRes) return;
        var cRes = getCourseById(semRes.semester, courseId);
        if (!cRes) return;

        var patch = {};
        if (courseField === 'code' || courseField === 'name') {
          cRes.course[courseField] = target.value;
          patch[courseField] = target.value;
        } else if (courseField === 'sks') {
          var parsedSks = parseFloat(target.value);
          var validSks = Number.isFinite(parsedSks) ? Math.max(0, Math.min(24, parsedSks)) : 0;
          cRes.course.sks = validSks;
          patch.sks = validSks;
        } else if (courseField === 'numericScore') {
          var rawVal = target.value.trim();
          if (rawVal === '') {
            cRes.course.numericScore = null;
            patch.numericScore = null;
          } else {
            var numScore = parseFloat(rawVal);
            if (Number.isFinite(numScore)) {
              numScore = Math.max(0, Math.min(100, numScore));
              cRes.course.numericScore = numScore;
              patch.numericScore = numScore;
              var matchedGrade = Scales.scoreToGrade(state.scale, numScore);
              if (matchedGrade) {
                cRes.course.grade = matchedGrade.letter;
                patch.grade = matchedGrade.letter;
              }
            }
          }
        }

        updateDomInPlaceAfterEdit();
        scheduleCourseSave(courseId, patch);
      }
    });

    dom.semestersContainer.addEventListener('change', function (e) {
      var target = e.target;
      if (target.getAttribute('data-field') === 'grade') {
        var row = target.closest('tr.course-row');
        if (!row) return;
        var semId = row.getAttribute('data-sem-id');
        var courseId = row.getAttribute('data-course-id');
        var semRes = getSemesterById(semId);
        if (!semRes) return;
        var cRes = getCourseById(semRes.semester, courseId);
        if (!cRes) return;

        cRes.course.grade = target.value;
        cRes.course.numericScore = null;
        var scoreInput = row.querySelector('.input-score');
        if (scoreInput) scoreInput.value = '';

        updateDomInPlaceAfterEdit();
        scheduleCourseSave(courseId, { grade: target.value, numericScore: null });
      }
    });

    dom.semestersContainer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest('tr.course-row')) {
        if (e.target.tagName === 'SELECT') return;
        e.preventDefault();
        var row = e.target.closest('tr.course-row');
        addCourseToSemester(row.getAttribute('data-sem-id'), true);
      }
    });

    dom.semestersContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');

      if (action === 'add-first-semester') {
        addSemester();
        return;
      }

      var card = btn.closest('.semester-card');
      var semId = btn.getAttribute('data-sem-id') || (card ? card.getAttribute('data-sem-id') : null);
      if (!semId) return;
      var semRes = getSemesterById(semId);
      if (!semRes) return;

      if (action === 'add-course') {
        addCourseToSemester(semId, true);
        return;
      }

      if (action === 'toggle-collapse') {
        semRes.semester.collapsed = !semRes.semester.collapsed;
        renderAll();
        scheduleSemesterSave(semId, { collapsed: semRes.semester.collapsed });
        return;
      }

      if (action === 'move-sem-up' && semRes.index > 0) {
        var tmpUp = state.semesters[semRes.index - 1];
        state.semesters[semRes.index - 1] = semRes.semester;
        state.semesters[semRes.index] = tmpUp;
        renderAll();
        if (isDbMode()) {
          var idsUp = state.semesters.map(function (s) {
            return Number(resolveRealId(s.id));
          });
          trackSync(Api.reorderSemesters(idsUp)).catch(function () {});
        }
        return;
      }

      if (action === 'move-sem-down' && semRes.index < state.semesters.length - 1) {
        var tmpDn = state.semesters[semRes.index + 1];
        state.semesters[semRes.index + 1] = semRes.semester;
        state.semesters[semRes.index] = tmpDn;
        renderAll();
        if (isDbMode()) {
          var idsDn = state.semesters.map(function (s) {
            return Number(resolveRealId(s.id));
          });
          trackSync(Api.reorderSemesters(idsDn)).catch(function () {});
        }
        return;
      }

      if (action === 'duplicate-sem') {
        var realSemId = resolveRealId(semId);
        if (isDbMode() && !isTempId(realSemId)) {
          trackSync(Api.duplicateSemester(realSemId)).then(function (res) {
            if (res && res.semester) {
              state.semesters.splice(semRes.index + 1, 0, res.semester);
              renderAll();
              showToast('Semester berhasil diduplikasi.', { type: 'success' });
            }
          });
        }
        return;
      }

      if (action === 'delete-sem') {
        var removedSem = cloneDeep(semRes.semester);
        var removedIndex = semRes.index;
        var delSemId = resolveRealId(semId);
        state.semesters.splice(removedIndex, 1);
        renderAll();

        if (isDbMode() && !isTempId(delSemId)) {
          trackSync(Api.deleteSemester(delSemId)).catch(function () {});
        }

        showToast('"' + removedSem.name + '" dihapus.', {
          onUndo: function () {
            if (isDbMode()) {
              trackSync(
                Api.restoreSemester({
                  name: removedSem.name,
                  period: removedSem.period,
                  collapsed: Boolean(removedSem.collapsed),
                  sortOrder: removedIndex,
                  courses: removedSem.courses
                })
              ).then(function (res) {
                if (res && res.semester) {
                  state.semesters.splice(Math.min(removedIndex, state.semesters.length), 0, res.semester);
                  renderAll();
                }
              });
            }
          }
        });
        return;
      }

      var row = btn.closest('tr.course-row');
      if (!row) return;
      var courseId = row.getAttribute('data-course-id');
      var cRes = getCourseById(semRes.semester, courseId);
      if (!cRes) return;

      if (action === 'inc-sks' || action === 'dec-sks') {
        var cur = Number(cRes.course.sks) || 0;
        var next = action === 'inc-sks' ? Math.min(24, cur + 1) : Math.max(0, cur - 1);
        cRes.course.sks = next;
        var sksInput = row.querySelector('.input-sks');
        if (sksInput) sksInput.value = next;
        updateDomInPlaceAfterEdit();
        scheduleCourseSave(courseId, { sks: next });
        return;
      }

      if (action === 'toggle-include') {
        cRes.course.included = cRes.course.included === false;
        renderAll();
        scheduleCourseSave(courseId, { included: cRes.course.included });
        return;
      }

      if (action === 'delete-course') {
        var removedCourse = cloneDeep(cRes.course);
        var removedCourseIdx = cRes.index;
        var delCourseId = resolveRealId(courseId);
        semRes.semester.courses.splice(removedCourseIdx, 1);
        renderAll();

        if (isDbMode() && !isTempId(delCourseId)) {
          trackSync(Api.deleteCourse(delCourseId)).catch(function () {});
        }

        var label = (removedCourse.name || '').trim() || 'Mata kuliah';
        showToast('"' + label + '" dihapus.', {
          onUndo: function () {
            var targetSem = getSemesterById(semId);
            if (!targetSem) return;
            var targetSemId = resolveRealId(semId);
            if (isDbMode() && !isTempId(targetSemId)) {
              trackSync(
                Api.createCourse(targetSemId, {
                  code: removedCourse.code,
                  name: removedCourse.name,
                  sks: removedCourse.sks,
                  numericScore: removedCourse.numericScore,
                  grade: removedCourse.grade,
                  included: removedCourse.included !== false,
                  sortOrder: removedCourseIdx
                })
              ).then(function (res) {
                if (res && res.course) {
                  targetSem.semester.courses.splice(
                    Math.min(removedCourseIdx, targetSem.semester.courses.length),
                    0,
                    res.course
                  );
                  renderAll();
                }
              });
            }
          }
        });
      }
    });

    document.addEventListener('click', function (e) {
      var closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        closeModal(document.getElementById(closeBtn.getAttribute('data-close-modal')));
        return;
      }
      if (e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var openModals = document.querySelectorAll('.modal-backdrop:not([hidden])');
        for (var m = 0; m < openModals.length; m++) {
          closeModal(openModals[m]);
        }
      }
    });

    document.getElementById('btnScaleModal').addEventListener('click', function () {
      draftScale = Scales.cloneScale(state.scale);
      renderScaleModal();
      openModal(dom.modalScale);
    });

    dom.scalePresetsGrid.addEventListener('click', function (e) {
      var card = e.target.closest('[data-preset-id]');
      if (!card) return;
      var preset = Scales.getPresetById(card.getAttribute('data-preset-id'));
      if (preset) {
        draftScale = preset;
        renderScaleModal();
      }
    });

    document.getElementById('btnAddCustomGrade').addEventListener('click', function () {
      if (!draftScale) return;
      draftScale.id = 'custom';
      draftScale.name = 'Skala Kustom';
      draftScale.grades.push({ letter: 'X', weight: 0.0, minScore: 0 });
      renderScaleModal();
    });

    dom.scaleEditorBody.addEventListener('click', function (e) {
      var delBtn = e.target.closest('[data-del-grade]');
      if (!delBtn || !draftScale) return;
      var idx = Number(delBtn.getAttribute('data-del-grade'));
      if (draftScale.grades.length > 2) {
        draftScale.grades.splice(idx, 1);
        draftScale.id = 'custom';
        draftScale.name = 'Skala Kustom';
        renderScaleModal();
      }
    });

    dom.scaleEditorBody.addEventListener('input', function (e) {
      if (!draftScale) return;
      var row = e.target.closest('tr[data-grade-idx]');
      if (!row) return;
      var idx = Number(row.getAttribute('data-grade-idx'));
      var gr = draftScale.grades[idx];
      if (!gr) return;

      if (e.target.classList.contains('scale-letter-input')) {
        gr.letter = e.target.value.trim().toUpperCase();
      } else if (e.target.classList.contains('scale-weight-input')) {
        gr.weight = Math.max(0, Math.min(4, parseFloat(e.target.value) || 0));
      } else if (e.target.classList.contains('scale-min-input')) {
        gr.minScore = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
      }
      draftScale.id = 'custom';
      draftScale.name = 'Skala Kustom';
      var activePresets = dom.scalePresetsGrid.querySelectorAll('.preset-card.active');
      for (var pIdx = 0; pIdx < activePresets.length; pIdx++) {
        activePresets[pIdx].classList.remove('active');
      }
    });

    document.getElementById('btnSaveScale').addEventListener('click', function () {
      if (!draftScale) return;
      var validGrades = draftScale.grades.filter(function (g) {
        return g.letter && g.letter.trim().length > 0;
      });
      if (validGrades.length < 2) {
        showToast('Minimal harus ada 2 huruf nilai pada skala.', { type: 'error' });
        return;
      }
      draftScale.grades = validGrades;
      state.scale = Scales.cloneScale(draftScale);
      renderAll();
      closeModal(dom.modalScale);
      scheduleSettingsSave({ scale: state.scale });
      showToast('Skala nilai "' + state.scale.name + '" diterapkan.', { type: 'success' });
    });

    document.getElementById('btnProfileModal').addEventListener('click', function () {
      dom.profileName.value = state.profile.name || '';
      dom.profileNim.value = state.profile.nim || '';
      dom.profileProdi.value = state.profile.prodi || '';
      dom.profileUniversity.value = state.profile.university || '';
      openModal(dom.modalProfile);
    });

    dom.profileForm.addEventListener('submit', function (e) {
      e.preventDefault();
      state.profile = {
        name: dom.profileName.value.trim(),
        nim: dom.profileNim.value.trim(),
        prodi: dom.profileProdi.value.trim(),
        university: dom.profileUniversity.value.trim()
      };
      var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
      updateSummaryAndCharts(summary);
      closeModal(dom.modalProfile);
      scheduleSettingsSave({ profile: state.profile });
      showToast('Profil mahasiswa disimpan.', { type: 'success' });
    });

    document.getElementById('btnDataModal').addEventListener('click', function () {
      openModal(dom.modalData);
    });

    document.getElementById('btnExportJson').addEventListener('click', function () {
      Api.exportJson(state);
      showToast('Backup JSON berhasil diunduh.', { type: 'success' });
    });

    document.getElementById('btnExportCsv').addEventListener('click', function () {
      var summary = Calc.calculateAcademicSummary(state.semesters, state.scale, state.retakePolicy);
      Api.exportCsv(state, summary);
      showToast('File CSV berhasil diunduh.', { type: 'success' });
    });

    dom.inputImportJson.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var importedPayload = Api.parseImportedJson(String(ev.target.result || ''));
          if (isDbMode()) {
            trackSync(Api.importData(importedPayload)).then(function (res) {
              applyServerState(res);
              closeModal(dom.modalData);
              showToast('Data transkrip berhasil diimpor ke database.', { type: 'success' });
            });
          }
        } catch (err) {
          showToast(err.message || 'Gagal membaca file JSON.', { type: 'error' });
        } finally {
          dom.inputImportJson.value = '';
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btnLoadDemoFromModal').addEventListener('click', function () {
      if (isDbMode()) {
        trackSync(Api.loadDemo()).then(function (data) {
          applyServerState(data);
          closeModal(dom.modalData);
          showToast('Contoh data 4 semester dimuat.', { type: 'success' });
        });
      }
    });

    document.getElementById('btnPrintTranscript').addEventListener('click', function () {
      renderPrintTranscript();
      window.print();
    });

    document.getElementById('btnConfirmAction').addEventListener('click', function () {
      closeModal(dom.modalConfirm);
      if (typeof pendingConfirmAction === 'function') {
        var fn = pendingConfirmAction;
        pendingConfirmAction = null;
        fn();
      }
    });
  }

  function init() {
    cacheDom();
    applyTheme(state.theme);
    if (isDbMode()) {
      setSyncStatus('ready', 'Tersimpan di DB');
    } else {
      setSyncStatus('offline', 'Mode Offline');
    }
    bindEvents();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof self !== 'undefined' ? self : this);
