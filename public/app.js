/* ----------------- Yardımcılar ve app.js ----------------- */
const FETCH_CREDENTIALS = 'include';
let currentUser = null;
let editingEventId = null;
const eventIndex = new Map();

/* --- Geliştirici guard'ları --- */
const FORCE_DEFAULT_LOGIN_ON_LOAD = true;
const ALWAYS_REDIRECT_TO_DEFAULT_LOGIN = true;

/* === JWT yönetimi + fetch patch === */
const AUTH_KEY = 'auth_token';
let authToken = null;
/* ==================== GLOBAL CONFIG ==================== */
let APP_CONFIG = {
  siteTitle: 'Afet Yönetimi',
  siteLogoUrl: '/afet_logo.png',
  allowedEmailDomains: [],
  pageSizeEvents: 0,
  pageSizeTypes: 0,
  pageSizeUsers: 0
};
// Config'i yükle
async function loadAppConfig() {
  try {
    const resp = await fetch('/api/config');
    if (resp.ok) {
      const config = await resp.json();
      APP_CONFIG = { ...APP_CONFIG, ...config };
      console.log('[CONFIG] Yüklendi:', APP_CONFIG);
    }
  } catch (e) {
    console.error('[CONFIG] Yüklenemedi:', e);
  }
}
function loadToken() {
  try { authToken = localStorage.getItem(AUTH_KEY) || null; } catch { authToken = null; }
}
function saveToken(t) {
  authToken = t || null;
  try {
    if (authToken) localStorage.setItem(AUTH_KEY, authToken);
    else localStorage.removeItem(AUTH_KEY);
  } catch {}
}

/* Tüm fetch çağrılarına otomatik Authorization ekle */
(function patchFetch(){
  const _fetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    const o = { ...opts };
    o.headers = { ...(opts.headers || {}) };
    if (authToken) o.headers['Authorization'] = `Bearer ${authToken}`;
    if (o.credentials == null) o.credentials = FETCH_CREDENTIALS;
    return _fetch(url, o);
  };
})();

const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* NULL-GÜVENLİ show/hide */
const show = el => { if (el && el.classList) el.classList.remove('hidden'); };
const hide = el => { if (el && el.classList) el.classList.add('hidden'); };

/* NULL-GÜVENLİ hata yardımcıları */
const setError   = (el, msg)=>{ if (!el) return; el.textContent = msg; show(el); };
const clearError = el => { if (!el) return; el.textContent=''; hide(el); };

/* ---- Toast ---- */
function ensureToastRoot(){
  let r = qs('#toast-root');
  if (!r){
    r = document.createElement('div');
    r.id = 'toast-root';
    document.body.appendChild(r);
  }
  return r;
}
function toast(message, type='success', timeout=2400){
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  const t = setTimeout(()=>{ try{ el.remove(); }catch{} }, timeout);
  el.addEventListener('click', ()=>{ clearTimeout(t); try{ el.remove(); }catch{} });
}

/* Medya (çoklu URL — backend TEXT(JSON)) */
let photoUrls = [];
let videoUrls = [];

/* === Tema === */
const THEME_KEY = 'theme';
const themeBtn = () => qs('#btn-theme-toggle');

