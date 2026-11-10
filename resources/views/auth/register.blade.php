<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daftar Akun — IPKPRO</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{{ asset('assets/css/styles.css') }}">
</head>
<body>
  <main class="auth-page">
    <div class="auth-card">
      <a href="{{ route('home') }}" class="auth-brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
          </svg>
        </div>
        <strong class="brand-title">IPKPRO</strong>
      </a>

      <h1>Buat Akun IPKPRO</h1>
      <p class="auth-subtitle">Data yang sudah kamu isi sebelumnya otomatis disinkronkan ke akun barumu.</p>

      @if ($errors->any())
        <div class="alert-box alert-error">
          {{ $errors->first() }}
        </div>
      @endif

      <form method="POST" action="{{ route('register.store') }}" class="auth-form">
        @csrf
        <div class="field-group">
          <label for="name">Nama Lengkap</label>
          <input type="text" id="name" name="name" value="{{ old('name') }}" required autofocus placeholder="Contoh: Alya Rahmadani">
        </div>

        <div class="field-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" value="{{ old('email') }}" required placeholder="nama@kampus.ac.id">
        </div>

        <div class="field-group">
          <label for="password">Kata Sandi</label>
          <input type="password" id="password" name="password" required placeholder="Minimal 6 karakter">
        </div>

        <div class="field-group">
          <label for="password_confirmation">Konfirmasi Kata Sandi</label>
          <input type="password" id="password_confirmation" name="password_confirmation" required placeholder="Ulangi kata sandi">
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;">Daftar &amp; Simpan Data</button>
      </form>

      <div class="auth-footer">
        Sudah punya akun? <a href="{{ route('login') }}">Masuk di sini</a>
        <div style="margin-top:8px;">
          <a href="{{ route('home') }}" style="font-weight:500;color:var(--text-muted);">← Kembali ke Kalkulator</a>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
