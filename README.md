# Presensi Yayasan Al-Hikmah

Aplikasi presensi karyawan berbasis web + Google Apps Script, dengan deteksi Fake GPS untuk APK Android WebView.

## File

| File | Keterangan |
|---|---|
| `index.html` | Aplikasi utama (UI — host di Cloudflare Pages / GitHub Pages) |
| `Code.gs` | Backend Google Apps Script (Google Sheets) |
| `MainActivity.java` | Android WebView + bridge deteksi mock location |
| `location-patch.html` | Patch JS untuk validasi GPS di sisi browser |

## Setup

1. Buat Google Spreadsheet → salin ID → isi di `Code.gs`
2. Deploy `Code.gs` sebagai Web App (GAS) → salin URL
3. Tempel URL GAS di `index.html` (`const GAS_URL = ...`)
4. Isi koordinat gedung di `location-patch.html`
5. Host `index.html` → masukkan URL ke `MainActivity.java`

## Dibuat oleh
Baitul Hikmah — Yayasan Al-Hikmah © 2025