function bulbSVG(on=true){
  const fill = on ? '#facc15' : 'none';
  const stroke = on ? '#a16207' : '#6b7280';
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6">
        <path d="M8 17a4 4 0 0 1 .94-2.6l.39-.46A6.5 6.5 0 1 1 14.67 14l.39.46A4 4 0 0 1 16 17H8Z"/>
        <rect x="8" y="17" width="8" height="2" rx="1"></rect>
        <rect x="9" y="20" width="6" height="2" rx="1"></rect>
      </g>
    </svg>`;
}

function setTheme(mode){
  const root = document.documentElement;
  if(mode === 'dark'){
    root.classList.remove('theme-light');
    root.classList.add('theme-dark');
    const b = themeBtn(); if (b) b.innerHTML = bulbSVG(false);
  }else{
    root.classList.remove('theme-dark');
    root.classList.add('theme-light');
    const b = themeBtn(); if (b) b.innerHTML = bulbSVG(true);
  }
  try{ localStorage.setItem(THEME_KEY, mode); }catch{}
}
function applySavedTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch{}
  setTheme(saved === 'dark' ? 'dark' : 'light');
}

function wireEyes(){
  qsa('.eye-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const id=btn.getAttribute('data-eye');
      const inp=qs('#'+id);
      if(!inp) return;
      inp.type = inp.type==='password' ? 'text':'password';
    };
  });
}
const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^\w\s]).{8,}$/;
function isStrongPassword(pw){ return PW_REGEX.test(String(pw||'')); }

async function applySiteConfig(){
  try{
    const r = await fetch('/api/config');
    if(!r.ok) throw 0;
    const cfg = await r.json();
    if(cfg.siteTitle){
      document.title = cfg.siteTitle;
      const st = qs('#site-title'); if (st) st.textContent = cfg.siteTitle;
    }
    const logo = qs('#site-logo'); const fav = document.getElementById('site-favicon');
    if (logo) {
      logo.onerror = ()=>hide(logo);
      if(cfg.siteLogoUrl && typeof cfg.siteLogoUrl==='string' && cfg.siteLogoUrl.trim()){
        logo.src = cfg.siteLogoUrl; show(logo);
        if (fav) fav.href = cfg.siteLogoUrl;
      } else hide(logo);
    }
    if(cfg.allowedDomains && Array.isArray(cfg.allowedDomains) && cfg.allowedDomains.length){
      const d=qs('#allowed-domain');
      if (d){ 
        d.textContent = cfg.allowedDomains.length === 1 
          ? 'Kayıt için izin verilen alan: ' + cfg.allowedDomains[0]
          : 'Kayıt için izin verilen alanlar: ' + cfg.allowedDomains.join(', ');
        show(d); 
      }
    }
  }catch{
    const st = qs('#site-title'); if (st) st.textContent = 'Uygulama';
  }
}

/* ----------------- Harita ----------------- */
const WORLD_BOUNDS = L.latLngBounds([-85, -180], [85, 180]);
const map = L.map('map', {
  zoomControl: true,
  minZoom: 2,
  maxZoom: 18,
  maxBounds: WORLD_BOUNDS,
  maxBoundsViscosity: 1.0,
  worldCopyJump: false
}).setView([39.92, 32.85], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap contributors',
  noWrap: true,
  bounds: WORLD_BOUNDS
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
let clickMarker = null;

/* Canlı konum değişkenleri */
let liveWatchId = null;
let liveMarker = null;
let liveAccuracyCircle = null;

/* Kamera/Recorder state */
let pmStream = null;
let vmStream = null;
let vmRecorder = null;
let vmChunks = [];
let vmRecording = false;

/* ---------- Özel ikonlar (şekle göre) ---------- */
function makeIcon(svg, ax=[14,40]){ return L.divIcon({ className:'', html: svg, iconSize:[28,40], iconAnchor:ax, popupAnchor:[0,-36] }); }
function pinIcon(color='#3b82f6'){
  const html = `
    <svg class="map-pin" width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path fill="${color}" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`;
  return makeIcon(html);
}

function photoCameraIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="5" width="18" height="12" rx="3" fill="${color}"/>
        <rect x="7" y="3" width="6" height="3" rx="1" fill="${color}"/>
        <circle cx="12" cy="11" r="3.2" fill="rgba(255,255,255,.9)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}
function videoCameraIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="6" width="12" height="10" rx="2" fill="${color}"/>
        <path d="M16 8l5-2v10l-5-2z" fill="${color}"/>
        <rect x="6.8" y="9.2" width="4.4" height="3.6" rx="1" fill="rgba(255,255,255,.9)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}
function playButtonIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="5" width="18" height="12" rx="3" fill="${color}"/>
        <path d="M10 9l6 3-6 3z" fill="rgba(255,255,255,.95)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}
const BLACK_PIN = ()=>pinIcon('#111');

/* Renkler: sadece benim / diğer */
const COLOR_MINE = '#10b981';
const COLOR_OTHER = '#3b82f6';

function iconForEvent(evt){
  const mine = !!evt.is_mine;
  const color = mine ? COLOR_MINE : COLOR_OTHER;
  const hasPhotos = Array.isArray(evt.photo_urls) && evt.photo_urls.length > 0;
  const hasVideos = Array.isArray(evt.video_urls) && evt.video_urls.length > 0;
  if (hasPhotos && hasVideos) return playButtonIcon(color);
  if (hasPhotos && !hasVideos) return photoCameraIcon(color);
  if (!hasPhotos && hasVideos) return videoCameraIcon(color);
  return pinIcon(color);
}

function markerFor(e){
  return L.marker([parseFloat(e.enlem), parseFloat(e.boylam)], { icon: iconForEvent(e) });
}

/* ---------- Lightbox (tam ekran) ---------- */
let __lightbox = null;
function ensureLightbox(){
  if (__lightbox) return __lightbox;
  const wrap = document.createElement('div');
  wrap.id = 'lightbox';
  wrap.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.85);
    display:none; align-items:center; justify-content:center; z-index:10000;`;
  wrap.innerHTML = `
    <div id="lb-content" style="max-width:96vw;max-height:96vh;"></div>
    <button id="lb-close" aria-label="Kapat" style="
      position:absolute; top:10px; right:12px; background:#fff; border:0;
      border-radius:8px; padding:.4rem .6rem; cursor:pointer;">Kapat</button>
  `;
  document.body.appendChild(wrap);
  const close = ()=>{ wrap.style.display='none'; const c=wrap.querySelector('#lb-content'); if (c) c.innerHTML=''; };
  wrap.addEventListener('click', (e)=>{ if (e.target===wrap) close(); });
  wrap.querySelector('#lb-close').addEventListener('click', close);
  document.addEventListener('keydown', e=>{ if (e.key==='Escape') close(); });
  __lightbox = wrap;
  return wrap;
}
function openLightboxImage(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<img src="${src}" alt="" style="max-width:96vw;max-height:96vh;display:block" />`;
  lb.style.display='flex';
}
function openLightboxVideo(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<video src="${src}" controls autoplay style="max-width:96vw;max-height:96vh;display:block;background:#000;border-radius:8px"></video>`;
  lb.style.display='flex';
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/* Tarih formatlama */
function formatDate(dateStr){
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}
/* ==================== TARİH STRING'İNİ DATE OBJESNE ÇEVİR ==================== */
function parseDateStr(dateStr) {
  try {
    // Format: "14.05.2025 13:45"
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('.');
    const [hour, minute] = (timePart || '00:00').split(':');
    return new Date(year, month - 1, day, hour, minute);
  } catch {
    return new Date(0);
  }
}

/* ==================== TARİH FİLTRE DROPDOWN ==================== */
function buildDateFilterDropdown(data, state) {
  let html = `
    <input type="text" class="filter-search" placeholder="Ara: Mayıs, 2025, 14 Mayıs 2025, 01:00..." />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${!state.filters.date || state.filters.date.length === 0 ? 'checked' : ''} />
        <span>(Tümünü Seç)</span>
      </label>
      <label class="filter-option" style="background:#e3f2fd; border-radius:4px; padding:4px 8px;">
        <input type="checkbox" class="filter-sort-newest" />
        <span>📅 En Son Eklenen Başta</span>
      </label>
      <label class="filter-option" style="background:#fff3e0; border-radius:4px; padding:4px 8px;">
        <input type="checkbox" class="filter-sort-oldest" />
        <span>📅 İlk Eklenen Başta</span>
      </label>
      <hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />
      <div id="custom-date-filters"></div>
  `;
  
  // Tüm tarihleri listele
  const valueCounts = {};
  data.forEach(item => {
    const value = formatDate(item.created_at || item.eklenme_tarihi);
    if (value && value !== '-') {
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    }
  });
  
  const sortedValues = Object.keys(valueCounts).sort((a, b) => {
    const dateA = parseDateStr(a);
    const dateB = parseDateStr(b);
    return dateB - dateA; // En yeni en üstte
  });
  
  sortedValues.forEach(value => {
    const count = valueCounts[value];
    const checked = !state.filters.date || state.filters.date.length === 0 || state.filters.date.includes(value);
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(value)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(value)} (${count})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

/* ==================== E-POSTA FİLTRE DROPDOWN ==================== */
function buildEmailFilterDropdown(data, state) {
  // Benzersiz e-postaları topla
  const uniqueEmails = new Set();
  data.forEach(item => {
    const email = item.email || '';
    if (email) uniqueEmails.add(email);
  });
  
  const sortedEmails = Array.from(uniqueEmails).sort();
  
  // E-posta domain'lerini topla
  const domainCounts = {};
  
  // 1) .env'deki domain'leri ekle (öncelikli)
  if (APP_CONFIG.allowedEmailDomains && Array.isArray(APP_CONFIG.allowedEmailDomains)) {
    APP_CONFIG.allowedEmailDomains.forEach(domain => {
      domainCounts[domain] = 0;
    });
  }
  
  // 2) Mevcut e-postalardan domain'leri say
  sortedEmails.forEach(email => {
    const match = email.match(/@(.+)$/);
    if (match) {
      const domain = match[1];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  });
  
  // Sadece sayısı 0'dan büyük olan domain'leri göster
  const sortedDomains = Object.keys(domainCounts)
    .filter(domain => domainCounts[domain] > 0)
    .sort();
  
  let html = `
    <input type="text" class="filter-search" placeholder="Ara: ortak kelime..." />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${!state.filters.email || state.filters.email.length === 0 ? 'checked' : ''} />
        <span>(Tümünü Seç)</span>
      </label>
  `;
  
  // Domain checkbox'ları ekle
  if (sortedDomains.length > 0) {
    html += '<div style="font-weight:600; font-size:0.85rem; color:var(--primary); margin:8px 0 4px 0;">📧 E-posta Domain\'leri:</div>';
    
    sortedDomains.forEach(domain => {
      const count = domainCounts[domain];
      html += `
        <label class="filter-option" style="background:#e3f2fd; border-radius:4px; padding:4px 8px; margin:2px 0;">
          <input type="checkbox" class="filter-email-domain" data-domain="${escapeHtml(domain)}" />
          <span style="font-weight:500;">@${escapeHtml(domain)} (${count})</span>
        </label>
      `;
    });
    
    html += '<hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />';
  }
  
  // Her e-postayı listele
  sortedEmails.forEach(email => {
    const checked = !state.filters.email || state.filters.email.length === 0 || state.filters.email.includes(email);
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(email)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(email)}</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}
/* ==================== ÖZEL TARİH FİLTRELERİNİ GÜNCELLE ==================== */
function updateCustomDateFilters(dropdown, query, data) {
  const container = dropdown.querySelector('#custom-date-filters');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!query) return;
  
  const q = query.toLowerCase().trim();
  const customFilters = [];
  
  // Türkçe ay isimleri
  const aylar = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 
                 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  
  // YIL TESPITI: "2025"
  const yearMatch = q.match(/\b(\d{4})\b/g);
  if (yearMatch) {
    yearMatch.forEach(year => {
      customFilters.push({ type: 'year', value: parseInt(year), label: `📅 ${year} Yılı` });
    });
  }
  
  // AY TESPITI: "mayıs"
  aylar.forEach((ay, idx) => {
    if (q.includes(ay)) {
      customFilters.push({ type: 'month', value: idx + 1, label: `📅 ${ay.charAt(0).toUpperCase() + ay.slice(1)} Ayı` });
    }
  });
  
  // GÜN TESPITI: "14"
  const dayMatch = q.match(/\b(\d{1,2})\b/g);
  if (dayMatch) {
    dayMatch.forEach(day => {
      const d = parseInt(day, 10);
      if (d >= 1 && d <= 31 && !yearMatch?.includes(day)) {
        customFilters.push({ type: 'day', value: d, label: `📅 ${d}. Gün` });
      }
    });
  }
  
  // SAAT TESPITI: "01:00"
  const timeMatch = q.match(/\b(\d{1,2}):(\d{2})\b/g);
  if (timeMatch) {
    timeMatch.forEach(time => {
      customFilters.push({ type: 'time', value: time, label: `🕐 ${time}` });
    });
  }
  
  // ARALIK TESPİTİ: "2025 den 2028 e" veya "2025'ten 2028'e" veya "2025 dan 2028 a" veya "2020 yılından 2026 yılına"
  const rangeRegex = /(\d+)\s*(?:yılından|yıldan|'ten|'den|'dan|den|dan)\s*(\d+)\s*(?:yılına|yıla|'e|'a|e|a)/gi;
  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(q)) !== null) {
    const start = rangeMatch[1];
    const end = rangeMatch[2];
    
    // Yıl aralığı
    if (start.length === 4 && end.length === 4) {
      customFilters.push({ type: 'yearRange', start: parseInt(start), end: parseInt(end), label: `📅 ${start} - ${end} Yılları Arası` });
    }
    // Gün aralığı
    else if (parseInt(start) <= 31 && parseInt(end) <= 31) {
      customFilters.push({ type: 'dayRange', start: parseInt(start), end: parseInt(end), label: `📅 ${start} - ${end}. Günler Arası` });
    }
  }
  
  // SAAT ARALIK: "01:00 dan 01:30 a"
  const timeRangeRegex = /(\d{1,2}:\d{2})\s*(?:'ten|'den|'dan|den|dan)\s*(\d{1,2}:\d{2})\s*(?:'e|'a|e|a)/gi;
  let timeRangeMatch;
  while ((timeRangeMatch = timeRangeRegex.exec(q)) !== null) {
    const startTime = timeRangeMatch[1];
    const endTime = timeRangeMatch[2];
    customFilters.push({ type: 'timeRange', start: startTime, end: endTime, label: `🕐 ${startTime} - ${endTime} Arası` });
  }
  
  // CHECKBOX'LARI OLUŞTUR
  if (customFilters.length > 0) {
    container.innerHTML = '<div style="font-weight:600; font-size:0.85rem; color:var(--primary); margin:8px 0 4px 0;">🔍 Özel Filtreler:</div>';
    
    customFilters.forEach((filter, idx) => {
      const id = `custom-filter-${idx}`;
      container.innerHTML += `
        <label class="filter-option" style="background:#f3e5f5; border-radius:4px; padding:4px 8px; margin:2px 0;">
          <input type="checkbox" class="filter-custom" data-filter='${JSON.stringify(filter)}' id="${id}" />
          <span style="font-weight:500;">${escapeHtml(filter.label)}</span>
        </label>
      `;
    });
    
    // Event'leri ekle
    setTimeout(() => {
      container.querySelectorAll('.filter-custom').forEach(cb => {
        cb.addEventListener('change', () => {
          applyCustomDateFilters('events');
        });
      });
    }, 10);
  }
}

/* ==================== ÖZEL TARİH FİLTRELERİNİ UYGULA ==================== */
function applyCustomDateFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="date"]`);
  if (!dropdown) return;
  
  const customBoxes = Array.from(dropdown.querySelectorAll('.filter-custom:checked'));
  
  if (customBoxes.length === 0) {
    // Özel filtre yoksa normal filtrelemeyi kullan
    applyFilters(tableKey);
    return;
  }
  
  // Özel filtreleri topla
  const filters = customBoxes.map(cb => JSON.parse(cb.getAttribute('data-filter')));
  
  // Veriyi filtrele
  state.filtered = state.data.filter(item => {
    const rawDate = item.created_at || item.eklenme_tarihi;
    if (!rawDate) return false;
    
    const dateObj = new Date(rawDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const time = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    
    // TÜM FİLTRELER UYUMLU OLMALI (AND mantığı)
    return filters.every(filter => {
      switch (filter.type) {
        case 'year':
          return year === filter.value;
        case 'month':
          return month === filter.value;
        case 'day':
          return day === filter.value;
        case 'time':
          return time === filter.value;
        case 'yearRange':
          return year >= filter.start && year <= filter.end;
        case 'dayRange':
          return day >= filter.start && day <= filter.end;
        case 'timeRange':
          const [startH, startM] = filter.start.split(':').map(Number);
          const [endH, endM] = filter.end.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
          return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        default:
          return true;
      }
    });
  });
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'date');
}

/* ==================== SIRALAMA FİLTRESİNİ UYGULA ==================== */
function applySortFilter(sortType) {
  const state = tableStates.events;
  
  if (!sortType) {
    // Sıralamayı kaldır - orijinal sıraya dön
    state.filtered = [...state.data];
  } else {
    state.filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || a.eklenme_tarihi || 0);
      const dateB = new Date(b.created_at || b.eklenme_tarihi || 0);
      
      if (sortType === 'newest') {
        return dateB - dateA; // En yeni başta
      } else {
        return dateA - dateB; // En eski başta
      }
    });
  }
  
  state.currentPage = 1;
  renderTable('events');
}
/* ==================== E-POSTA DOMAIN FİLTRELERİNİ UYGULA ==================== */
function applyEmailDomainFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="email"]`);
  if (!dropdown) return;
  
  const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-email-domain:checked'))
    .map(cb => cb.getAttribute('data-domain'));
  
  if (checkedDomains.length === 0) {
    // Domain filtresi yoksa normal filtrelemeyi kullan
    applyFilters(tableKey);
    return;
  }
  
  // Seçili domain'lere göre filtrele
  state.filtered = state.data.filter(item => {
    const email = item.email || '';
    return checkedDomains.some(domain => email.endsWith('@' + domain));
  });
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'email');
}
/* ==================== TABLO FİLTRELEME VE SAYFALAMA ==================== */

// Global filtreleme ve sayfalama state'leri
const tableStates = {
  types: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc'
  },
  users: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc'
  },
  events: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc'
  }
};

