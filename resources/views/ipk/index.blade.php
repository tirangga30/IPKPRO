<!DOCTYPE html>
<html lang="id" data-theme="{{ ($initialData['theme'] ?? 'light') === 'dark' ? 'dark' : 'light' }}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>IPKPRO — Kalkulator IPK &amp; Perencana Akademik</title>
  <meta name="description" content="Kalkulator IPK & IPS kuliah berbasis Laravel + Neon PostgreSQL: kelola semester, mata kuliah, konversi nilai angka/huruf, simulasi target IPK, dan cetak transkrip.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230d9488'/%3E%3Cstop offset='1' stop-color='%232563eb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M26 14v5M6 14l10-5 10 5-10 5zM10 16v4.5c3 2.5 9 2.5 12 0V16' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{{ asset('assets/css/styles.css') }}">
</head>
<body>
  <div id="app" class="app-shell">
    <!-- Top Header -->
    <header class="topbar no-print">
      <div class="container topbar-inner">
        <div class="brand-group">
          <div class="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
              <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
            </svg>
          </div>
          <div>
            <div class="brand-title-row">
              <h1 class="brand-title">IPKPRO</h1>
              <span class="brand-badge">Laravel</span>
              <span class="sync-pill" id="syncStatusPill" title="Status sinkronisasi database">
                <i class="sync-dot"></i>
                <span id="syncStatusText">Tersimpan di DB</span>
              </span>
            </div>
            <p class="brand-subtitle" id="headerStudentSummary">Kalkulator IPK, IPS &amp; Perencana Studi</p>
          </div>
        </div>

        <div class="topbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btnProfileModal" title="Edit Profil Mahasiswa">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span class="hide-sm">Profil</span>
          </button>

          <button type="button" class="btn btn-ghost btn-sm" id="btnScaleModal" title="Atur Skala & Bobot Nilai">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            <span id="activeScaleLabel" class="hide-sm">Skala Nilai</span>
          </button>

          <button type="button" class="btn btn-ghost btn-sm" id="btnDataModal" title="Simpan, Ekspor, atau Impor Data">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span class="hide-sm">Ekspor / Impor</span>
          </button>

          <button type="button" class="btn btn-ghost btn-sm" id="btnPrintTranscript" title="Cetak atau Simpan PDF Transkrip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            <span class="hide-sm">Cetak</span>
          </button>

          @auth
            <span class="auth-user-pill hide-sm" title="Akun tersinkronisasi: {{ auth()->user()->email }}">
              {{ auth()->user()->name }}
            </span>
            <form method="POST" action="{{ route('logout') }}" class="inline-form">
              @csrf
              <button type="submit" class="btn btn-ghost btn-sm" title="Keluar dari akun">Keluar</button>
            </form>
          @else
            <a href="{{ route('login') }}" class="btn btn-secondary btn-sm" title="Masuk untuk sinkronisasi lintas perangkat">
              <span>Masuk</span>
            </a>
          @endauth

          <button type="button" class="btn btn-icon btn-ghost" id="btnThemeToggle" aria-label="Ganti tema gelap atau terang" title="Ganti Tema">
            <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          </button>
        </div>
      </div>
    </header>

    <main class="container main-content no-print">
      @if (session('status'))
        <div class="alert-box alert-success">{{ session('status') }}</div>
      @endif

      @if (!$dbConnected)
        <div class="info-banner">
          <div class="info-banner-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>Database belum terhubung atau belum dimigrasi. Aplikasi berjalan dalam mode sementara hingga Neon DB dikonfigurasi.</span>
          </div>
        </div>
      @endif

      <!-- Quick Welcome / Demo Notice -->
      <div id="onboardingBanner" class="onboarding-banner" hidden>
        <div class="onboarding-text">
          <span class="onboarding-pill">Mulai Cepat</span>
          <p>Isi mata kuliah di <strong>Semester 1</strong> di bawah, atau muat contoh transkrip 4 semester untuk melihat simulasi grafik &amp; target IPK.</p>
        </div>
        <div class="onboarding-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="btnLoadDemo">Muat Contoh Data (4 Semester)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnDismissOnboarding" aria-label="Tutup banner">Tutup</button>
        </div>
      </div>

      <!-- Duplicate / Retake Notice -->
      <div id="duplicateNoticeBanner" class="info-banner" hidden>
        <div class="info-banner-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span id="duplicateNoticeText">Terdeteksi mata kuliah dengan nama/kode sama di beberapa semester.</span>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" id="btnSwitchToBestRetake">Gunakan Nilai Terbaik</button>
      </div>

      <!-- Executive Bento Dashboard -->
      <section class="dashboard-grid" aria-label="Ringkasan IPK dan Analitik">
        <!-- Card 1: IPK Kumulatif & Progress -->
        <article class="card card-ipk">
          <div class="card-header-row">
            <div>
              <span class="card-eyebrow">Indeks Prestasi Kumulatif</span>
              <h2 class="card-title-sm">Ringkasan Akademik</h2>
            </div>
            <span id="predikatBadge" class="predikat-badge predikat-neutral">Belum Ada Nilai</span>
          </div>

          <div class="ipk-hero-body">
            <div class="gauge-wrap" aria-hidden="true">
              <svg class="ipk-gauge" viewBox="0 0 140 140">
                <defs>
                  <linearGradient id="ipkGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0d9488" />
                    <stop offset="100%" stop-color="#2563eb" />
                  </linearGradient>
                </defs>
                <circle class="gauge-track" cx="70" cy="70" r="56"></circle>
                <circle class="gauge-progress" id="ipkGaugeCircle" cx="70" cy="70" r="56" stroke="url(#ipkGaugeGrad)"></circle>
              </svg>
              <div class="gauge-center">
                <div class="ipk-value mono" id="ipkValue">0.00</div>
                <div class="ipk-scale-max mono" id="ipkScaleMax">dari 4.00</div>
              </div>
            </div>

            <div class="ipk-metrics-grid">
              <div class="metric-tile">
                <span class="metric-label">Total SKS Dihitung</span>
                <strong class="metric-val mono" id="totalSksValue">0</strong>
                <span class="metric-sub" id="totalSksSub">Target 144 SKS</span>
              </div>
              <div class="metric-tile">
                <span class="metric-label">Total Mutu</span>
                <strong class="metric-val mono" id="totalMutuValue">0.00</strong>
                <span class="metric-sub" id="totalCoursesSub">0 matkul</span>
              </div>
              <div class="metric-tile">
                <span class="metric-label">IPS Terakhir</span>
                <strong class="metric-val mono" id="latestIpsValue">—</strong>
                <span class="metric-sub" id="ipsDeltaSub">Belum ada nilai</span>
              </div>
              <div class="metric-tile">
                <span class="metric-label">Maks. SKS Berikutnya</span>
                <strong class="metric-val mono" id="nextMaxSksValue">—</strong>
                <span class="metric-sub" id="nextMaxSksSub">Estimasi IPS</span>
              </div>
            </div>
          </div>

          <div class="degree-progress-wrap">
            <div class="degree-progress-head">
              <span>Progres Kelulusan (<span id="degreeProgressPct" class="mono">0%</span>)</span>
              <span class="mono" id="degreeProgressText">0 / 144 SKS</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" id="degreeProgressFill" style="width: 0%"></div>
            </div>
          </div>
        </article>

        <!-- Card 2: Trend Chart & Grade Distribution -->
        <article class="card card-analytics">
          <div class="card-header-row">
            <div>
              <span class="card-eyebrow">Analitik Performa</span>
              <h2 class="card-title-sm" id="analyticsTitle">Tren IPS &amp; IPK per Semester</h2>
            </div>
            <div class="segmented-control" role="tablist" aria-label="Tampilan Analitik">
              <button type="button" class="seg-btn active" data-chart-tab="trend" role="tab" aria-selected="true">Grafik Tren</button>
              <button type="button" class="seg-btn" data-chart-tab="distribution" role="tab" aria-selected="false">Distribusi Nilai</button>
            </div>
          </div>

          <div id="chartTrendPanel" class="chart-panel">
            <div class="chart-legend">
              <span class="legend-item"><i class="dot dot-ips"></i> IPS Semester</span>
              <span class="legend-item"><i class="dot dot-ipk"></i> IPK Kumulatif</span>
              <span class="legend-item"><i class="dot dot-target"></i> Target IPK</span>
            </div>
            <div id="trendChartContainer" class="svg-chart-box"></div>
          </div>

          <div id="chartDistributionPanel" class="chart-panel" hidden>
            <div id="distributionContainer" class="distribution-box"></div>
          </div>
        </article>

        <!-- Card 3: Target IPK Planner -->
        <article class="card card-planner">
          <div class="card-header-row">
            <div>
              <span class="card-eyebrow">Simulasi Kelulusan</span>
              <h2 class="card-title-sm">Perencana Target IPK</h2>
            </div>
            <span id="targetFeasibilityBadge" class="status-pill status-neutral">Siap Dihitung</span>
          </div>

          <div class="planner-controls">
            <div class="field-group">
              <label for="inputTargetIpk">Target IPK</label>
              <div class="input-with-stepper">
                <input type="number" id="inputTargetIpk" min="0" max="4" step="0.05" value="3.50" class="mono">
                <button type="button" class="quick-target-pill" data-target="3.50" title="Target Cum Laude">3.50</button>
                <button type="button" class="quick-target-pill" data-target="3.75" title="Target Tinggi">3.75</button>
              </div>
            </div>
            <div class="field-group">
              <label for="inputTotalTargetSks">Total SKS Lulus</label>
              <div class="input-with-stepper">
                <input type="number" id="inputTotalTargetSks" min="1" max="300" step="1" value="144" class="mono">
                <button type="button" class="quick-sks-pill" data-sks="144" title="Standar S1">S1 (144)</button>
                <button type="button" class="quick-sks-pill" data-sks="108" title="Standar D3">D3 (108)</button>
              </div>
            </div>
          </div>

          <div class="planner-result-box" id="plannerResultBox">
            <div class="planner-highlight">
              <span class="planner-highlight-label" id="plannerHighlightLabel">IPS Rata-rata Dibutuhkan</span>
              <strong class="planner-highlight-value mono" id="plannerRequiredIps">—</strong>
            </div>
            <p class="planner-desc" id="plannerDescription">
              Tambahkan mata kuliah untuk menghitung rata-rata IPS yang diperlukan di sisa SKS.
            </p>
            <div class="planner-substats">
              <div>
                <span>Sisa SKS</span>
                <strong class="mono" id="plannerRemainingSks">144</strong>
              </div>
              <div>
                <span>IPK Maksimal Mungkin</span>
                <strong class="mono" id="plannerMaxPossibleIpk">4.00</strong>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- Workspace Controls Bar -->
      <section class="workspace-toolbar" aria-label="Kontrol Semester dan Mata Kuliah">
        <div class="toolbar-left">
          <button type="button" class="btn btn-primary" id="btnAddSemesterTop">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Tambah Semester Baru</span>
          </button>

          <div class="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="search" id="searchCourseInput" placeholder="Cari matkul atau kode..." aria-label="Cari mata kuliah">
          </div>
        </div>

        <div class="toolbar-right">
          <label class="select-inline" title="Cara menghitung IPK jika ada mata kuliah yang diulang di semester berbeda">
            <span class="select-inline-label">Matkul Mengulang:</span>
            <select id="selectRetakePolicy">
              <option value="all">Hitung Semua</option>
              <option value="best">Ambil Nilai Terbaik</option>
              <option value="latest">Ambil Nilai Terbaru</option>
            </select>
          </label>

          <button type="button" class="btn btn-secondary btn-sm" id="btnToggleAllSemesters">
            Tutup Semua
          </button>

          <button type="button" class="btn btn-ghost btn-sm text-danger" id="btnResetAll" title="Hapus semua data dan mulai dari awal">
            Reset
          </button>
        </div>
      </section>

      <!-- Semesters List Container -->
      <section id="semestersContainer" class="semesters-list" aria-label="Daftar Semester"></section>

      <!-- Bottom Add Semester CTA -->
      <div class="bottom-add-wrap">
        <button type="button" class="btn-add-semester-dashed" id="btnAddSemesterBottom">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span id="btnAddSemesterBottomLabel">Tambah Semester Baru</span>
        </button>
      </div>
    </main>

    <!-- Print-Only Official Transcript View -->
    <section id="printTranscriptSection" class="print-only"></section>

    <!-- Modal: Skala Nilai -->
    <div class="modal-backdrop" id="modalScale" hidden role="dialog" aria-modal="true" aria-labelledby="modalScaleTitle">
      <div class="modal-dialog modal-lg">
        <div class="modal-header">
          <div>
            <h3 id="modalScaleTitle">Pengaturan Skala &amp; Konversi Nilai</h3>
            <p class="modal-subtitle">Sesuaikan bobot huruf &amp; batas nilai angka (0–100) sesuai peraturan kampusmu.</p>
          </div>
          <button type="button" class="btn btn-icon btn-ghost modal-close" data-close-modal="modalScale" aria-label="Tutup">✕</button>
        </div>
        <div class="modal-body">
          <div class="preset-grid" id="scalePresetsGrid"></div>
          <div class="scale-editor-wrap">
            <div class="scale-editor-head">
              <h4>Tabel Bobot &amp; Batas Nilai Aktif</h4>
              <button type="button" class="btn btn-secondary btn-xs" id="btnAddCustomGrade">+ Tambah Huruf</button>
            </div>
            <div class="table-responsive">
              <table class="scale-table">
                <thead>
                  <tr>
                    <th>Nilai Huruf</th>
                    <th>Bobot (0–4)</th>
                    <th>Min. Nilai Angka (0–100)</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody id="scaleEditorBody"></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-close-modal="modalScale">Batal</button>
          <button type="button" class="btn btn-primary" id="btnSaveScale">Simpan Skala Nilai</button>
        </div>
      </div>
    </div>

    <!-- Modal: Profil Mahasiswa -->
    <div class="modal-backdrop" id="modalProfile" hidden role="dialog" aria-modal="true" aria-labelledby="modalProfileTitle">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="modalProfileTitle">Profil Mahasiswa</h3>
            <p class="modal-subtitle">Opsional — ditampilkan di header &amp; transkrip sementara saat dicetak.</p>
          </div>
          <button type="button" class="btn btn-icon btn-ghost modal-close" data-close-modal="modalProfile" aria-label="Tutup">✕</button>
        </div>
        <form id="profileForm" class="modal-body form-stack">
          <div class="field-group">
            <label for="profileName">Nama Lengkap</label>
            <input type="text" id="profileName" placeholder="Contoh: Budi Santoso">
          </div>
          <div class="form-row-2">
            <div class="field-group">
              <label for="profileNim">NIM / NPM</label>
              <input type="text" id="profileNim" placeholder="Contoh: 235150200111">
            </div>
            <div class="field-group">
              <label for="profileProdi">Program Studi</label>
              <input type="text" id="profileProdi" placeholder="Contoh: Teknik Informatika">
            </div>
          </div>
          <div class="field-group">
            <label for="profileUniversity">Universitas / Kampus</label>
            <input type="text" id="profileUniversity" placeholder="Contoh: Universitas Brawijaya">
          </div>
          <div class="modal-footer modal-footer-inline">
            <button type="button" class="btn btn-ghost" data-close-modal="modalProfile">Batal</button>
            <button type="submit" class="btn btn-primary">Simpan Profil</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: Ekspor / Impor Data -->
    <div class="modal-backdrop" id="modalData" hidden role="dialog" aria-modal="true" aria-labelledby="modalDataTitle">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h3 id="modalDataTitle">Backup, Ekspor &amp; Impor Data</h3>
            <p class="modal-subtitle">Data tersimpan otomatis di database. Ekspor untuk cadangan atau dibuka di Excel.</p>
          </div>
          <button type="button" class="btn btn-icon btn-ghost modal-close" data-close-modal="modalData" aria-label="Tutup">✕</button>
        </div>
        <div class="modal-body data-modal-body">
          <div class="data-action-card">
            <div>
              <h4>Ekspor Transkrip</h4>
              <p>Unduh data lengkap (JSON) untuk backup, atau format CSV untuk dibuka di Excel / Google Sheets.</p>
            </div>
            <div class="data-action-btns">
              <button type="button" class="btn btn-primary btn-sm" id="btnExportJson">Unduh JSON</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btnExportCsv">Unduh CSV (Excel)</button>
            </div>
          </div>

          <div class="data-action-card">
            <div>
              <h4>Impor Backup JSON</h4>
              <p>Pulihkan data semester, mata kuliah, dan skala nilai dari file JSON IPKPRO.</p>
            </div>
            <div class="data-action-btns">
              <label class="btn btn-secondary btn-sm file-upload-btn">
                Pilih File JSON
                <input type="file" id="inputImportJson" accept=".json,application/json" hidden>
              </label>
            </div>
          </div>

          <div class="data-action-card">
            <div>
              <h4>Data Contoh (Demo)</h4>
              <p>Muat contoh transkrip 4 semester (19 mata kuliah) untuk menguji fitur simulasi &amp; grafik.</p>
            </div>
            <div class="data-action-btns">
              <button type="button" class="btn btn-ghost btn-sm" id="btnLoadDemoFromModal">Muat Data Demo</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm / Reset Modal -->
    <div class="modal-backdrop" id="modalConfirm" hidden role="dialog" aria-modal="true" aria-labelledby="modalConfirmTitle">
      <div class="modal-dialog modal-sm">
        <div class="modal-header">
          <h3 id="modalConfirmTitle">Konfirmasi</h3>
          <button type="button" class="btn btn-icon btn-ghost modal-close" data-close-modal="modalConfirm" aria-label="Tutup">✕</button>
        </div>
        <div class="modal-body">
          <p id="modalConfirmMessage">Apakah kamu yakin?</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-close-modal="modalConfirm">Batal</button>
          <button type="button" class="btn btn-danger" id="btnConfirmAction">Ya, Lanjutkan</button>
        </div>
      </div>
    </div>

    <!-- Floating Toast Stack -->
    <div id="toastContainer" class="toast-container no-print" aria-live="polite"></div>
  </div>

  <script>
    window.__IPKPRO_INITIAL__ = @json($initialData);
  </script>
  <script defer src="{{ asset('assets/js/scales.js') }}"></script>
  <script defer src="{{ asset('assets/js/calculator.js') }}"></script>
  <script defer src="{{ asset('assets/js/charts.js') }}"></script>
  <script defer src="{{ asset('assets/js/api.js') }}"></script>
  <script defer src="{{ asset('assets/js/app.js') }}"></script>
</body>
</html>
