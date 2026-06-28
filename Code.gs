// ============================================================
//  PRESENSI BAITUL HIKMAH — Google Apps Script Backend v2.0
//  Pasang di: Extensions > Apps Script > Paste > Deploy as Web App
// ============================================================

const SPREADSHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_KAMU'; // <-- GANTI INI
const SHEET_KARYAWAN  = 'Karyawan';
const SHEET_PRESENSI  = 'Presensi';
const SHEET_SETTINGS  = 'Settings';
let JAM_MASUK_BATAS   = '07:00'; // default, bisa di-override dari Settings sheet

// ─── Entry Point ─────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    // Load settings
    loadSettings();
    switch (action) {
      case 'login':             result = login(e.parameter.nip, e.parameter.password); break;
      case 'getStatus':         result = getStatusHariIni(e.parameter.nip); break;
      case 'clockIn':           result = clockIn(e.parameter); break;
      case 'clockOut':          result = clockOut(e.parameter); break;
      case 'getHistory':        result = getHistory(e.parameter.nip, e.parameter.bulan, e.parameter.tahun); break;
      case 'getStats':          result = getStats(e.parameter.nip, e.parameter.bulan, e.parameter.tahun); break;
      case 'getKaryawan':       result = getKaryawan(e.parameter.nip); break;
      // Admin endpoints
      case 'getAdminDashboard': result = getAdminDashboard(e.parameter.bulan, e.parameter.tahun); break;
      case 'getAllKaryawan':    result = getAllKaryawan(); break;
      case 'addKaryawan':       result = addKaryawan(e.parameter); break;
      case 'deleteKaryawan':    result = deleteKaryawan(e.parameter.nip); break;
      case 'getAllPresensi':    result = getAllPresensi(e.parameter.bulan, e.parameter.tahun); break;
      case 'exportCSV':         return exportCSV(e.parameter.bulan, e.parameter.tahun);
      case 'updateSettings':    result = updateSettings(e.parameter); break;
      default:                  result = { ok: false, msg: 'Action tidak dikenal: ' + action };
    }
  } catch (err) {
    result = { ok: false, msg: 'Server error: ' + err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) { return doGet(e); }

// ─── SETTINGS ─────────────────────────────────────────────────
function loadSettings() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(SHEET_SETTINGS);
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === 'jam_masuk_batas' && data[i][1]) {
        JAM_MASUK_BATAS = String(data[i][1]).trim();
      }
    }
  } catch(e) {}
}

function updateSettings(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SETTINGS);
    sh.appendRow(['Key', 'Value']);
  }
  const data = sh.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'jam_masuk_batas') {
      sh.getRange(i+1, 2).setValue(params.jamBatas);
      found = true; break;
    }
  }
  if (!found) sh.appendRow(['jam_masuk_batas', params.jamBatas]);
  JAM_MASUK_BATAS = params.jamBatas;
  return { ok: true, msg: 'Pengaturan disimpan.' };
}

// ─── LOGIN ────────────────────────────────────────────────────
function login(nip, password) {
  if (!nip || !password) return { ok: false, msg: 'NIP dan password wajib diisi.' };
  const sheet = getSheet(SHEET_KARYAWAN);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim()) {
      const storedPass = String(data[i][5]).trim();
      if (storedPass === password) {
        return {
          ok: true,
          karyawan: {
            nip:     String(data[i][0]).trim(),
            nama:    data[i][1],
            jabatan: data[i][2],
            lembaga: data[i][3],
            avatar:  data[i][4] || ''
          }
        };
      } else {
        return { ok: false, msg: 'Password salah.' };
      }
    }
  }
  return { ok: false, msg: 'NIP tidak ditemukan.' };
}

// ─── GET DATA KARYAWAN ────────────────────────────────────────
function getKaryawan(nip) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const sheet = getSheet(SHEET_KARYAWAN);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim()) {
      return { ok: true, karyawan: { nip: data[i][0], nama: data[i][1], jabatan: data[i][2], lembaga: data[i][3], avatar: data[i][4]||'' } };
    }
  }
  return { ok: false, msg: 'Karyawan tidak ditemukan.' };
}