// Filtreleme fonksiyonu
function applyFilters(tableKey) {
  const state = tableStates[tableKey];
  if (!state) return;
  state.filtered = state.data.filter(item => {
    for (const [column, selectedValues] of Object.entries(state.filters)) {
      if (!selectedValues || selectedValues.length === 0) continue;
      
      let itemValue = '';
      
      // Kolon değerini al
      switch(tableKey) {
        case 'types':
          if (column === 'name') itemValue = item.o_adi || '';
          if (column === 'creator') itemValue = item.created_by_name || '-';
          break;
        case 'users':
          if (column === 'username') itemValue = item.username || '';
          if (column === 'role') itemValue = item.role || '';
          if (column === 'email') itemValue = item.email || '';
          if (column === 'verified') itemValue = item.email_verified ? 'Evet' : 'Hayır';
          break;
        case 'events':
          if (column === 'type') itemValue = item.olay_turu_adi || '-';
          if (column === 'creator') itemValue = item.created_by_username || '-';
          if (column === 'photo') itemValue = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? 'Var' : 'Yok';
          if (column === 'video') itemValue = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? 'Var' : 'Yok';
          if (column === 'date') itemValue = formatDate(item.created_at || item.eklenme_tarihi);
          break;
      }
      
      if (!selectedValues.includes(itemValue)) return false;
    }
    return true;
  });
  
  state.currentPage = 1; // Filtreleme sonrası ilk sayfaya dön
  renderTable(tableKey);
}
/* ==================== TARİH ARAMA YARDIMCISI ==================== */
function matchDateQuery(dateStr, query) {
  if (!dateStr || !query) return false;
  
  // Basit eşleşme
  if (dateStr.toLowerCase().includes(query)) return true;
  
  try {
    // Türkçe ay isimleri
    const aylar = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 
                   'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
    
    // Tarihi parse et (örn: "03.05.2025 14:30")
    const parts = dateStr.split(' ')[0].split('.');
    if (parts.length !== 3) return false;
    
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = aylar[monthIndex] || '';
    
    // Query parçaları
    const q = query.toLowerCase();
    
    // Sadece yıl: "2025"
    if (/^\d{4}$/.test(q) && year === q) return true;
    
    // Sadece ay: "mayıs"
    if (monthName && monthName.includes(q)) return true;
    
    // Ay + yıl: "mayıs 2025" veya "5 2025"
    if (q.includes(' ')) {
      const [p1, p2] = q.split(' ');
      if (p2 === year && (monthName.includes(p1) || month === p1)) return true;
    }
    
    // Gün + ay: "3 mayıs" veya "03 05"
    if (q.includes(' ')) {
      const [p1, p2] = q.split(' ');
      if (day === p1.padStart(2, '0') && (monthName.includes(p2) || month === p2.padStart(2, '0'))) return true;
    }
    
    // Tam tarih: "3 mayıs 2025"
    if (q.includes(' ')) {
      const qParts = q.split(' ');
      if (qParts.length === 3) {
        const [qDay, qMonth, qYear] = qParts;
        if (day === qDay.padStart(2, '0') && 
            year === qYear && 
            (monthName.includes(qMonth) || month === qMonth.padStart(2, '0'))) {
          return true;
        }
      }
    }
    
    return false;
  } catch {
    return false;
  }
}
function buildFilterDropdown(tableKey, column, data) {
  const state = tableStates[tableKey];
  
  // TARİH KOLONU İÇİN ÖZEL İŞLEM
  if (tableKey === 'events' && column === 'date') {
    return buildDateFilterDropdown(data, state);
  }
  
  // E-POSTA KOLONU İÇİN ÖZEL İŞLEM
  if (tableKey === 'users' && column === 'email') {
    return buildEmailFilterDropdown(data, state);
  }
  
// Kolondan benzersiz değerleri al
  const uniqueValues = new Set();
  data.forEach(item => {
    let value = '';
    
    switch(tableKey) {
      case 'types':
        if (column === 'name') value = item.o_adi || '';
        if (column === 'creator') value = item.created_by_name || '-';
        break;
      case 'users':
        if (column === 'username') value = item.username || '';
        if (column === 'role') value = item.role || '';
        if (column === 'email') value = item.email || '';
        if (column === 'verified') value = item.email_verified ? 'Evet' : 'Hayır';
        break;
      case 'events':
        if (column === 'type') value = item.olay_turu_adi || '-';
        if (column === 'creator') value = item.created_by_username || '-';
        if (column === 'photo') value = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? 'Var' : 'Yok';
        if (column === 'video') value = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? 'Var' : 'Yok';
        break;
    }
    
    if (value) uniqueValues.add(value);
  });
  
  // Değerleri sırala
  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    // Tarih kolonunda özel sıralama
    if (column === 'date') {
      try {
        const dateA = new Date(a.split(' ')[0].split('.').reverse().join('-'));
        const dateB = new Date(b.split(' ')[0].split('.').reverse().join('-'));
        return dateB - dateA; // En yeni en üstte
      } catch {
        return String(a).localeCompare(String(b));
      }
    }
    return String(a).localeCompare(String(b));
  });
  
// Her değerin kaç kez göründüğünü say
  const valueCounts = {};
  data.forEach(item => {
    let value = '';
    
    switch(tableKey) {
      case 'types':
        if (column === 'name') value = item.o_adi || '';
        if (column === 'creator') value = item.created_by_name || '-';
        break;
      case 'users':
        if (column === 'username') value = item.username || '';
        if (column === 'role') value = item.role || '';
        if (column === 'email') value = item.email || '';
        if (column === 'verified') value = item.email_verified ? 'Evet' : 'Hayır';
        break;
      case 'events':
        if (column === 'type') value = item.olay_turu_adi || '-';
        if (column === 'creator') value = item.created_by_username || '-';
        if (column === 'photo') value = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? 'Var' : 'Yok';
        if (column === 'video') value = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? 'Var' : 'Yok';
        break;
    }
    
    if (value) valueCounts[value] = (valueCounts[value] || 0) + 1;
  });
  
  let html = `
    <input type="text" class="filter-search" placeholder="Ara..." />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${!state.filters[column] || state.filters[column].length === 0 ? 'checked' : ''} />
        <span>(Tümünü Seç)</span>
      </label>
  `;


sortedValues.forEach(value => {
    // FİLTRELENMİŞ VERİDEN SAYIYI AL (DİNAMİK)
    let filteredCount = 0;
    state.filtered.forEach(item => {
      let itemValue = '';
      
      switch(tableKey) {
        case 'types':
          if (column === 'name') itemValue = item.o_adi || '';
          if (column === 'creator') itemValue = item.created_by_name || '-';
          break;
        case 'users':
          if (column === 'username') itemValue = item.username || '';
          if (column === 'role') itemValue = item.role || '';
          if (column === 'email') itemValue = item.email || '';
          if (column === 'verified') itemValue = item.email_verified ? 'Evet' : 'Hayır';
          break;
        case 'events':
          if (column === 'type') itemValue = item.olay_turu_adi || '-';
          if (column === 'creator') itemValue = item.created_by_username || '-';
          if (column === 'photo') itemValue = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? 'Var' : 'Yok';
          if (column === 'video') itemValue = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? 'Var' : 'Yok';
          break;
      }
      
      if (itemValue === value) filteredCount++;
    });
    
    const checked = !state.filters[column] || state.filters[column].length === 0 || state.filters[column].includes(value);
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(value)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(value)} (${filteredCount})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

// Global click handler (TEK SEFER ÇALIŞIR - çakışma önlenir)
let globalClickHandlerAttached = false;
function attachGlobalClickHandler() {
  if (globalClickHandlerAttached) return;
  globalClickHandlerAttached = true;
  
  document.addEventListener('click', (e) => {
    // Filter icon veya dropdown dışına tıklanırsa tüm dropdown'ları kapat
    if (!e.target.closest('.filter-icon') && !e.target.closest('.filter-dropdown')) {
      qsa('.filter-dropdown.show').forEach(d => d.classList.remove('show'));
    }
  });
}

function attachFilterEvents(tableKey) {
  const table = qs(`#${tableKey}-table`);
  if (!table) return;
  
  // Global click handler'ı bir kez bağla
  attachGlobalClickHandler();
  
  // Filter icon'larına tıklama
  table.querySelectorAll('.filter-icon').forEach(icon => {
    // Eski event listener'ları temizle (eğer varsa)
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
    
    newIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      const column = newIcon.getAttribute('data-column');
      const dropdown = table.querySelector(`.filter-dropdown[data-column="${column}"]`);
      
      // Diğer dropdown'ları kapat
      table.querySelectorAll('.filter-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });
      
      // Bu dropdown'ı aç/kapat
      if (dropdown) {
        const isShown = dropdown.classList.toggle('show');
        
        if (isShown) {
          // Fixed pozisyon hesapla
          const rect = newIcon.getBoundingClientRect();
          dropdown.style.top = `${rect.bottom + 4}px`;
          dropdown.style.left = `${rect.left}px`;
          
          // Dropdown içeriğini oluştur
          dropdown.innerHTML = buildFilterDropdown(tableKey, column, tableStates[tableKey].data);
          
          // Arama input'u
          const searchInput = dropdown.querySelector('.filter-search');
          searchInput?.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            // ÖZEL TARİH FİLTRELERİNİ OLUŞTUR
            if (tableKey === 'events' && column === 'date') {
              updateCustomDateFilters(dropdown, searchTerm, tableStates[tableKey].data);
            }
            
            dropdown.querySelectorAll('.filter-option').forEach((opt, idx) => {
              if (idx === 0) return; // "Tümünü Seç" seçeneğini atla
              
              // Tarih kolonu için sıralama seçeneklerini atla
              if (tableKey === 'events' && column === 'date' && (idx === 1 || idx === 2)) return;
              
              // E-posta domain seçeneklerini kontrol et
              const isDomainOption = opt.querySelector('.filter-email-domain');
              if (isDomainOption) {
                const domainText = opt.textContent.toLowerCase();
                opt.style.display = domainText.includes(searchTerm) ? 'flex' : 'none';
                return;
              }
              
              const checkbox = opt.querySelector('.filter-checkbox');
              const value = checkbox?.value || '';
              const text = opt.textContent.toLowerCase();
              
              let match = false;
              
              // ORTAK KELİME ARAMA (YouTube mantığı - tüm kolonlar için)
              if (searchTerm) {
                // TARİH KOLONU ÖZEL ARAMA
                if (tableKey === 'events' && column === 'date') {
                  match = matchDateQuery(value, searchTerm);
                } else {
                  // NORMAL KOLONLAR: Kelimelerine ayır ve hepsini ara (AND mantığı)
                  const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
                  const valueText = value.toLowerCase();
                  const displayText = text;
                  
                  if (searchWords.length === 0) {
                    match = true;
                  } else {
                    // TÜM kelimeler değerde geçmeli (AND mantığı)
                    match = searchWords.every(word => {
                      // Her kelime için ortak alt string kontrolü
                      return valueText.includes(word) || displayText.includes(word);
                    });
                  }
                }
              } else {
                match = true;
              }
              
              opt.style.display = match ? 'flex' : 'none';
            });
          });
          
          // E-POSTA DOMAIN CHECKBOX'LARI
          if (tableKey === 'users' && column === 'email') {
            dropdown.querySelectorAll('.filter-email-domain').forEach(domainBox => {
              domainBox.addEventListener('change', () => {
                applyEmailDomainFilters('users');
              });
            });
          }
          
          // SIRALAMA CHECKBOX'LARI (TARİH İÇİN)
          if (tableKey === 'events' && column === 'date') {
            const newestBox = dropdown.querySelector('.filter-sort-newest');
            const oldestBox = dropdown.querySelector('.filter-sort-oldest');
            
            newestBox?.addEventListener('change', (e) => {
              if (e.target.checked) {
                if (oldestBox) oldestBox.checked = false;
                applySortFilter('newest');
              } else {
                applySortFilter(null);
              }
            });
            
            oldestBox?.addEventListener('change', (e) => {
              if (e.target.checked) {
                if (newestBox) newestBox.checked = false;
                applySortFilter('oldest');
              } else {
                applySortFilter(null);
              }
            });
          }
          
          // "Tümünü Seç" checkbox
          const selectAll = dropdown.querySelector('.filter-select-all');
          selectAll?.addEventListener('change', (e) => {
            const checkboxes = dropdown.querySelectorAll('.filter-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            
            if (e.target.checked) {
              delete tableStates[tableKey].filters[column];
            } else {
              tableStates[tableKey].filters[column] = [];
            }
            applyFilters(tableKey);
            updateFilterIcon(tableKey, column);
          });
          
          // Bireysel checkbox'lar
          dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
              const checkedBoxes = Array.from(dropdown.querySelectorAll('.filter-checkbox:checked'));
              const allBoxes = dropdown.querySelectorAll('.filter-checkbox');
              
              if (checkedBoxes.length === 0) {
                tableStates[tableKey].filters[column] = [];
              } else if (checkedBoxes.length === allBoxes.length) {
                delete tableStates[tableKey].filters[column];
                const selectAllBox = dropdown.querySelector('.filter-select-all');
                if (selectAllBox) selectAllBox.checked = true;
              } else {
                tableStates[tableKey].filters[column] = checkedBoxes.map(cb => cb.value);
                const selectAllBox = dropdown.querySelector('.filter-select-all');
                if (selectAllBox) selectAllBox.checked = false;
              }
              
              applyFilters(tableKey);
              updateFilterIcon(tableKey, column);
            });
          });
        }
      }
    });
  });
}
// Filter icon görünümünü güncelle
function updateFilterIcon(tableKey, column) {
  const table = qs(`#${tableKey}-table`);
  if (!table) return;
  
  const icon = table.querySelector(`.filter-icon[data-column="${column}"]`);
  if (!icon) return;
  
  const hasFilter = tableStates[tableKey].filters[column] && tableStates[tableKey].filters[column].length > 0;
  if (hasFilter) {
    icon.classList.add('active');
  } else {
    icon.classList.remove('active');
  }
}

