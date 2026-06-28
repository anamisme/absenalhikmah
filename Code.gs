// ============================================================
//  PRESENSI BAITUL HIKMAH — Google Apps Script Backend
//  Pasang di: Extensions > Apps Script > Paste > Deploy as Web App
// ============================================================

const SPREADSHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_KAMU'; // <-- GANTI INI
const SHEET_KARYAWAN  = 'Karyawan';
const SHEET_PRESENSI  = 'Presensi';
const JAM_MASUK_BATAS = '07:00'; // Batas jam masuk (sebelum ini = Tepat Waktu)

// ─── CORS Helper ─────────────────────────────────────────────
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function setCORSHeaders(output) {
  return output; // Web App GAS tidak support custom headers, gunakan mode no-cors atau proxy
}

// ─── Entry Point ─────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'login':        result = login(e.parameter.nip, e.parameter.password); break;
      case 'getStatus':    result = getStatusHariIni(e.parameter.nip); break;
      case 'clockIn':      result = clockIn(e.parameter.nip, e.parameter.lat, e.parameter.lng); break;
      case 'clockOut':     result = clockOut(e.parameter.nip, e.parameter.lat, e.parameter.lng); break;
      case 'getHistory':   result = getHistory(e.parameter.nip, e.parameter.bulan, e.parameter.tahun); break;
      case 'getStats':     result = getStats(e.parameter.nip, e.parameter.bulan, e.parameter.tahun); break;
      case 'getKaryawan':  result = getKaryawan(e.parameter.nip); break;
      default:             result = { ok: false, msg: 'Action tidak dikenal: ' + action };
    }
  } catch (err) {
    result = { ok: false, msg: 'Server error: ' + err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
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
            nip:      data[i][0],
            nama:     data[i][1],
            jabatan:  data[i][2],
            lembaga:  data[i][3],
            avatar:   data[i][4] || ''
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
      return {
        ok: true,
        karyawan: {
          nip:     data[i][0],
          nama:    data[i][1],
          jabatan: data[i][2],
          lembaga: data[i][3],
          avatar:  data[i][4] || ''
        }
      };
    }
  }
  return { ok: false, msg: 'Karyawan tidak ditemukan.' };
}

// ─── STATUS HARI INI ─────────────────────────────────────────
function getStatusHariIni(nip) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const today  = getTanggalStr();
  const sheet  = getSheet(SHEET_PRESENSI);
  const data   = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(nip).trim() &&
        String(data[i][1]).trim() === today) {
      return {
        ok: true,
        tanggal:    data[i][1],
        jam_masuk:  data[i][2] || null,
        jam_keluar: data[i][3] || null,
        status:     data[i][4] || null,
        keterangan: data[i][5] || null
      };
    }
  }
  return { ok: true, tanggal: today, jam_masuk: null, jam_keluar: null, status: null };
}

// ─── CLOCK IN ────────────────────────────────────────────────
function clockIn(nip, lat, lng) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };

  const today   = getTanggalStr();
  const jamNow  = getJamStr();
  const sheet   = getSheet(SHEET_PRESENSI);
  const data    = sheet.getDataRange().getValues();

  // Cek apakah sudah clock-in hari ini
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nip).trim() &&
        String(data[i][1]).trim() === today &&
        data[i][2]) {
      return { ok: false, msg: 'Anda sudah melakukan clock-in hari ini pukul ' + data[i][2] + '.' };
    }
  }

  const status = hitungStatus(jamNow);
  const row    = [nip, today, jamNow, '', status, '', lat || '', lng || '', new Date()];
  sheet.appendRow(row);

  return { ok: true, msg: 'Clock-in berhasil.', jam_masuk: jamNow, status: status };
}

// ─── CLOCK OUT ───────────────────────────────────────────────
function clockOut(nip, lat, lng) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };

  const today  = getTanggalStr();
  const jamNow = getJamStr();
  const sheet  = getSheet(SHEET_PRESENSI);
  const data   = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(nip).trim() &&
        String(data[i][1]).trim() === today) {
      if (!data[i][2]) return { ok: false, msg: 'Anda belum melakukan clock-in hari ini.' };
      if (data[i][3])  return { ok: false, msg: 'Anda sudah clock-out hari ini pukul ' + data[i][3] + '.' };

      const rowNum = i + 1;
      sheet.getRange(rowNum, 4).setValue(jamNow);         // jam_keluar
      sheet.getRange(rowNum, 7).setValue(lat  || '');     // lat_out
      sheet.getRange(rowNum, 8).setValue(lng  || '');     // lng_out
      return { ok: true, msg: 'Clock-out berhasil.', jam_keluar: jamNow };
    }
  }
  return { ok: false, msg: 'Data clock-in hari ini tidak ditemukan.' };
}

// ─── HISTORY ─────────────────────────────────────────────────
function getHistory(nip, bulan, tahun) {
  if (!nip) return { ok: false, msg: 'NIP diperlukan.' };
  const bln    = bulan  || (new Date().getMonth() + 1);
  const thn    = tahun  || new Date().getFullYear();
  const sheet  = getSheet(SHEET_PRESENSI);
  const data   = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(nip).trim()) continue;
    const tgl = String(data[i][1]).trim(); // format YYYY-MM-DD
    if (!tgl) continue;
    const parts = tgl.split('-');
    if (parseInt(parts[1]) === parseInt(bln) && parseInt(parts[0]) === parseInt(thn)) {
      result.push({
        tanggal:    data[i][1],
        jam_masuk:  data[i][2] || null,
        jam_keluar: data[i][3] || null,
        status:     data[i][4] || null,
        keterangan: data[i][5] || null
      });
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
    // Contoh data
    sh.appendRow(['001', 'Ahmad Fauzi', 'Guru', 'MTs Al-Hikmah', '', '1234']);
    sh.appendRow(['002', 'Siti Rahayu', 'Staf TU', 'MIS Al-Hikmah', '', '1234']);
  } else if (name === SHEET_PRESENSI) {
    sh.appendRow(['NIP', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Status', 'Keterangan', 'Lat', 'Lng', 'Timestamp']);
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
  const bMnt = bH * 60 + bM;
  const jMnt = jH * 60 + jM;
  return jMnt > bMnt ? 'Terlambat' : 'Tepat Waktu';
}

// ─── SETUP AWAL (jalankan sekali dari editor) ─────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Buat sheet jika belum ada
  [SHEET_KARYAWAN, SHEET_PRESENSI].forEach(n => {
    if (!ss.getSheetByName(n)) initSheet(ss, n);
  });
  Logger.log('Setup selesai.');
}
