# Presensi Yayasan Al-Hikmah v2.0

Aplikasi presensi karyawan berbasis web + Google Apps Script, dengan deteksi Fake GPS, geofencing, dan **Admin Panel**.

## Fitur

### User (Karyawan)
- Login dengan NIP + Password
- Clock-in / Clock-out dengan validasi lokasi GPS
- Deteksi Fake GPS (native Android bridge + browser heuristics)
- Geofencing — hanya bisa absen di radius gedung
- Riwayat presensi bulanan
- Statistik kehadiran (donut chart)
- Profil karyawan

### Admin Panel
- **Dashboard** — Total karyawan, hadir hari ini, terlambat, belum absen
- **Kelola Karyawan** — Tambah, hapus, cari karyawan
- **Data Presensi** — Lihat semua presensi, filter per bulan
- **Export CSV** — Download data presensi
- **Pengaturan** — Atur batas jam masuk, lihat lokasi gedung

## File

| File | Keterangan |
|---|---|
| `index.html` | Aplikasi utama UI (host di Cloudflare Pages / GitHub Pages) |
| `app.js` | Logic aplikasi (user + admin) |
| `Code.gs` | Backend Google Apps Script v2 (termasuk API admin) |
| `MainActivity.java` | Android WebView + bridge deteksi mock location |
| `location-patch.html` | Patch JS untuk validasi GPS lanjutan |

## Setup

1. Buat Google Spreadsheet → salin ID → isi di `Code.gs` (`SPREADSHEET_ID`)
2. Deploy `Code.gs` sebagai Web App (GAS) → salin URL
3. Tempel URL di `app.js` (`const GAS_URL = ...`)
4. Jalankan fungsi `setupSpreadsheet()` sekali dari GAS editor
5. Host `index.html` + `app.js` → masukkan URL ke `MainActivity.java`

## Login Default

| NIP | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `001` | `1234` | Karyawan |
| `002` | `1234` | Karyawan |

## Konfigurasi Lokasi Gedung

Edit di `app.js`:
```javascript
const GEDUNG_LOCATIONS = [
  { nama: 'MTs Al-Hikmah', lat: -6.9700, lng: 109.6800, radius: 100 },
  { nama: 'MIS Al-Hikmah', lat: -6.9710, lng: 109.6810, radius: 100 },
  { nama: 'PKBM Al-Hikmah', lat: -6.9720, lng: 109.6820, radius: 100 },
  { nama: 'KB Al-Hikmah', lat: -6.9730, lng: 109.6830, radius: 100 },
];
```

## Struktur Data (Google Sheets)

**Sheet "Karyawan":**
| NIP | Nama | Jabatan | Lembaga | Avatar URL | Password |

**Sheet "Presensi":**
| NIP | Tanggal | Jam Masuk | Jam Keluar | Status | Keterangan | Lat | Lng | Is Mock | Device | Timestamp |

**Sheet "Settings":**
| Key | Value |

## API Endpoints

| Action | Parameter | Keterangan |
|---|---|---|
| `login` | nip, password | Login user/admin |
| `getStatus` | nip | Status presensi hari ini |
| `clockIn` | nip, lat, lng | Clock in |
| `clockOut` | nip, lat, lng | Clock out |
| `getHistory` | nip, bulan, tahun | Riwayat bulanan |
| `getStats` | nip, bulan, tahun | Statistik bulanan |
| `getAdminDashboard` | bulan, tahun | Dashboard admin |
| `getAllKaryawan` | - | Semua data karyawan |
| `addKaryawan` | nip, nama, jabatan, lembaga, password | Tambah karyawan |
| `deleteKaryawan` | nip | Hapus karyawan |
| `getAllPresensi` | bulan, tahun | Semua presensi |
| `exportCSV` | bulan, tahun | Download CSV |
| `updateSettings` | jamBatas | Update pengaturan |

## Dibuat oleh
Baitul Hikmah — Yayasan Al-Hikmah © 2025