// Sayfalama kontrollerini oluştur
function renderPagination(tableKey) {
  const state = tableStates[tableKey];
  const infoEl = qs(`#${tableKey}-pagination-info`);
  const controlsEl = qs(`#${tableKey}-pagination-controls`);
  
  if (!infoEl || !controlsEl) return;
  
  const total = state.filtered.length;
  const pageSize = state.pageSize || total;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  const currentPage = Math.min(state.currentPage, totalPages);
  
// Bilgi metni - FİLTRELEME DURUMUNU GÖSTER
  const totalData = state.data.length;
  const totalFiltered = state.filtered.length;
  
  if (pageSize >= total) {
    if (totalFiltered < totalData) {
      infoEl.textContent = `Toplam ${totalData} kayıttan ${totalFiltered} kayıt gösteriliyor`;
    } else {
      infoEl.textContent = `Toplam ${total} kayıt gösteriliyor`;
    }
  } else {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    if (totalFiltered < totalData) {
      infoEl.textContent = `${start}-${end} arası gösteriliyor (Toplam ${totalData} kayıttan ${totalFiltered} kayıt)`;
    } else {
      infoEl.textContent = `${start}-${end} arası gösteriliyor (Toplam: ${total})`;
    }
  }
  
  // Sayfa kontrolleri
  if (totalPages <= 1) {
    controlsEl.innerHTML = '';
    return;
  }
  
  let html = '';
  
  // İlk sayfa ve önceki
  html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="1">‹‹</button>`;
  html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
  
  // Sayfa numaraları (max 7 tane göster)
  const maxButtons = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  
  // Sonraki ve son sayfa
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}">››</button>`;
  
  controlsEl.innerHTML = html;
  
  // Event listener'ları ekle
  controlsEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.getAttribute('data-page'), 10);
      if (page >= 1 && page <= totalPages) {
        state.currentPage = page;
        renderTable(tableKey);
      }
    });
  });
}

// Genel tablo render fonksiyonu
function renderTable(tableKey) {
  const state = tableStates[tableKey];
  
  // Sayfalanmış veriyi al
  const pageSize = state.pageSize || state.filtered.length;
  const start = (state.currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = state.filtered.slice(start, end);
  
  // İlgili render fonksiyonunu çağır
  switch(tableKey) {
    case 'types':
      renderTypeTableRows(pageData);
      break;
    case 'users':
      renderUserTableRows(pageData);
      break;
    case 'events':
      renderEventTableRows(pageData);
      break;
  }
  
  // Sayfalama kontrollerini güncelle
  renderPagination(tableKey);
  
  // Filtreleme event'lerini yeniden bağla
  attachFilterEvents(tableKey);
  
  // Filter icon'larını güncelle
  Object.keys(state.filters).forEach(column => updateFilterIcon(tableKey, column));
}

/* ==================== TABLO RENDER FONKSİYONLARI ==================== */

// Olay Türleri Tablosu
function renderTypeTableRows(data) {
  const tb = qs('#type-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  if (data.length === 0) {
    tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted);">Kayıt bulunamadı</td></tr>';
    return;
  }
  
  data.forEach(t => {
    const tr = document.createElement('tr');
    
    const canDelete = currentUser && (
      currentUser.role === 'admin' || 
      (currentUser.role === 'supervisor' && 
       (t.created_by_id === currentUser.id || t.created_by_name === currentUser.username))
    );
    
    const canUpdate = currentUser && (
      currentUser.role === 'admin' || 
      (currentUser.role === 'supervisor' && 
       (t.created_by_id === currentUser.id || t.created_by_name === currentUser.username))
    );
    
    const updateBtn = canUpdate 
      ? `<button class="btn ghost" data-update-type="${t.o_id}" data-type-name="${escapeHtml(t.o_adi)}" style="margin-right:4px;">Güncelle</button>`
      : `<button class="btn ghost" disabled title="Yetkiniz yok" style="margin-right:4px;">Güncelle</button>`;
    
    const deleteBtn = canDelete 
      ? `<button class="btn danger" data-del-type="${t.o_id}">Sil</button>`
      : `<button class="btn danger" disabled title="Yetkiniz yok">Sil</button>`;
    
    tr.innerHTML = `
      <td>${escapeHtml(t.o_adi)}</td>
      <td>${escapeHtml(t.created_by_name || '-')}</td>
      <td>${updateBtn}${deleteBtn}</td>
    `;
    tb.appendChild(tr);
  });
  
  // Silme butonlarına event ekle
  qsa('[data-del-type]:not([disabled])').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Bu tür ve bağlı olaylar silinsin mi?')) return;
      b.disabled = true;
      try { 
        const resp = await fetch('/api/admin/olaylar/' + b.getAttribute('data-del-type'), {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          toast('Silme başarısız: ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast('Olay türü silindi', 'success');
        }
      } catch(e) {
        toast('Silme hatası: ' + e.message, 'error');
      }
      await Promise.all([loadOlayTypes(), loadExistingEvents(), refreshAdminEvents()]);
      b.disabled = false;
    };
  });
  
  // Güncelleme butonlarına event ekle
  qsa('[data-update-type]:not([disabled])').forEach(b => {
    b.onclick = () => {
      const typeId = b.getAttribute('data-update-type');
      const currentName = b.getAttribute('data-type-name');
      openUpdateTypeModal(typeId, currentName);
    };
  });
}

/* ==================== OLAY TÜRÜ GÜNCELLEME MODALI ==================== */
function openUpdateTypeModal(typeId, currentName) {
  const modal = qs('#update-type-modal');
  const input = qs('#update-type-input');
  const saveBtn = qs('#update-type-save-btn');
  const cancelBtn = qs('#update-type-cancel-btn');
  
  if (!modal || !input || !saveBtn || !cancelBtn) {
    console.error('Güncelleme modal elemanları bulunamadı');
    return;
  }
  
  input.value = currentName;
  showModal(modal);
  
  // Önceki event'leri temizle
  const newSaveBtn = saveBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  
  // Kaydet butonu
  newSaveBtn.onclick = async () => {
    const newName = input.value.trim();
    
    if (!newName) {
      toast('Olay türü adı boş olamaz', 'error');
      return;
    }
    
    if (newName === currentName) {
      toast('Değişiklik yapılmadı', 'error');
      closeModal(modal);
      return;
    }
    
    newSaveBtn.disabled = true;
    try {
      const resp = await fetch('/api/admin/olaylar/' + typeId, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({o_adi: newName})
      });
      const data = await resp.json().catch(() => ({}));
      
      if (!resp.ok) {
        toast('Güncelleme başarısız: ' + (data.message || data.error || resp.status), 'error');
      } else {
        toast('Olay türü güncellendi', 'success');
        closeModal(modal);
      }
    } catch(e) {
      toast('Güncelleme hatası: ' + e.message, 'error');
    } finally {
      newSaveBtn.disabled = false;
    }
    
    await Promise.all([loadOlayTypes(), loadExistingEvents(), refreshAdminEvents()]);
  };
  
  // İptal butonu
  newCancelBtn.onclick = () => {
    closeModal(modal);
  };
}

