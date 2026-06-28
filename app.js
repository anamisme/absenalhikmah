// ============================================================
//  PRESENSI BAITUL HIKMAH — Main Application Script
// ============================================================

// === CONFIG ===
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFtCfNLDiu38u01JveCI2KK5c_RP2odcyXcU6QjwPmem7l8C9wGY3QZ3t3u4c2-0a7/exec';
const GEDUNG_LOCATIONS = [
  { nama: 'MTs Al-Hikmah', lat: -6.9700, lng: 109.6800, radius: 100 },
  { nama: 'MIS Al-Hikmah', lat: -6.9710, lng: 109.6810, radius: 100 },
  { nama: 'PKBM Al-Hikmah', lat: -6.9720, lng: 109.6820, radius: 100 },
  { nama: 'KB Al-Hikmah', lat: -6.9730, lng: 109.6830, radius: 100 },
];
const ADMIN_NIP = 'admin';
const RADIUS_OVERRIDE = true; // SET false UNTUK PRODUCTION

// === STATE ===
let currentUser = null;
let userLat = null, userLng = null;
let clockStatus = null;
let lokasiValid = false;
let lokasiResult = null;
let allKaryawan = [];

// === INIT ===
window.addEventListener('DOMContentLoaded', () => {
  startClock();
  initSelectors();
  const saved = sessionStorage.getItem('bh_user');
  if (saved) { currentUser = JSON.parse(saved); bootApp(); }
});

// === LIVE CLOCK ===
function startClock() {
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  function tick() {
    const n = new Date();
    const el = document.getElementById('liveClock');
    if (el) el.textContent = pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
    const eld = document.getElementById('liveDate');
    if (eld) eld.textContent = days[n.getDay()]+', '+n.getDate()+' '+months[n.getMonth()]+' '+n.getFullYear();
    const tl = document.getElementById('tanggalLabel');
    if (tl) tl.textContent = days[n.getDay()]+', '+n.getDate()+' '+months[n.getMonth()];
  }
  tick(); setInterval(tick, 1000);
}
function pad(n) { return String(n).padStart(2,'0'); }