// ─── STATUS HARI INI ─────────────────────────────────────────
function getStatusHariIni(nip) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const today = getTanggalStr();
  const sheet = getSheet(SHEET_PRESENSI);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(nip).trim() && String(data[i][1]).trim() === today) {
      return { ok: true, tanggal: data[i][1], jam_masuk: data[i][2]||null, jam_keluar: data[i][3]||null, status: data[i][4]||null, keterangan: data[i][5]||null };
    }
  }
  return { ok: true, tanggal: today, jam_masuk: null, jam_keluar: null, status: null };
}

// ─── CLOCK IN ────────────────────────────────────────────────
function clockIn(params) {
  const nip = params.nip;
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const today  = getTanggalStr();
  const jamNow = getJamStr();
  const sheet  = getSheet(SHEET_PRESENSI);
  const data   = sheet.getDataRange().getValues();
  // Cek duplikat
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim() && String(data[i][1]).trim() === today && data[i][2]) {
      return { ok: false, msg: 'Sudah clock-in hari ini pukul ' + data[i][2] + '.' };
    }
  }
  const status = hitungStatus(jamNow);
  const lat = params.lat || '';
  const lng = params.lng || '';
  const isMock = params.is_mock || '0';
  const device = params.device || '';
  const row = [nip, today, jamNow, '', status, '', lat, lng, isMock, device, new Date()];
  sheet.appendRow(row);
  return { ok: true, msg: 'Clock-in berhasil pukul ' + jamNow + '.', jam_masuk: jamNow, status: status };
}

// ─── CLOCK OUT ───────────────────────────────────────────────
function clockOut(params) {
  const nip = params.nip;
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const today  = getTanggalStr();
  const jamNow = getJamStr();
  const sheet  = getSheet(SHEET_PRESENSI);
  const data   = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(nip).trim() && String(data[i][1]).trim() === today) {
      if (!data[i][2]) return { ok: false, msg: 'Belum clock-in hari ini.' };
      if (data[i][3])  return { ok: false, msg: 'Sudah clock-out pukul ' + data[i][3] + '.' };
      const rowNum = i + 1;
      sheet.getRange(rowNum, 4).setValue(jamNow);
      return { ok: true, msg: 'Clock-out berhasil pukul ' + jamNow + '.', jam_keluar: jamNow };
    }
  }
  return { ok: false, msg: 'Data clock-in hari ini tidak ditemukan.' };
}

// ─── HISTORY ─────────────────────────────────────────────────
function getHistory(nip, bulan, tahun) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const bln = bulan || (new Date().getMonth() + 1);
  const thn = tahun || new Date().getFullYear();
  const sheet = getSheet(SHEET_PRESENSI);
  const data  = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(nip).trim()) continue;
    const tgl = String(data[i][1]).trim();
    if (!tgl) continue;
    const parts = tgl.split('-');
    if (parseInt(parts[1]) === parseInt(bln) && parseInt(parts[0]) === parseInt(thn)) {
      result.push({ tanggal: data[i][1], jam_masuk: data[i][2]||null, jam_keluar: data[i][3]||null, status: data[i][4]||null, keterangan: data[i][5]||null });
    }
  }
  result.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  return { ok: true, data: result };
}

// ─── STATISTIK ───────────────────────────────────────────────
function getStats(nip, bulan, tahun) {
  const histRes = getHistory(nip, bulan, tahun);
  if (!histRes.ok) return histRes;
  const data = histRes.data;
  const stats = { hadir: 0, terlambat: 0, alfa: 0, izin: 0, total: data.length };
  data.forEach(d => {
    const s = (d.status || '').toLowerCase();
    if (s === 'tepat waktu') stats.hadir++;
    else if (s === 'terlambat') stats.terlambat++;
    else if (s === 'alfa') stats.alfa++;
    else if (s === 'izin') stats.izin++;
  });
  return { ok: true, stats };
}