// Kullanıcılar Tablosu
function renderUserTableRows(data) {
  const tb = qs('#user-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  if (data.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">Kayıt bulunamadı</td></tr>';
    return;
  }
  
  data.forEach(u => {
    const tr = document.createElement('tr');
    
    let canDelete = false;
    if (currentUser) {
      if (currentUser.role === 'admin') {
        canDelete = true;
      } else if (currentUser.role === 'supervisor') {
        const isSelf = u.id === currentUser.id;
        canDelete = isSelf || u.role === 'user';
      }
    }
    
    const deleteBtn = canDelete
      ? `<button class="btn danger" data-del-user="${u.id}">Sil</button>`
      : `<button class="btn danger" disabled title="Yetkiniz yok">Sil</button>`;
    
    tr.innerHTML = `
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.email || '')}</td>
      <td>${u.email_verified ? 'Evet' : 'Hayır'}</td>
      <td>${deleteBtn}</td>
    `;
    tb.appendChild(tr);
  });
  
  // Silme butonlarına event ekle
  qsa('[data-del-user]:not([disabled])').forEach(b => {
    b.onclick = async () => {
      const id = b.getAttribute('data-del-user');
      const isSelf = currentUser && String(currentUser.id) === String(id);
      const confirmMsg = isSelf ? 'Kendi hesabınızı silmek istediğinize emin misiniz?' : 'Kullanıcı silinsin mi?';
      
      if (!confirm(confirmMsg)) return;
      b.disabled = true;
      try {
        const resp = await fetch('/api/admin/users/' + id, {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        
        if (!resp.ok) {
          toast('Silme başarısız: ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast('Kullanıcı silindi', 'success');
        }
        
        if (resp.headers.get('X-Logged-Out') === '1' || isSelf) {
          alert('Hesabınız pasifleştirildi. Giriş ekranına yönlendiriliyorsunuz.');
          await logout(); 
          location.reload(); 
          return;
        }
      } catch(e) {
        toast('Silme hatası: ' + e.message, 'error');
      }
      await Promise.all([
        refreshAdminUsers(),
        loadExistingEvents(),
        refreshAdminEvents(),
        loadOlayTypes()
      ]);
      b.disabled = false;
    };
  });
}
/* ==================== TARİH FORMATLAMA ==================== */
function formatDate(dateInput) {
  if (!dateInput) return '-';
  
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return '-';
  }
}
// Olaylar Tablosu
function renderEventTableRows(data) {
  const tb = qs('#event-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  if (data.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Kayıt bulunamadı</td></tr>';
    return;
  }
  
  data.forEach(o => {
    const creatorName = o.created_by_username ?? '';
    const creatorId = (o.created_by_id != null) ? String(o.created_by_id) : '-';
    const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';
    
    const hasPhoto = Array.isArray(o.photo_urls) && o.photo_urls.length > 0 ? 'Var' : 'Yok';
    const hasVideo = Array.isArray(o.video_urls) && o.video_urls.length > 0 ? 'Var' : 'Yok';
    
    // TARİH FORMATLA
    const rawDate = o.created_at || o.eklenme_tarihi || null;
    const dateStr = rawDate ? formatDate(rawDate) : '-';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.olay_turu_adi ? escapeHtml(o.olay_turu_adi) : '-'}</td>
      <td><div class="td-desc">${o.aciklama ? escapeHtml(o.aciklama) : ''}</div></td>
      <td>${escapeHtml(who)}</td>
      <td>${hasPhoto}</td>
      <td>${hasVideo}</td>
      <td>${dateStr}</td>
      <td><button class="btn danger" data-del-olay="${o.olay_id}">Sil</button></td>
    `;
    tb.appendChild(tr);
  });
  
  // Silme butonlarına event ekle
  qsa('[data-del-olay]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Olay silinsin mi?')) return;
      b.disabled = true;
      try {
        const id = b.getAttribute('data-del-olay');
        const url = (currentUser && currentUser.role === 'user') ? '/api/olay/' + id : '/api/admin/olay/' + id;
        const resp = await fetch(url, {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        
        if (!resp.ok) {
          toast('Silme başarısız: ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast('Olay silindi', 'success');
        }
      } catch(e) {
        toast('Silme hatası: ' + e.message, 'error');
      }
      await Promise.all([loadExistingEvents(), refreshAdminEvents()]);
      b.disabled = false;
    };
  });
}

/* ==================== VERİ YÜKLEME FONKSİYONLARI ==================== */

async function loadOlayTypes(){
  const sel = qs('#olay_turu');
  try {
    const r = await fetch('/api/olaylar');
    if (!r.ok) throw 0;
    const list = await r.json();
    
    // Select dropdown'u doldur
    if (sel) {
      sel.innerHTML = '<option value="">-- Seçiniz --</option>';
      list.forEach(o => {
        const opt = document.createElement('option');
        opt.value = String(o.o_id);
        opt.textContent = o.o_adi;
        sel.appendChild(opt);
      });
    }
    
    // Tablo state'ini güncelle
    tableStates.types.data = list;
    tableStates.types.filtered = [...list];
    tableStates.types.currentPage = 1;
    
    // Tabloyu render et
    renderTable('types');
  } catch(e) { 
    setError(qs('#error-message'), 'Olay türleri yüklenemedi.'); 
  }
}

async function refreshAdminUsers(){
  try {
    const r = await fetch('/api/admin/users');
    if (!r.ok) throw 0;
    const list = await r.json();
    
    // Sadece aktif kullanıcıları göster
    const activeUsers = list.filter(u => u.is_active !== false);
    
    // Tablo state'ini güncelle
    tableStates.users.data = activeUsers;
    tableStates.users.filtered = [...activeUsers];
    tableStates.users.currentPage = 1;
    
    // Tabloyu render et
    renderTable('users');
  } catch(e) {
    console.error('refreshAdminUsers error:', e);
  }
}

async function refreshAdminEvents(){
  try {
    const r = await fetch('/api/olaylar_tum');
    if (!r.ok) throw 0;
    const list = await r.json();
    
    // Aktif olayları al ve tarihe göre sırala (en yeni en başta)
    const activeEvents = list
      .filter(o => o.active !== false)
      .sort((a, b) => {
        const dateA = new Date(a.created_at || a.eklenme_tarihi || 0);
        const dateB = new Date(b.created_at || b.eklenme_tarihi || 0);
        return dateB - dateA; // Descending (en yeni en üstte)
      });
    
    // Tablo state'ini güncelle
    tableStates.events.data = activeEvents;
    tableStates.events.filtered = [...activeEvents];
    tableStates.events.currentPage = 1;
    
    // Tabloyu render et
    renderTable('events');
  } catch(e) {
    console.error('refreshAdminEvents error:', e);
  }
}

/* ==================== TAB NAVİGASYONU ==================== */

function initTabs() {
  const tabBtns = qsa('.tab-btn');
  const tabContents = qsa('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Tüm tab'ları pasif yap
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Seçili tab'ı aktif yap
      btn.classList.add('active');
      const targetContent = qs(`#${targetTab}`);
      if (targetContent) targetContent.classList.add('active');
      
      // İlgili tabloyu yenile
      const tableKey = targetTab.replace('-tab', '');
      if (tableStates[tableKey]) {
        renderTable(tableKey);
      }
    });
  });
}

/* ==================== SAYFA BOYUTU AYARLARI ==================== */

async function loadPageSizeSettings() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw 0;
    const cfg = await r.json();
    
    // Sayfa boyutlarını ayarla (0 veya null ise sınırsız)
    tableStates.events.pageSize = cfg.pageSizeEvents > 0 ? cfg.pageSizeEvents : null;
    tableStates.types.pageSize = cfg.pageSizeTypes > 0 ? cfg.pageSizeTypes : null;
    tableStates.users.pageSize = cfg.pageSizeUsers > 0 ? cfg.pageSizeUsers : null;
  } catch(e) {
    console.warn('Sayfa boyutu ayarları yüklenemedi, varsayılan değerler kullanılıyor');
    // Varsayılan değerler (hepsi sınırsız)
    tableStates.events.pageSize = null;
    tableStates.types.pageSize = null;
    tableStates.users.pageSize = null;
  }
}