// === GEOLOCATION & FAKE GPS ===
function getLocation() {
  const dot = document.getElementById('lokasiDot');
  const info = document.getElementById('lokasiInfo');
  if (!navigator.geolocation) {
    setLokasiState('error', '⚠ GPS tidak tersedia');
    return;
  }
  setLokasiState('loading', 'Mendeteksi lokasi...');
  const startTime = Date.now();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const elapsed = Date.now() - startTime;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      const suspicious = [];
      let nativeMock = false;
      // Android bridge check
      if (window.AndroidBridge) {
        try {
          const mockRes = JSON.parse(AndroidBridge.checkMockLocation());
          if (mockRes.isMock) { nativeMock = true; mockRes.reasons.forEach(r => suspicious.push(r)); }
          if (AndroidBridge.isDeveloperModeEnabled()) suspicious.push('Developer Options aktif');
        } catch(e) {}
      }
      if (elapsed < 200 && !nativeMock) suspicious.push('GPS terlalu cepat ('+elapsed+'ms)');
      if (accuracy < 3) suspicious.push('Akurasi terlalu sempurna ('+accuracy.toFixed(1)+'m)');
      const gedungMatch = cekRadiusGedung(lat, lng);
      const isMockDetected = nativeMock || suspicious.length >= 2;
      if (isMockDetected) {
        lokasiValid = false;
        setLokasiState('error', '🚫 Fake GPS!');
        showFakeGpsModal(suspicious);
        lokasiResult = { lat, lng, accuracy, gedung: null, isMock: true, suspicious };
        disableClockBtn('Fake GPS terdeteksi');
        return;
      }
      if (!gedungMatch && !RADIUS_OVERRIDE) {
        lokasiValid = false;
        setLokasiState('warn', '📍 Di luar area gedung');
        disableClockBtn('Di luar area gedung');
        lokasiResult = { lat, lng, accuracy, gedung: null, isMock: false };
        return;
      }
      lokasiValid = true;
      lokasiResult = { lat: lat.toFixed(6), lng: lng.toFixed(6), accuracy: Math.round(accuracy), gedung: gedungMatch?.nama || 'Area Yayasan', isMock: false };
      userLat = lokasiResult.lat;
      userLng = lokasiResult.lng;
      setLokasiState('ok', '✓ '+(gedungMatch?.nama||'OK')+' (±'+Math.round(accuracy)+'m)');
      enableClockBtn();
    },
    (err) => {
      lokasiValid = false;
      const msg = {1:'Izin ditolak',2:'Sinyal lemah',3:'Timeout'}[err.code]||'GPS error';
      setLokasiState('error', '⚠ '+msg);
      disableClockBtn('GPS tidak aktif');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function cekRadiusGedung(lat, lng) {
  for (const g of GEDUNG_LOCATIONS) {
    if (hitungJarak(lat, lng, g.lat, g.lng) <= g.radius) return g;
  }
  return null;
}

function hitungJarak(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function setLokasiState(state, msg) {
  const dot = document.getElementById('lokasiDot');
  const info = document.getElementById('lokasiInfo');
  if (info) info.textContent = msg;
  if (dot) dot.className = 'w-2 h-2 rounded-full flex-shrink-0 '+({loading:'bg-outline animate-pulse',ok:'bg-secondary',warn:'bg-warning',error:'bg-error'}[state]||'');
}

function disableClockBtn(reason) {
  const btn = document.getElementById('btnClock');
  if (btn) { btn.disabled = true; btn.title = reason; }
}
function enableClockBtn() {
  const btn = document.getElementById('btnClock');
  if (btn && clockStatus !== 'done') btn.disabled = false;
}

function showFakeGpsModal(reasons) {
  document.getElementById('fakeGpsModal').classList.remove('hidden');
  document.getElementById('fakeGpsReasons').innerHTML = reasons.map(r=>'• '+r).join('<br>');
}
function closeFakeGpsModal() { document.getElementById('fakeGpsModal').classList.add('hidden'); }

// === LOGIN ===
async function doLogin() {
  const nip = document.getElementById('inputNip').value.trim();
  const pass = document.getElementById('inputPass').value.trim();
  const err = document.getElementById('loginErr');
  const btn = document.getElementById('btnLogin');
  if (!nip || !pass) { showErr(err,'Isi NIP dan password.'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="ms text-[20px] animate-spin">autorenew</span> Memuat...';
  const res = await gasCall({ action:'login', nip, password:pass });
  btn.disabled = false;
  btn.innerHTML = '<span class="ms text-[20px]">login</span> Masuk';
  if (!res || !res.ok) { showErr(err, res?.msg||'Gagal terhubung.'); return; }
  err.classList.add('hidden');
  currentUser = res.karyawan;
  sessionStorage.setItem('bh_user', JSON.stringify(currentUser));
  bootApp();
}

function bootApp() {
  document.getElementById('pageLogin').classList.add('hidden');
  document.getElementById('pageLogin').classList.remove('active');
  // Check if admin — robust: trim + lowercase
  const nipClean = String(currentUser.nip).trim().toLowerCase();
  const jabatanClean = String(currentUser.jabatan || '').trim().toLowerCase();
  if (nipClean === ADMIN_NIP.toLowerCase() || jabatanClean === 'admin') {
    document.getElementById('adminShell').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    bootAdmin();
    return;
  }
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('adminShell').classList.add('hidden');
  // Fill profile
  document.getElementById('namaUser').textContent = firstName(currentUser.nama);
  document.getElementById('profileNama').textContent = currentUser.nama;
  document.getElementById('profileJabatan').textContent = currentUser.jabatan;
  document.getElementById('profileLembaga').textContent = currentUser.lembaga;
  document.getElementById('profileLembaga2').textContent = currentUser.lembaga;
  document.getElementById('profileNip').textContent = currentUser.nip;
  // Greeting
  const h = new Date().getHours();
  document.getElementById('greetLabel').textContent = h<11?'Selamat Pagi,':h<15?'Selamat Siang,':h<18?'Selamat Sore,':'Selamat Malam,';
  loadStatusHariIni();
  getLocation();
  showPage('pageHome');
}

function doLogout() {
  sessionStorage.removeItem('bh_user');
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('adminShell').classList.add('hidden');
  const login = document.getElementById('pageLogin');
  login.classList.remove('hidden');
  login.classList.add('active');
  login.style.display = 'flex';
  document.getElementById('inputNip').value = '';
  document.getElementById('inputPass').value = '';
}

// === STATUS & CLOCK ===
async function loadStatusHariIni() {
  const res = await gasCall({ action:'getStatus', nip: currentUser.nip });
  if (!res || !res.ok) return;
  const btn = document.getElementById('btnClock');
  const btnIcon = document.getElementById('btnClockIcon');
  const btnLabel = document.getElementById('btnClockLabel');
  const badge = document.getElementById('statusBadge');
  const st = document.getElementById('statusText');

  if (res.jam_masuk) {
    document.getElementById('jamMasukDisplay').textContent = res.jam_masuk;
    document.getElementById('jamMasukDisplay').className = 'text-headline-sm '+(res.status==='Terlambat'?'text-warning':'text-secondary');
  }
  if (res.jam_keluar) {
    document.getElementById('jamKeluarDisplay').textContent = res.jam_keluar;
    document.getElementById('keluarBox').classList.remove('opacity-60');
  }

  if (!res.jam_masuk) {
    badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full w-fit text-xs font-semibold badge-izin';
    badge.querySelector('.ms').textContent = 'radio_button_unchecked';
    st.textContent = 'Belum Absen';
    clockStatus = 'can-in';
    btnIcon.textContent = 'login'; btnLabel.textContent = 'Clock In';
    btn.className = btn.className.replace('bg-warning','bg-primary');
    if (lokasiValid) btn.disabled = false;
  } else if (!res.jam_keluar) {
    badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full w-fit text-xs font-semibold '+(res.status==='Terlambat'?'badge-late':'badge-ok');
    badge.querySelector('.ms').textContent = res.status==='Terlambat'?'error':'check_circle';
    st.textContent = res.status||'Hadir';
    clockStatus = 'can-out';
    btn.className = btn.className.replace('bg-primary','bg-warning');
    btnIcon.textContent = 'logout'; btnLabel.textContent = 'Clock Out';
    if (lokasiValid) btn.disabled = false;
  } else {
    badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full w-fit text-xs font-semibold badge-ok';
    badge.querySelector('.ms').textContent = 'task_alt';
    st.textContent = 'Selesai';
    btn.disabled = true;
    btnIcon.textContent = 'done_all'; btnLabel.textContent = 'Presensi Selesai';
    clockStatus = 'done';
  }
}

async function handleClock() {
  if (!lokasiValid && !RADIUS_OVERRIDE) { showToast('Lokasi tidak valid.', false); getLocation(); return; }
  if (lokasiResult?.isMock) { showFakeGpsModal(lokasiResult.suspicious||['Fake GPS']); return; }
  const btn = document.getElementById('btnClock');
  btn.disabled = true;
  btn.innerHTML = '<span class="ms animate-spin text-[22px]">autorenew</span> Memproses...';
  const action = clockStatus==='can-in'?'clockIn':'clockOut';
  const params = { action, nip:currentUser.nip, lat:userLat||'', lng:userLng||'' };
  if (window.AndroidBridge) { try { const d=JSON.parse(AndroidBridge.getDeviceInfo()); params.device=d.brand+' '+d.model; } catch(e){} }
  const res = await gasCall(params);
  if (res && res.ok) {
    showToast(res.msg, true);
    if (window.AndroidBridge) AndroidBridge.showToast(res.msg);
    setTimeout(()=>loadStatusHariIni(), 800);
  } else {
    showToast(res?.msg||'Gagal.', false);
    btn.disabled = false;
    btn.innerHTML = `<span class="ms text-[22px]" id="btnClockIcon">${clockStatus==='can-in'?'login':'logout'}</span><span id="btnClockLabel">${clockStatus==='can-in'?'Clock In':'Clock Out'}</span>`;
  }
}

// === HISTORY ===
async function loadHistory() {
  if (!currentUser) return;
  const bln = document.getElementById('selBulan').value;
  const thn = document.getElementById('selTahun').value;
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="skel h-16 w-full"></div><div class="skel h-16 w-full mt-3"></div>';
  const res = await gasCall({ action:'getHistory', nip:currentUser.nip, bulan:bln, tahun:thn });
  if (!res||!res.ok||!res.data.length) { list.innerHTML='<div class="bg-surface rounded-2xl p-6 ios-shadow text-center text-sm text-on-surface-variant">Tidak ada data bulan ini.</div>'; return; }
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  list.innerHTML = res.data.map(d => {
    const [y,m,day] = d.tanggal.split('-');
    const dayName = days[new Date(d.tanggal).getDay()];
    const st = d.status||'Alfa';
    const bc = st==='Tepat Waktu'?'badge-ok':st==='Terlambat'?'badge-late':st==='Izin'?'badge-izin':'badge-alfa';
    const ic = st==='Tepat Waktu'?'check_circle':st==='Terlambat'?'error':st==='Izin'?'info':'cancel';
    return `<div class="bg-surface rounded-2xl p-4 ios-shadow flex items-center gap-4">
      <div class="flex flex-col items-center min-w-[40px]"><span class="text-xs text-on-surface-variant">${dayName}</span><span class="text-xl font-bold">${day}</span></div>
      <div class="w-px h-10 bg-outline-variant/40"></div>
      <div class="flex-1 flex flex-col gap-0.5">
        <div class="flex items-center gap-2"><span class="text-sm font-semibold">Masuk: ${d.jam_masuk||'--:--'}</span>${d.jam_keluar?`<span class="text-xs text-on-surface-variant">· Keluar: ${d.jam_keluar}</span>`:''}</div>
        <span class="inline-flex items-center gap-1 text-xs font-semibold ${bc} px-2 py-0.5 rounded-full w-fit"><span class="ms ms-fill text-[12px]">${ic}</span>${st}</span>
      </div></div>`;
  }).join('');
}

// === STATS ===
async function loadStats() {
  if (!currentUser) return;
  const bln = document.getElementById('selBulan').value;
  const thn = document.getElementById('selTahun').value;
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<div class="skel h-24 col-span-2"></div>';
  const res = await gasCall({ action:'getStats', nip:currentUser.nip, bulan:bln, tahun:thn });
  if (!res||!res.ok) return;
  const s = res.stats;
  const cards = [
    { label:'Tepat Waktu', val:s.hadir, icon:'check_circle', cls:'text-secondary', bg:'bg-[#f0fdf4]' },
    { label:'Terlambat', val:s.terlambat, icon:'error', cls:'text-warning', bg:'bg-[#fff7ed]' },
    { label:'Izin/Sakit', val:s.izin, icon:'info', cls:'text-primary', bg:'bg-[#eff6ff]' },
    { label:'Alfa', val:s.alfa, icon:'cancel', cls:'text-error', bg:'bg-[#fef2f2]' },
  ];
  grid.innerHTML = cards.map(c=>`<div class="${c.bg} rounded-2xl p-4 ios-shadow flex flex-col gap-2">
    <span class="ms ms-fill ${c.cls} text-[28px]">${c.icon}</span>
    <span class="text-3xl font-bold">${c.val}</span>
    <span class="text-xs font-semibold text-on-surface-variant">${c.label}</span></div>`).join('');
  // Donut
  const total = s.hadir+s.terlambat+s.izin+s.alfa||1;
  const slices = [{val:s.hadir,color:'#16a34a',label:'Tepat Waktu'},{val:s.terlambat,color:'#FF9500',label:'Terlambat'},{val:s.izin,color:'#2563eb',label:'Izin'},{val:s.alfa,color:'#dc2626',label:'Alfa'}];
  drawDonut(slices, total);
}

function drawDonut(slices, total) {
  const svg = document.getElementById('donutSvg');
  const legend = document.getElementById('legendArea');
  const cx=60,cy=60,r=44,stroke=16;
  let offset=0, paths='';
  slices.forEach(s => { if(!s.val) return; const pct=s.val/total; const dash=pct*2*Math.PI*r; const gap=2*Math.PI*r-dash;
    paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" opacity=".9"/>`;
    offset+=dash; });
  svg.innerHTML = paths+`<text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="16" font-weight="700" fill="#1a1b1f">${total}</text><text x="${cx}" y="${cy+12}" text-anchor="middle" font-size="9" fill="#717786">Hari Kerja</text>`;
  legend.innerHTML = slices.filter(s=>s.val>0).map(s=>`<div class="flex items-center gap-1.5 text-xs"><span class="w-2.5 h-2.5 rounded-full" style="background:${s.color}"></span><span class="text-on-surface-variant">${s.label} (${s.val})</span></div>`).join('');
}

// === NAVIGATION ===
const navPages = ['pageHome','pageHistory','pageStats','pageProfile'];
function showPage(id) {
  document.querySelectorAll('#appShell .page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  navPages.forEach(p => {
    const btn = document.getElementById('nav-'+p);
    if (!btn) return;
    if (p===id) { btn.classList.add('bg-primary/10','text-primary'); btn.classList.remove('text-on-surface-variant'); btn.querySelector('.ms').classList.add('ms-fill'); }
    else { btn.classList.remove('bg-primary/10','text-primary'); btn.classList.add('text-on-surface-variant'); btn.querySelector('.ms').classList.remove('ms-fill'); }
  });
  if (id==='pageHistory') loadHistory();
  if (id==='pageStats') loadStats();
}

// === ADMIN PANEL ===
function bootAdmin() {
  initAdminSelectors();
  loadAdminDashboard();
  showAdminTab('adminDashboard');
}

function showAdminTab(id) {
  document.querySelectorAll('#adminShell .page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  ['adminDashboard','adminKaryawan','adminPresensi','adminSettings'].forEach(t => {
    const tab = document.getElementById('atab-'+t);
    if (!tab) return;
    if (t===id) { tab.classList.add('tab-active'); tab.classList.remove('text-on-surface-variant'); }
    else { tab.classList.remove('tab-active'); tab.classList.add('text-on-surface-variant'); }
  });
  if (id==='adminKaryawan') loadAdminKaryawan();
  if (id==='adminPresensi') loadAdminPresensi();
  if (id==='adminSettings') loadAdminSettings();
}

function initAdminSelectors() {
  const now = new Date();
  const selB = document.getElementById('adminSelBulan');
  const selT = document.getElementById('adminSelTahun');
  if (selB) selB.value = now.getMonth()+1;
  if (selT) { for (let y=now.getFullYear();y>=2023;y--) { const o=document.createElement('option'); o.value=y; o.textContent=y; selT.appendChild(o); } }
}

async function loadAdminDashboard() {
  // Load all presensi for today
  const grid = document.getElementById('adminStatsGrid');
  const todayList = document.getElementById('adminTodayList');
  const recentList = document.getElementById('adminRecentActivity');
  grid.innerHTML = '<div class="skel h-20 col-span-2"></div>';
  todayList.innerHTML = '<div class="skel h-10"></div>';

  // Get all stats for current month
  const now = new Date();
  const bln = now.getMonth()+1;
  const thn = now.getFullYear();
  
  // We'll call getAdminDashboard which we'll add to GAS
  const res = await gasCall({ action:'getAdminDashboard', bulan:bln, tahun:thn });
  if (!res||!res.ok) {
    grid.innerHTML = '<div class="col-span-2 text-sm text-on-surface-variant text-center p-4">Tidak dapat memuat data.</div>';
    return;
  }

  const s = res.stats;
  grid.innerHTML = `
    <div class="bg-[#f0fdf4] rounded-2xl p-4 ios-shadow flex flex-col gap-1">
      <span class="ms ms-fill text-secondary text-[24px]">groups</span>
      <span class="text-2xl font-bold">${s.totalKaryawan}</span>
      <span class="text-xs text-on-surface-variant">Total Karyawan</span>
    </div>
    <div class="bg-[#eff6ff] rounded-2xl p-4 ios-shadow flex flex-col gap-1">
      <span class="ms ms-fill text-primary text-[24px]">how_to_reg</span>
      <span class="text-2xl font-bold">${s.hadirHariIni}</span>
      <span class="text-xs text-on-surface-variant">Hadir Hari Ini</span>
    </div>
    <div class="bg-[#fff7ed] rounded-2xl p-4 ios-shadow flex flex-col gap-1">
      <span class="ms ms-fill text-warning text-[24px]">schedule</span>
      <span class="text-2xl font-bold">${s.terlambatHariIni}</span>
      <span class="text-xs text-on-surface-variant">Terlambat</span>
    </div>
    <div class="bg-[#fef2f2] rounded-2xl p-4 ios-shadow flex flex-col gap-1">
      <span class="ms ms-fill text-error text-[24px]">person_off</span>
      <span class="text-2xl font-bold">${s.belumAbsen}</span>
      <span class="text-xs text-on-surface-variant">Belum Absen</span>
    </div>`;

  // Today's attendance list
  if (res.todayData && res.todayData.length) {
    todayList.innerHTML = res.todayData.map(d => `
      <div class="flex items-center gap-3 py-2 border-b border-outline-variant/20 last:border-0">
        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span class="ms text-primary text-[16px]">person</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${d.nama}</p>
          <p class="text-xs text-on-surface-variant">${d.lembaga}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="text-xs font-semibold">${d.jam_masuk||'--:--'}</p>
          <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${d.status==='Terlambat'?'badge-late':'badge-ok'}">${d.status||'-'}</span>
        </div>
      </div>`).join('');
  } else {
    todayList.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-3">Belum ada data hari ini.</p>';
  }

  // Recent activity
  if (res.recentActivity && res.recentActivity.length) {
    recentList.innerHTML = res.recentActivity.map(a => `
      <div class="flex items-center gap-3 py-2 border-b border-outline-variant/20 last:border-0">
        <span class="ms text-[18px] ${a.type==='in'?'text-secondary':'text-warning'}">${a.type==='in'?'login':'logout'}</span>
        <div class="flex-1"><p class="text-xs font-medium">${a.nama}</p><p class="text-[10px] text-on-surface-variant">${a.waktu}</p></div>
      </div>`).join('');
  } else {
    recentList.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-3">Belum ada aktivitas.</p>';
  }
}

// === ADMIN: KARYAWAN ===
async function loadAdminKaryawan() {
  const list = document.getElementById('karyawanList');
  list.innerHTML = '<div class="skel h-16"></div><div class="skel h-16 mt-3"></div>';
  const res = await gasCall({ action:'getAllKaryawan' });
  if (!res||!res.ok) { list.innerHTML='<p class="text-sm text-on-surface-variant text-center">Gagal memuat.</p>'; return; }
  allKaryawan = res.data;
  renderKaryawanList(allKaryawan);
}

function renderKaryawanList(data) {
  const list = document.getElementById('karyawanList');
  if (!data.length) { list.innerHTML='<p class="text-sm text-on-surface-variant text-center py-4">Tidak ada data.</p>'; return; }
  list.innerHTML = data.map(k => `
    <div class="bg-surface rounded-2xl p-4 ios-shadow flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span class="ms text-primary text-[20px]">person</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate">${k.nama}</p>
        <p class="text-xs text-on-surface-variant">${k.jabatan} · ${k.lembaga}</p>
        <p class="text-[10px] text-outline">NIP: ${k.nip}</p>
      </div>
      <button onclick="deleteKaryawan('${k.nip}')" class="ms text-error text-[20px] opacity-60 hover:opacity-100">delete</button>
    </div>`).join('');
}

function filterKaryawan() {
  const q = document.getElementById('searchKaryawan').value.toLowerCase();
  const filtered = allKaryawan.filter(k => k.nama.toLowerCase().includes(q) || String(k.nip).includes(q));
  renderKaryawanList(filtered);
}

function showAddKaryawanModal() { document.getElementById('addKaryawanModal').classList.remove('hidden'); }
function closeAddKaryawanModal() { document.getElementById('addKaryawanModal').classList.add('hidden'); }

async function saveKaryawan() {
  const nip = document.getElementById('addNip').value.trim();
  const nama = document.getElementById('addNama').value.trim();
  const jabatan = document.getElementById('addJabatan').value.trim();
  const lembaga = document.getElementById('addLembaga').value;
  const password = document.getElementById('addPassword').value.trim();
  if (!nip||!nama||!jabatan||!lembaga||!password) { showToast('Lengkapi semua field.',false); return; }
  const res = await gasCall({ action:'addKaryawan', nip, nama, jabatan, lembaga, password });
  if (res&&res.ok) {
    showToast('Karyawan berhasil ditambahkan.',true);
    closeAddKaryawanModal();
    // Clear form
    ['addNip','addNama','addJabatan','addPassword'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('addLembaga').value='';
    loadAdminKaryawan();
  } else { showToast(res?.msg||'Gagal menambahkan.',false); }
}

async function deleteKaryawan(nip) {
  if (!confirm('Hapus karyawan NIP '+nip+'?')) return;
  const res = await gasCall({ action:'deleteKaryawan', nip });
  if (res&&res.ok) { showToast('Karyawan dihapus.',true); loadAdminKaryawan(); }
  else showToast(res?.msg||'Gagal.',false);
}

// === ADMIN: PRESENSI ===
async function loadAdminPresensi() {
  const bln = document.getElementById('adminSelBulan').value;
  const thn = document.getElementById('adminSelTahun').value;
  const list = document.getElementById('adminPresensiList');
  list.innerHTML = '<div class="skel h-16"></div><div class="skel h-16 mt-3"></div>';
  const res = await gasCall({ action:'getAllPresensi', bulan:bln, tahun:thn });
  if (!res||!res.ok||!res.data.length) { list.innerHTML='<p class="text-sm text-on-surface-variant text-center py-4">Tidak ada data.</p>'; return; }
  list.innerHTML = `<div class="bg-surface rounded-2xl ios-shadow overflow-hidden">
    <div class="overflow-x-auto"><table class="w-full text-xs">
      <thead class="bg-surface-container-high"><tr>
        <th class="px-3 py-2 text-left font-semibold">Tanggal</th>
        <th class="px-3 py-2 text-left font-semibold">NIP</th>
        <th class="px-3 py-2 text-left font-semibold">Nama</th>
        <th class="px-3 py-2 text-left font-semibold">Masuk</th>
        <th class="px-3 py-2 text-left font-semibold">Keluar</th>
        <th class="px-3 py-2 text-left font-semibold">Status</th>
      </tr></thead>
      <tbody>${res.data.map(d=>`<tr class="border-t border-outline-variant/20">
        <td class="px-3 py-2">${d.tanggal}</td>
        <td class="px-3 py-2">${d.nip}</td>
        <td class="px-3 py-2 font-medium">${d.nama||d.nip}</td>
        <td class="px-3 py-2">${d.jam_masuk||'-'}</td>
        <td class="px-3 py-2">${d.jam_keluar||'-'}</td>
        <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.status==='Tepat Waktu'?'badge-ok':d.status==='Terlambat'?'badge-late':'badge-alfa'}">${d.status||'-'}</span></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
}

function exportPresensi() {
  const bln = document.getElementById('adminSelBulan').value;
  const thn = document.getElementById('adminSelTahun').value;
  const url = GAS_URL+'?'+new URLSearchParams({action:'exportCSV',bulan:bln,tahun:thn}).toString();
  window.open(url, '_blank');
  showToast('Mengunduh CSV...', true);
}

// === ADMIN: SETTINGS ===
function loadAdminSettings() {
  const gedungList = document.getElementById('gedungList');
  gedungList.innerHTML = GEDUNG_LOCATIONS.map((g,i) => `
    <div class="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl">
      <span class="ms text-primary text-[20px]">location_on</span>
      <div class="flex-1">
        <p class="text-sm font-medium">${g.nama}</p>
        <p class="text-[10px] text-on-surface-variant">${g.lat}, ${g.lng} · r: ${g.radius}m</p>
      </div>
    </div>`).join('');
}

function showAddGedungModal() {
  showToast('Fitur tambah lokasi — edit di konfigurasi.', false);
}

async function saveSettings() {
  const jam = document.getElementById('settingJamBatas').value;
  if (!jam) return;
  const res = await gasCall({ action:'updateSettings', jamBatas: jam });
  if (res&&res.ok) showToast('Pengaturan disimpan.', true);
  else showToast(res?.msg||'Gagal menyimpan.', false);
}

// === UTILITIES ===
function initSelectors() {
  const now = new Date();
  const selB = document.getElementById('selBulan');
  const selT = document.getElementById('selTahun');
  if (selB) selB.value = now.getMonth()+1;
  if (selT) { for (let y=now.getFullYear();y>=2023;y--) { const o=document.createElement('option'); o.value=y; o.textContent=y; selT.appendChild(o); } }
}

async function gasCall(params) {
  try {
    const url = GAS_URL+'?'+new URLSearchParams(params).toString();
    const res = await fetch(url, { method:'GET', mode:'cors' });
    return await res.json();
  } catch(e) { console.error('GAS Error:', e); return null; }
}

function showToast(msg, success=true) {
  const t = document.getElementById('toast');
  t.textContent = (success?'✓ ':'✕ ')+msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

function showErr(el, msg) { el.textContent=msg; el.classList.remove('hidden'); }
function firstName(nama) { return (nama||'').split(' ')[0]; }

function togglePass() {
  const inp = document.getElementById('inputPass');
  const ico = document.getElementById('eyeIcon');
  if (inp.type==='password') { inp.type='text'; ico.textContent='visibility'; }
  else { inp.type='password'; ico.textContent='visibility_off'; }
}