// ─── ADMIN: DASHBOARD ────────────────────────────────────────
function getAdminDashboard(bulan, tahun) {
  const kSheet = getSheet(SHEET_KARYAWAN);
  const kData  = kSheet.getDataRange().getValues();
  const totalKaryawan = kData.length - 1; // minus header

  const today = getTanggalStr();
  const pSheet = getSheet(SHEET_PRESENSI);
  const pData  = pSheet.getDataRange().getValues();

  let hadirHariIni = 0;
  let terlambatHariIni = 0;
  const todayData = [];
  const recentActivity = [];
  const nipHadirSet = new Set();

  // Build nama lookup
  const namaMap = {};
  const lembagaMap = {};
  for (let i = 1; i < kData.length; i++) {
    namaMap[String(kData[i][0]).trim()] = kData[i][1];
    lembagaMap[String(kData[i][0]).trim()] = kData[i][3];
  }

  for (let i = pData.length - 1; i >= 1; i--) {
    const nip = String(pData[i][0]).trim();
    const tgl = String(pData[i][1]).trim();
    
    // Today data
    if (tgl === today) {
      nipHadirSet.add(nip);
      hadirHariIni++;
      if (pData[i][4] === 'Terlambat') terlambatHariIni++;
      todayData.push({
        nip: nip,
        nama: namaMap[nip] || nip,
        lembaga: lembagaMap[nip] || '-',
        jam_masuk: pData[i][2] || null,
        jam_keluar: pData[i][3] || null,
        status: pData[i][4] || null
      });
    }

    // Recent activity (last 10)
    if (recentActivity.length < 10) {
      if (pData[i][3]) {
        recentActivity.push({ type: 'out', nama: namaMap[nip]||nip, waktu: tgl+' '+pData[i][3] });
      }
      if (pData[i][2]) {
        recentActivity.push({ type: 'in', nama: namaMap[nip]||nip, waktu: tgl+' '+pData[i][2] });
      }
    }
  }

  const belumAbsen = totalKaryawan - nipHadirSet.size;

  return {
    ok: true,
    stats: { totalKaryawan, hadirHariIni, terlambatHariIni, belumAbsen: Math.max(0, belumAbsen) },
    todayData: todayData.slice(0, 20),
    recentActivity: recentActivity.slice(0, 10)
  };
}

// ─── ADMIN: ALL KARYAWAN ─────────────────────────────────────
function getAllKaryawan() {
  const sheet = getSheet(SHEET_KARYAWAN);
  const data  = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    result.push({ nip: String(data[i][0]).trim(), nama: data[i][1], jabatan: data[i][2], lembaga: data[i][3], avatar: data[i][4]||'' });
  }
  return { ok: true, data: result };
}

// ─── ADMIN: ADD KARYAWAN ─────────────────────────────────────
function addKaryawan(params) {
  const { nip, nama, jabatan, lembaga, password } = params;
  if (!nip || !nama || !jabatan || !lembaga || !password) return { ok: false, msg: 'Semua field wajib diisi.' };
  const sheet = getSheet(SHEET_KARYAWAN);
  const data  = sheet.getDataRange().getValues();
  // Check duplicate
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim()) return { ok: false, msg: 'NIP sudah terdaftar.' };
  }
  sheet.appendRow([nip, nama, jabatan, lembaga, '', password]);
  return { ok: true, msg: 'Karyawan berhasil ditambahkan.' };
}

// ─── ADMIN: DELETE KARYAWAN ──────────────────────────────────
function deleteKaryawan(nip) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const sheet = getSheet(SHEET_KARYAWAN);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim()) {
      sheet.deleteRow(i + 1);
      return { ok: true, msg: 'Karyawan dihapus.' };
    }
  }
  return { ok: false, msg: 'NIP tidak ditemukan.' };
}