/* ==================== OLAY TÜRÜ EKLEME ==================== */
qs('#btn-add-type')?.addEventListener('click', async () => {
  const name = qs('#new-type-name')?.value.trim();
  if (!name) { 
    toast('Lütfen tür adı girin', 'error'); 
    return; 
  }
  
  const btn = qs('#btn-add-type');
  if (btn) btn.disabled = true;
  
  try {
    const r = await fetch('/api/admin/olaylar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({o_adi: name})
    });
    const data = await r.json().catch(() => ({}));
    
    if (!r.ok) {
      const errorMsg = data.message || data.error || 'Bilinmeyen hata';
      
      // Duplicate kontrolü
      if (r.status === 409 || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('zaten')) {
        toast('Aynı ad ile olay türü ekleyemezsiniz (Aktif veya pasif bir kayıt mevcut)', 'error', 4000);
      } else {
        toast('Olay türü eklenemedi: ' + errorMsg, 'error');
      }
      throw new Error(errorMsg);
    }
    
    const nt = qs('#new-type-name'); 
    if (nt) nt.value = '';
    await loadOlayTypes();
    toast('Yeni olay türü eklendi', 'success');
  } catch(e) {
    console.error('Tür ekleme hatası:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
});



/* ==================== HARITA VE OLAY YÖNETİMİ ==================== */

// Harita tıklama
map.on('click', e => {
  const { lat, lng } = e.latlng;
  const latEl = qs('#lat'); 
  const lngEl = qs('#lng');
  if (latEl) latEl.value = lat.toString();
  if (lngEl) lngEl.value = lng.toString();
  if (clickMarker) { 
    clickMarker.setLatLng(e.latlng); 
  } else { 
    clickMarker = L.marker([lat,lng], { icon: BLACK_PIN() }).addTo(map).bindPopup('Seçili konum'); 
  }
});

function updateClickMarkerFromInputs(){
  const latEl = qs('#lat'); 
  const lngEl = qs('#lng');
  if (!latEl || !lngEl) return;
  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const ll = L.latLng(lat, lng);
  if (clickMarker) clickMarker.setLatLng(ll);
  else clickMarker = L.marker(ll, { icon: BLACK_PIN() }).addTo(map).bindPopup('Seçili konum');
}

['#lat','#lng'].forEach(id => qs(id)?.addEventListener('input', updateClickMarkerFromInputs));

// DB medyası populate
async function populateEventMedia(container, evt){
  try {
    const photoBox = container.querySelector(`[data-ph="${evt.olay_id}"]`);
    const videoBox = container.querySelector(`[data-vd="${evt.olay_id}"]`);

    // Fotoğraflar
    if (photoBox) {
      const arr = Array.isArray(evt.photo_urls) ? evt.photo_urls : [];
      if (arr.length) {
        const tiles = arr.map(u => {
          const src = normalizeUploadUrl(u);
          return `
            <a href="#" class="popup-photo-link" data-src="${src}" title="Foto">
              <img src="${src}" alt="foto" loading="lazy" style="width:100%;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
            </a>`;
        }).join('');
        photoBox.innerHTML = `<div class="grid grid-2" style="gap:6px">${tiles}</div>`;
        photoBox.querySelectorAll('.popup-photo-link').forEach(a => {
          a.addEventListener('click', (e) => { 
            e.preventDefault(); 
            openLightboxImage(a.dataset.src); 
          });
        });
      } else {
        photoBox.innerHTML = '<div class="muted">Fotoğraf yok.</div>';
      }
    }

    // Videolar
    if (videoBox) {
      const arr = Array.isArray(evt.video_urls) ? evt.video_urls : [];
      if (arr.length) {
        const tiles = arr.map(u => {
          const src = normalizeUploadUrl(u);
          return `
            <a href="#" class="popup-video-link" data-src="${src}" title="Video">
              <video src="${src}" muted style="width:100%;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"></video>
            </a>`;
        }).join('');
        videoBox.innerHTML = `<div class="grid grid-1" style="gap:6px">${tiles}</div>`;
        videoBox.querySelectorAll('.popup-video-link').forEach(a => {
          a.addEventListener('click', (e) => { 
            e.preventDefault(); 
            openLightboxVideo(a.dataset.src); 
          });
        });
      } else {
        videoBox.innerHTML = '<div class="muted">Video yok.</div>';
      }
    }
  } catch(err) {
    console.error('populateEventMedia error:', err);
  }
}

function normalizeUploadUrl(u){
  if (!u) return null;
  const s = String(u);
  return s.startsWith('/uploads/') ? s : `/uploads/${s.replace(/^uploads\//, '')}`;
}

// Mevcut olayları yükle
async function loadExistingEvents(){
  try {
    const resp = await fetch('/api/olaylar_tum');
    if (!resp.ok) throw 0;
    const events = await resp.json();
    eventIndex.clear();
    markersLayer.clearLayers();

    events.forEach(evt => {
      eventIndex.set(evt.olay_id, evt);
      const lat = parseFloat(evt.enlem), lng = parseFloat(evt.boylam);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const m = markerFor(evt).addTo(markersLayer);
      const mine = !!evt.is_mine;

      const turHtml = evt.olay_turu_adi ? `<b>Tür:</b> ${escapeHtml(evt.olay_turu_adi)}<br>` : '';
      const creatorName = evt.created_by_username ?? '';
      const creatorId = (evt.created_by_id != null) ? String(evt.created_by_id) : '-';
      const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';

      const mediaHtml = `
        <div><b>Fotoğraf:</b></div>
        <div class="popup-photos"><div data-ph="${evt.olay_id}"></div></div>
        <div style="height:6px"></div>
        <div><b>Video:</b></div>
        <div class="popup-videos"><div data-vd="${evt.olay_id}"></div></div>
      `;

      const content = document.createElement('div');
      content.innerHTML = `
        <div style="margin-bottom:6px;">
          <b>Olay ID:</b> ${evt.olay_id}
          <span class="badge ${mine ? 'mine' : 'other'}" style="margin-left:6px;">${mine ? 'Benim' : 'Diğer'}</span>
        </div>
        ${turHtml}
        <div class="popup-body"><b>Açıklama:</b> ${evt.aciklama ? escapeHtml(evt.aciklama) : ''}</div>
        ${mediaHtml}
        <div class="popup-meta"><b>Ekleyen:</b> ${escapeHtml(who)}</div>
        <div class="inline" style="gap:6px; margin-top:8px;"></div>
      `;
      const btnRow = content.querySelector('.inline');

      const canEdit = (currentUser && (currentUser.role === 'admin' || (currentUser.role === 'user' && mine)));
      if (canEdit) {
        const eb = document.createElement('button');
        eb.className = 'btn ghost'; 
        eb.textContent = 'Güncelle';
        eb.onclick = () => beginEdit(evt);
        btnRow.appendChild(eb);
      }

      const canDelete = currentUser && (
        (currentUser.role === 'user' && mine) ||
        (currentUser.role === 'supervisor') ||
        (currentUser.role === 'admin')
      );
      if (canDelete) {
        const db = document.createElement('button');
        db.className = 'btn danger'; 
        db.textContent = 'Sil';
        db.onclick = async () => {
          if (!confirm('Olay silinsin mi?')) return;
          db.disabled = true;
          try {
            const url = (currentUser.role === 'user') ? `/api/olay/${evt.olay_id}` : `/api/admin/olay/${evt.olay_id}`;
            await fetch(url, {method:'DELETE'});
            await Promise.all([loadExistingEvents(), refreshAdminEvents()]);
          } catch(err) {
            console.error('delete event error:', err);
          } finally { 
            db.disabled = false; 
          }
        };
        btnRow.appendChild(db);
      }

      m.bindPopup(content);
      m.on('popupopen', () => populateEventMedia(content, evt));
    });
  } catch(err) {
    console.error('loadExistingEvents error:', err);
  }
}

/* ==================== OLAY FORMU ==================== */

function beginEdit(evt){
  editingEventId = evt.olay_id;
  const sel = qs('#olay_turu'); 
  const ac = qs('#aciklama'); 
  const lat = qs('#lat'); 
  const lng = qs('#lng');
  if (sel) sel.value = evt.olay_turu_id ? String(evt.olay_turu_id) : '';
  if (ac)  ac.value  = evt.aciklama || '';
  if (lat) lat.value = String(Number(evt.enlem));
  if (lng) lng.value = String(Number(evt.boylam));

  photoUrls = Array.isArray(evt.photo_urls) ? evt.photo_urls.map(normalizeUploadUrl) : [];
  videoUrls = Array.isArray(evt.video_urls) ? evt.video_urls.map(normalizeUploadUrl) : [];

  renderMediaLists();
  updateClickMarkerFromInputs();
  const eid = qs('#edit-id'); 
  if (eid) eid.textContent = '#' + evt.olay_id;
  show(qs('#edit-hint')); 
  show(qs('#cancel-edit-btn'));
  qs('#olay-card')?.scrollIntoView({behavior:'smooth', block:'start'});
}

function resetEdit(){
  editingEventId = null;
  hide(qs('#edit-hint')); 
  hide(qs('#cancel-edit-btn')); 
  const eid = qs('#edit-id'); 
  if (eid) eid.textContent = '';
  const ac = qs('#aciklama'); 
  const lat = qs('#lat'); 
  const lng = qs('#lng'); 
  const sel = qs('#olay_turu');
  if (ac) ac.value = ''; 
  if (lat) lat.value = ''; 
  if (lng) lng.value = '';
  if (sel) sel.value = '';
  photoUrls = []; 
  videoUrls = []; 
  renderMediaLists();
  if (clickMarker){ 
    map.removeLayer(clickMarker); 
    clickMarker = null; 
  }
  stopLiveLocation();
}

async function submitOlay(){
  const errEl = qs('#error-message'); 
  clearError(errEl);
  const sel = qs('#olay_turu'); 
  const ac = qs('#aciklama'); 
  const lat = qs('#lat'); 
  const lng = qs('#lng');
  const payload = {
    olay_turu: sel && sel.value ? parseInt(sel.value, 10) : null,
    aciklama : ac ? ac.value.trim() : '',
    enlem    : lat ? parseFloat(lat.value) : NaN,
    boylam   : lng ? parseFloat(lng.value) : NaN,
    photo_urls: Array.isArray(photoUrls) ? photoUrls : (photoUrls ? [photoUrls] : []),
    video_urls: Array.isArray(videoUrls) ? videoUrls : (videoUrls ? [videoUrls] : []),
  };

  if (!Number.isFinite(payload.enlem) || !Number.isFinite(payload.boylam)) 
    return setError(errEl, 'Lütfen konum girin.');
  if (!payload.olay_turu) 
    return setError(errEl, 'Lütfen bir olay türü seçin.');

  const btn = qs('#submit-btn'); 
  if (btn) btn.disabled = true;
  try {
    let r, d;
    if (editingEventId) {
      r = await fetch(`/api/olay/${editingEventId}`, { 
        method:'PATCH', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(payload) 
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || r.status);
      alert('Olay güncellendi (#' + editingEventId + ')');
    } else {
      r = await fetch('/api/submit_olay', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(payload) 
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || r.status);
      alert('Olay eklendi (#' + d.olay_id + ')');
    }
    
    photoUrls = []; 
    videoUrls = [];
    renderMediaLists();

    stopLiveLocation();
    resetEdit();
    await loadExistingEvents();
    await refreshAdminEvents();
  } catch(e) { 
    setError(errEl, 'İşlem hatası: ' + e.message); 
  } finally { 
    if (btn) btn.disabled = false; 
  }
}

qs('#submit-btn')?.addEventListener('click', submitOlay);
qs('#cancel-edit-btn')?.addEventListener('click', resetEdit);

/* ==================== KONUM YÖNETİMİ ==================== */

function setLocateUI(running){
  const btnUse = qs('#btn-use-location');
  const btnStop = qs('#btn-stop-live');
  if (btnUse){
    btnUse.textContent = running ? 'Konumu İptal Et' : 'Konumumu kullan';
    btnUse.classList?.toggle('danger', running);
  }
  if (btnStop){ 
    btnStop.style.display = running ? '' : 'none'; 
  }
}

function geoFindMeToggle(){
  if (liveWatchId !== null){ 
    stopLiveLocation(); 
    return; 
  }
  geoFindMeStart();
}

function geoFindMeStart() {
  if (!("geolocation" in navigator)) return;
  setLocateUI(true);
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latEl = qs('#lat'); 
      const lngEl = qs('#lng');
      if (latEl) latEl.value = String(latitude);
      if (lngEl) lngEl.value = String(longitude);
      const ll = L.latLng(latitude, longitude);
      if (liveMarker) liveMarker.setLatLng(ll);
      else liveMarker = L.marker(ll, { icon: BLACK_PIN() }).addTo(map).bindPopup('Konumum');
      map.setView(ll, Math.max(map.getZoom(), 17), { animate:true });
      startLiveLocation();
    },
    () => { setLocateUI(false); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

function startLiveLocation(){
  if (!("geolocation" in navigator)) return;
  if (liveWatchId !== null) return;
  liveWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const latEl = qs('#lat'); 
      const lngEl = qs('#lng');
      if (latEl) latEl.value = String(latitude);
      if (lngEl) lngEl.value = String(longitude);
      const ll = L.latLng(latitude, longitude);
      if (liveMarker) liveMarker.setLatLng(ll);
      else liveMarker = L.marker(ll, {icon: BLACK_PIN()}).addTo(map).bindPopup('Konumum');
      if (Number.isFinite(accuracy)) {
        if (liveAccuracyCircle) liveAccuracyCircle.setLatLng(ll).setRadius(accuracy);
        else liveAccuracyCircle = L.circle(ll, {radius:accuracy, color:'#3b82f6', weight:1, opacity:.6, fillColor:'#3b82f6', fillOpacity:.18}).addTo(map);
      }
    },
    () => { stopLiveLocation(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
  setLocateUI(true);
}

function stopLiveLocation(){
  if (liveWatchId !== null) {
    try { navigator.geolocation.clearWatch(liveWatchId); } catch {}
    liveWatchId = null;
  }
  if (liveMarker) { 
    try { map.removeLayer(liveMarker); } catch {} 
    liveMarker = null; 
  }
  if (liveAccuracyCircle) { 
    try { map.removeLayer(liveAccuracyCircle); } catch {} 
    liveAccuracyCircle = null; 
  }
  setLocateUI(false);
}

qs('#btn-use-location')?.addEventListener('click', geoFindMeToggle);
qs('#btn-stop-live')?.addEventListener('click', stopLiveLocation);

/* ==================== MEDYA YÜKLEME ==================== */

function renderMediaLists(){
  const ph = qs('#photo-list'); 
  const vd = qs('#video-list');

  if (ph){
    if (photoUrls.length) {
      ph.innerHTML = `<div class="grid grid-3" style="gap:8px">${photoUrls.map((u, idx) => (
        `<a href="${u}" class="thumb-tile" title="Foto ${idx+1}" data-open-full="img">
          <img src="${u}" alt="foto" loading="lazy" />
        </a>`
      )).join('')}</div>`;
    } else {
      ph.innerHTML = '<div class="muted">Fotoğraf eklenmedi.</div>';
    }
  }

  if (vd){
    if (videoUrls.length) {
      vd.innerHTML = `<div class="grid grid-2" style="gap:8px">${videoUrls.map((u, idx) => (
        `<a href="${u}" class="thumb-tile" title="Video ${idx+1}" data-open-full="video">
          <video src="${u}" muted></video>
        </a>`
      )).join('')}</div>`;
    } else {
      vd.innerHTML = '<div class="muted">Video eklenmedi.</div>';
    }
  }

  qsa('#photo-list a[data-open-full="img"]').forEach(a => {
    a.addEventListener('click', (e) => { 
      e.preventDefault(); 
      openLightboxImage(a.getAttribute('href')); 
    });
  });
  qsa('#video-list a[data-open-full="video"]').forEach(a => {
    a.addEventListener('click', (e) => { 
      e.preventDefault(); 
      openLightboxVideo(a.getAttribute('href')); 
    });
  });
}

function readAsDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('okuma hatası'));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

async function uploadDataUrl(endpoint, dataUrl){
  const r = await fetch(endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dataUrl })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || d.message || r.status);
  const url = (typeof d.url === 'string' && d.url) ? d.url
            : (Array.isArray(d.urls) && d.urls[0]) ? d.urls[0]
            : null;
  if (!url) throw new Error('geçersiz_yanıt');
  return normalizeUploadUrl(url);
}

async function handleSelectPhoto(file){
  try {
    const dataUrl = await readAsDataURL(file);
    const url = await uploadDataUrl('/api/upload/photo', dataUrl);
    photoUrls = Array.from(new Set([...(photoUrls || []), url]));
    renderMediaLists();
  } catch(e) { 
    alert('Foto yüklenemedi: ' + e.message); 
  }
}

async function handleSelectVideo(file){
  try {
    const dataUrl = await readAsDataURL(file);
    const url = await uploadDataUrl('/api/upload/video', dataUrl);
    videoUrls = Array.from(new Set([...(videoUrls || []), url]));
    renderMediaLists();
  } catch(e) { 
    alert('Video yüklenemedi: ' + e.message); 
  }
}

qs('#btn-add-photo')?.addEventListener('click', openPhotoModal);
qs('#btn-add-video')?.addEventListener('click', openVideoModal);
qs('#file-photo')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; 
  if (f) handleSelectPhoto(f); 
  e.target.value = '';
});
qs('#file-video')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; 
  if (f) handleSelectVideo(f); 
  e.target.value = '';
});

/* --------- FOTO KAMERA MODALI --------- */
function stopPmStream(){
  try { pmStream?.getTracks().forEach(t => t.stop()); } catch {}
  pmStream = null;
}

async function openPhotoModal(){
  const modal = qs('#photo-modal'); 
  const v = qs('#pm-video'); 
  const c = qs('#pm-canvas');
  const captureBtn = qs('#pm-capture'); 
  const useBtn = qs('#pm-use'); 
  const retakeBtn = qs('#pm-retake');
  const galleryBtn = qs('#pm-gallery'); 
  const closeBtn = qs('#pm-close');
  showModal(modal);

  try {
    pmStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (v) { 
      v.srcObject = pmStream; 
      v.muted = true; 
      v.playsInline = true; 
      v.play?.(); 
    }
  } catch {
    alert('Kamera izni reddedildi veya bulunamadı. Galeriden seçebilirsiniz.');
  }

  function resetShot(){
    hide(c); 
    show(v);
    hide(useBtn); 
    hide(retakeBtn); 
    show(captureBtn);
  }
  resetShot();

  if (captureBtn) captureBtn.onclick = () => {
    if (!pmStream){ 
      alert('Kamera açılmadı.'); 
      return; 
    }
    const trackSettings = pmStream.getVideoTracks()[0]?.getSettings?.() || {};
    const w = trackSettings.width || (v?.videoWidth) || 1280;
    const h = trackSettings.height || (v?.videoHeight) || 720;
    if (!c) return;
    c.width = w; 
    c.height = h;
    const ctx = c.getContext('2d');
    if (v) ctx.drawImage(v, 0, 0, w, h);
    hide(v); 
    show(c);
    hide(captureBtn); 
    show(useBtn); 
    show(retakeBtn);
  };

  if (retakeBtn) retakeBtn.onclick = resetShot;

  if (useBtn) useBtn.onclick = async () => {
    try {
      if (!c) return;
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      const url = await uploadDataUrl('/api/upload/photo', dataUrl);
      photoUrls = Array.from(new Set([...(photoUrls || []), url]));
      renderMediaLists();
      closeModal(modal, stopPmStream);
    } catch(e) { 
      alert('Yükleme hatası: ' + e.message); 
    }
  };

  if (galleryBtn) galleryBtn.onclick = () => qs('#file-photo')?.click();
  if (closeBtn) closeBtn.onclick = () => closeModal(modal, stopPmStream);
}

/* --------- VİDEO KAMERA MODALI --------- */
function stopVm(){
  try { vmRecorder?.stop(); } catch {}
  try { vmStream?.getTracks().forEach(t => t.stop()); } catch {}
  vmStream = null; 
  vmRecorder = null; 
  vmChunks = []; 
  vmRecording = false;
}

function pickBestMime(){
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4'
  ];
  if (!('MediaRecorder' in window)) return null;
  for (const t of candidates){
    try { 
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; 
    } catch {}
  }
  return undefined;
}

async function openVideoModal(){
  const modal = qs('#video-modal'); 
  const pv = qs('#vm-preview');
  const startBtn = qs('#vm-start'); 
  const stopBtn = qs('#vm-stop'); 
  const closeBtn = qs('#vm-close');
  showModal(modal);

  if (startBtn) show(startBtn);
  if (stopBtn)  hide(stopBtn);

  if (!('MediaRecorder' in window)){
    alert('Cihaz video kaydı desteklemiyor. Galeriden video seçin.');
    closeModal(modal, stopVm);
    qs('#file-video')?.click();
    return;
  }

  try {
    vmStream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'}, audio:true });
    if (pv){ 
      pv.srcObject = vmStream; 
      pv.muted = true; 
      pv.playsInline = true; 
      pv.play?.(); 
    }
  } catch {
    alert('Kamera/mikrofon izni reddedildi veya bulunamadı. Galeriden video seçebilirsiniz.');
    closeModal(modal, stopVm);
    qs('#file-video')?.click();
    return;
  }

  if (startBtn) startBtn.onclick = () => {
    if (!vmStream){ 
      alert('Kamera/mikrofon açılmadı.'); 
      return; 
    }
    vmChunks = [];
    const mime = pickBestMime();
    try {
      vmRecorder = new MediaRecorder(vmStream, mime ? { mimeType: mime } : undefined);
    } catch(e) {
      alert('Kayıt başlatılamadı: ' + e.message);
      return;
    }
    vmRecorder.ondataavailable = e => { 
      if (e.data && e.data.size) vmChunks.push(e.data); 
    };
    vmRecorder.onerror = (e) => { 
      console.error('Recorder error', e); 
      toast('Video kaydında hata', 'error'); 
    };
    vmRecorder.onstop = async () => {
      try {
        if (!vmChunks.length){ 
          toast('Kayıt oluşmadı, tekrar deneyin', 'error'); 
          show(startBtn); 
          hide(stopBtn); 
          return; 
        }
        const blob = new Blob(vmChunks, { type: vmRecorder.mimeType || 'video/webm' });
        const dataUrl = await blobToDataUrl(blob);
        const url = await uploadDataUrl('/api/upload/video', dataUrl);
        videoUrls = Array.from(new Set([...(videoUrls || []), url]));
        renderMediaLists();
        closeModal(modal, stopVm);
        toast('Video eklendi', 'success');
      } catch(e) { 
        alert('Video yükleme hatası: ' + e.message); 
      }
    };
    vmRecorder.start(250);
    vmRecording = true;
    hide(startBtn); 
    show(stopBtn);
  };

  if (stopBtn) stopBtn.onclick = () => {
    try {
      if (vmRecorder && vmRecording){
        vmRecorder.requestData?.();
        vmRecorder.stop();
        vmRecording = false;
      }
    } catch {}
    hide(stopBtn);
  };

  if (closeBtn) closeBtn.onclick = () => closeModal(modal, stopVm);
}

function showModal(m){ 
  if (!m) return; 
  m.classList.add('show'); 
  m.setAttribute('aria-hidden', 'false'); 
}

function closeModal(m, cleanup){
  try { cleanup?.(); } catch {}
  if (!m) return;
  m.classList.remove('show'); 
  m.setAttribute('aria-hidden', 'true');
}

function blobToDataUrl(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('okuma hatası'));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

/* ==================== AUTH ==================== */