// ─── ADMIN: ALL PRESENSI ─────────────────────────────────────
function getAllPresensi(bulan, tahun) {
  const bln = bulan || (new Date().getMonth() + 1);
  const thn = tahun || new Date().getFullYear();
  const sheet = getSheet(SHEET_PRESENSI);
  const data  = sheet.getDataRange().getValues();
  
  // Nama lookup
  const kSheet = getSheet(SHEET_KARYAWAN);
  const kData  = kSheet.getDataRange().getValues();
  const namaMap = {};
  for (let i = 1; i < kData.length; i++) namaMap[String(kData[i][0]).trim()] = kData[i][1];

  const result = [];
  for (let i = 1; i < data.length; i++) {
    const tgl = String(data[i][1]).trim();
    if (!tgl) continue;
    const parts = tgl.split('-');
    if (parseInt(parts[1]) === parseInt(bln) && parseInt(parts[0]) === parseInt(thn)) {
      const nip = String(data[i][0]).trim();
      result.push({
        nip: nip,
        nama: namaMap[nip] || nip,
        tanggal: data[i][1],
        jam_masuk: data[i][2] || null,
        jam_keluar: data[i][3] || null,
        status: data[i][4] || null,
        keterangan: data[i][5] || null
      });
    }
  }
  result.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  return { ok: true, data: result };
}

// ─── ADMIN: EXPORT CSV ───────────────────────────────────────
function exportCSV(bulan, tahun) {
  const res = getAllPresensi(bulan, tahun);
  if (!res.ok) return ContentService.createTextOutput('Error').setMimeType(ContentService.MimeType.TEXT);
  let csv = 'NIP,Nama,Tanggal,Jam Masuk,Jam Keluar,Status,Keterangan\n';
  res.data.forEach(d => {
    csv += [d.nip, '"'+d.nama+'"', d.tanggal, d.jam_masuk||'', d.jam_keluar||'', d.status||'', d.keterangan||''].join(',') + '\n';
  });
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV)
    .downloadAsFile('presensi_'+bulan+'_'+tahun+'.csv');
}

// ─── UTILITIES ───────────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = initSheet(ss, name);
  return sh;
}

function initSheet(ss, name) {
  const sh = ss.insertSheet(name);
  if (name === SHEET_KARYAWAN) {
    sh.appendRow(['NIP', 'Nama', 'Jabatan', 'Lembaga', 'Avatar URL', 'Password']);
    sh.appendRow(['admin', 'Administrator', 'Admin', 'Yayasan Al-Hikmah', '', 'admin123']);
    sh.appendRow(['001', 'Ahmad Fauzi', 'Guru', 'MTs Al-Hikmah', '', '1234']);
    sh.appendRow(['002', 'Siti Rahayu', 'Staf TU', 'MIS Al-Hikmah', '', '1234']);
  } else if (name === SHEET_PRESENSI) {
    sh.appendRow(['NIP', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Status', 'Keterangan', 'Lat', 'Lng', 'Is Mock', 'Device', 'Timestamp']);
  } else if (name === SHEET_SETTINGS) {
    sh.appendRow(['Key', 'Value']);
    sh.appendRow(['jam_masuk_batas', '07:00']);
  }
  return sh;
}

function getTanggalStr() {
  const now = new Date();
  const tz  = Session.getScriptTimeZone();
  return Utilities.formatDate(now, tz, 'yyyy-MM-dd');
}

function getJamStr() {
  const now = new Date();
  const tz  = Session.getScriptTimeZone();
  return Utilities.formatDate(now, tz, 'HH:mm');
}

function hitungStatus(jam) {
  const [bH, bM] = JAM_MASUK_BATAS.split(':').map(Number);
  const [jH, jM] = jam.split(':').map(Number);
  return (jH * 60 + jM) > (bH * 60 + bM) ? 'Terlambat' : 'Tepat Waktu';
}

// ─── SETUP AWAL (jalankan sekali dari editor) ─────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [SHEET_KARYAWAN, SHEET_PRESENSI, SHEET_SETTINGS].forEach(n => {
    if (!ss.getSheetByName(n)) initSheet(ss, n);
  });
  Logger.log('Setup selesai. Sheet Karyawan, Presensi, dan Settings telah dibuat.');
}