function goDefaultScreen(){
  if (currentUser){
    hide(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card'));
    show(qs('#olay-card'));
  } else {
    show(qs('#login-card'));
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    hide(qs('#olay-card'));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function goToDefaultLoginScreen(){
  try { await logout(); } catch {}
  show(qs('#login-card'));
  hide(qs('#register-card')); 
  hide(qs('#forgot-card')); 
  hide(qs('#olay-card')); 
  hide(qs('#admin-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetLoginForm(){
  const u = qs('#login-user'); 
  const p = qs('#login-pass'); 
  const t = qs('#login-totp');
  if (u) u.value = ''; 
  if (p) p.value = ''; 
  if (t) t.value = '';
  hide(qs('#totp-block')); 
  clearError(qs('#login-error'));
}

function resetRegisterForm(){
  const f = {
    u: qs('#reg-username'),
    e: qs('#reg-email'),
    p: qs('#reg-pass'),
    n: qs('#reg-name'),
    s: qs('#reg-surname'),
  };
  if (f.u) f.u.value = ''; 
  if (f.e) f.e.value = ''; 
  if (f.p) f.p.value = '';
  if (f.n) f.n.value = ''; 
  if (f.s) f.s.value = '';
  clearError(qs('#register-error'));
}

function resetForgotForm(){
  const e = qs('#fg-email'); 
  const c = qs('#fg-code');
  const p1 = qs('#fg-pass1'); 
  const p2 = qs('#fg-pass2');
  if (e) e.value = ''; 
  if (c) c.value = '';
  if (p1) p1.value = ''; 
  if (p2) p2.value = '';
  clearError(qs('#forgot-error'));
}

function showForgotStep(step){
  const emailRow = qs('#fg-email-row') || qs('#fg-email')?.closest('.row') || qs('#fg-email')?.parentElement;
  const codeRow  = qs('#fg-code-row')  || qs('#fg-code')?.closest('.row')  || qs('#fg-code')?.parentElement;

  const btnStart  = qs('#btn-forgot-start');
  const btnVerify = qs('#btn-forgot-verify');
  const btnReset  = qs('#btn-forgot-reset');

  if (emailRow) show(emailRow);
  if (codeRow)  (step >= 2 ? show(codeRow) : hide(codeRow));

  const pass1 = qs('#fg-pass1')?.closest('.row') || qs('#fg-pass1')?.parentElement;
  const pass2 = qs('#fg-pass2')?.closest('.row') || qs('#fg-pass2')?.parentElement;
  if (pass1) (step === 3 ? show(pass1) : hide(pass1));
  if (pass2) (step === 3 ? show(pass2) : hide(pass2));

  if (btnStart)  (step === 1 ? show(btnStart)  : hide(btnStart));
  if (btnVerify) (step === 2 ? show(btnVerify) : hide(btnVerify));
  if (btnReset)  (step === 3 ? show(btnReset)  : hide(btnReset));

  show(qs('#forgot-card')); 
  hide(qs('#login-card')); 
  hide(qs('#register-card')); 
  hide(qs('#olay-card'));
}

function reflectAuth(){
  const who = qs('#whoami'), rolePill = qs('#role-pill');
  const body = document.body;
  const adminCard = qs('#admin-card');
  const olayCard  = qs('#olay-card');

  body.classList.remove('role-admin', 'role-supervisor', 'role-user');
  if (currentUser){
    body.classList.add(`role-${currentUser.role}`);
  }

  if (currentUser){
    if (who) { 
      who.textContent = `Merhaba, ${currentUser.username} (${currentUser.role})`; 
      show(who); 
    }
    hide(qs('#btn-open-login')); 
    show(qs('#btn-logout'));
    hide(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    show(olayCard);
    if (rolePill) rolePill.textContent = String(currentUser.role).toUpperCase();

    if (currentUser.role === 'admin') {
      show(adminCard);
      qs('#sup-panel-toggle')?.remove();
      body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
    } else if (currentUser.role === 'supervisor') {
      ensureSupervisorToggle();
      const saved = (localStorage.getItem(SUP_MODE_KEY) || 'admin');
      setSupervisorMode(saved === 'form' ? 'form' : 'admin');
    } else {
      hide(adminCard);
      qs('#sup-panel-toggle')?.remove();
      body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
    }
  } else {
    who && (who.textContent = '');
    hide(who);
    show(qs('#btn-open-login')); 
    hide(qs('#btn-logout'));
    show(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    hide(olayCard); 
    hide(adminCard);
    qs('#sup-panel-toggle')?.remove();
    body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
  }
}

const SUP_MODE_KEY = 'sup_mode';
function setSupervisorMode(mode){
  const body = document.body;
  const adminCard = qs('#admin-card');
  const olayCard  = qs('#olay-card');

  body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
  body.classList.add(mode === 'form' ? 'supervisor-mode-form' : 'supervisor-mode-admin');

  if (mode === 'form') {
    show(olayCard);
    hide(adminCard);
  } else {
    show(adminCard);
    show(olayCard);
  }

  try { localStorage.setItem(SUP_MODE_KEY, mode); } catch {}
  qs('#sup-btn-form')?.setAttribute('aria-pressed', String(mode === 'form'));
  qs('#sup-btn-admin')?.setAttribute('aria-pressed', String(mode !== 'form'));
}

function ensureSupervisorToggle(){
  if (qs('#sup-panel-toggle')) return;
  const host = qs('.auth') || qs('header .wrap') || document.body;
  const box = document.createElement('div');
  box.id = 'sup-panel-toggle';
  box.style.display = 'flex';
  box.style.gap = '6px';
  box.style.alignItems = 'center';
  box.innerHTML = `
    <button id="sup-btn-form" class="btn ghost" type="button" title="Olay Bildirim Formu">Form</button>
    <button id="sup-btn-admin" class="btn ghost" type="button" title="Yönetim Paneli">Yönetim</button>
  `;
  host.appendChild(box);
  const saved = (localStorage.getItem(SUP_MODE_KEY) || 'admin');
  setSupervisorMode(saved === 'form' ? 'form' : 'admin');
  qs('#sup-btn-form')?.addEventListener('click', () => setSupervisorMode('form'));
  qs('#sup-btn-admin')?.addEventListener('click', () => setSupervisorMode('admin'));
}

async function checkMe(){
  try {
    const r = await fetch('/api/me');
    if (!r.ok) {
      // Token geçersizse localStorage'dan temizle
      if (r.status === 401 || r.status === 403) {
        saveToken(null);
      }
      throw 0;
    }
    currentUser = (await r.json()).me;
  } catch { 
    currentUser = null;
    if (authToken) {
      saveToken(null);
    }
  }
  reflectAuth();
  if (currentUser){ 
    await Promise.all([
      loadPageSizeSettings(),
      loadOlayTypes(), 
      loadExistingEvents(), 
      refreshAdminUsers(), 
      refreshAdminEvents()
    ]); 
  } else { 
    markersLayer.clearLayers(); 
  }
}

async function login(){
  clearError(qs('#login-error'));
  const usernameOrEmail = qs('#login-user')?.value.trim();
  const password = qs('#login-pass')?.value;
  const totp = (qs('#login-totp')?.value.trim() || undefined);
  if (!usernameOrEmail || !password) return setError(qs('#login-error'), 'Kullanıcı adı ve parola zorunludur.');

  const btn = qs('#btn-login'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password, totp })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (data.error === 'totp_gerekli') {
        show(qs('#totp-block'));
        setError(qs('#login-error'), 'Lütfen doğrulama kodunu girin.');
      } else {
        setError(qs('#login-error'), data.message || data.error || 'Giriş başarısız.');
      }
      return;
    }

    if (data.token) saveToken(data.token);
    await checkMe();
    resetLoginForm();
    toast('Giriş başarılı', 'success');
  } catch(e) {
    setError(qs('#login-error'), 'Giriş hatası: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function register(){
  clearError(qs('#register-error'));
  const username = qs('#reg-username')?.value.trim();
  const email = qs('#reg-email')?.value.trim();
  const password = qs('#reg-pass')?.value;
  const name = qs('#reg-name')?.value.trim() || undefined;
  const surname = qs('#reg-surname')?.value.trim() || undefined;

  if (!username || !email || !password) 
    return setError(qs('#register-error'), 'Kullanıcı adı, e-posta ve parola zorunludur.');
  if (!isStrongPassword(password)) 
    return setError(qs('#register-error'), 'Zayıf parola: En az 8 karakter, bir büyük, bir küçük harf ve bir sembol içermeli.');

  const btn = qs('#btn-register'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, name, surname })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#register-error'), data.message || data.error || 'Kayıt başarısız.');
      return;
    }

    alert('Kayıt başarılı! Lütfen e-postanızı kontrol edin (varsa doğrulama için).');
    resetRegisterForm();
    hide(qs('#register-card')); 
    show(qs('#login-card'));
  } catch(e) {
    setError(qs('#register-error'), 'Kayıt hatası: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function logout(){
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  saveToken(null);
  currentUser = null;
  reflectAuth();
  markersLayer.clearLayers();
  resetEdit();
  goDefaultScreen();
}

qs('#btn-login')?.addEventListener('click', login);
qs('#btn-register')?.addEventListener('click', register);
qs('#btn-logout')?.addEventListener('click', logout);
qs('#btn-open-login')?.addEventListener('click', () => {
  hide(qs('#register-card')); 
  hide(qs('#forgot-card')); 
  hide(qs('#olay-card')); 
  show(qs('#login-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#toggle-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetLoginForm();
  hide(qs('#login-card')); 
  hide(qs('#forgot-card')); 
  show(qs('#register-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#toggle-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetRegisterForm();
  hide(qs('#register-card')); 
  hide(qs('#forgot-card')); 
  show(qs('#login-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#goto-forgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetLoginForm();
  resetForgotForm();
  showForgotStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#back-to-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetForgotForm();
  hide(qs('#forgot-card')); 
  show(qs('#login-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ==================== ŞİFRE SIFIRLA ADIMLARI ==================== */

qs('#btn-forgot-start')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  if (!email) return setError(qs('#forgot-error'), 'E-posta zorunludur.');

  const btn = qs('#btn-forgot-start'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || 'Kod gönderilemedi.');
      return;
    }

    toast('Doğrulama kodu e-postanıza gönderildi (5 dk geçerli)', 'success');
    showForgotStep(2);
  } catch(e) {
    setError(qs('#forgot-error'), 'Hata: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

qs('#btn-forgot-verify')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  const code = qs('#fg-code')?.value.trim();
  if (!email || !code) return setError(qs('#forgot-error'), 'E-posta ve kod zorunludur.');

  const btn = qs('#btn-forgot-verify'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || 'Kod doğrulanamadı.');
      return;
    }

    toast('Kod doğrulandı, yeni parolanızı girin', 'success');
    showForgotStep(3);
  } catch(e) {
    setError(qs('#forgot-error'), 'Hata: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

qs('#btn-forgot-reset')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  const code = qs('#fg-code')?.value.trim();
  const newPw = qs('#fg-pass1')?.value;
  const newPw2 = qs('#fg-pass2')?.value;

  if (!email || !code || !newPw || !newPw2) 
    return setError(qs('#forgot-error'), 'Tüm alanları doldurun.');
  if (newPw !== newPw2) 
    return setError(qs('#forgot-error'), 'Parolalar eşleşmiyor.');
  if (!isStrongPassword(newPw)) 
    return setError(qs('#forgot-error'), 'Zayıf parola: En az 8 karakter, bir büyük, bir küçük harf ve bir sembol içermeli.');

  const btn = qs('#btn-forgot-reset'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPw, new_password_confirm: newPw2 })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || 'Parola sıfırlanamadı.');
      return;
    }

    alert('Parolanız sıfırlandı! Giriş yapabilirsiniz.');
    resetForgotForm();
    hide(qs('#forgot-card')); 
    show(qs('#login-card'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(e) {
    setError(qs('#forgot-error'), 'Hata: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

/* ==================== BAŞLANGIÇ ==================== */
(async function init(){
  loadToken();
  applySavedTheme();
  await applySiteConfig();
  wireEyes();
  initTabs();
  themeBtn()?.addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.classList.contains('theme-dark');
    setTheme(isDark ? 'light' : 'dark');
  });

  await loadPageSizeSettings();
  await loadAppConfig();
  

  if (FORCE_DEFAULT_LOGIN_ON_LOAD) {
    saveToken(null);
    currentUser = null;
  } else {
    await checkMe();
  }
  
  
  if (!currentUser) {
    await goToDefaultLoginScreen();
  } else {
    goDefaultScreen();
  }
  
  

  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    await Promise.all([
      loadOlayTypes(),
      refreshAdminUsers(),
      refreshAdminEvents()
    ]);
  }
})();