// index.js 
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');

const fs = require('fs');
const multer = require('multer');
const mimeTypes = require('mime-types');

const app = express();

/* ===================== GENEL ===================== */
const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAIN || '')
  .split(';')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

const QFIELD_SYNC_ROOT = process.env.QFIELD_SYNC_ROOT || '';              
const QFIELD_INGEST_INTERVAL_MS = parseInt(process.env.QFIELD_INGEST_INTERVAL_MS || '30000', 10); // 30 sn



const FRONTEND_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(); // 'lax' | 'none' | 'strict'
const COOKIE_SECURE =
  String(process.env.COOKIE_SECURE || (process.env.NODE_ENV === 'production')).toLowerCase() === 'true';


app.set('trust proxy', 1);

/* ===================== DB ===================== */
const DATABASE_URL = process.env.DATABASE_URL || '';
const sslEnv = String(process.env.PGSSL || process.env.PGSSLMODE || process.env.DATABASE_SSL || '').toLowerCase();
const sslFromUrl = /sslmode=require|ssl=true/i.test(DATABASE_URL);
const needSSL = sslEnv === '1' || sslEnv === 'true' || sslEnv === 'require' || sslFromUrl;

const BASE_DB_CFG = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      application_name: 'afet-yonetimi',
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      ssl: needSSL ? { rejectUnauthorized: false } : undefined,
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'afet_yönetimi',
      application_name: 'afet-yonetimi',
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      ssl: needSSL ? { rejectUnauthorized: false } : undefined,
    };

const DB_CFG = BASE_DB_CFG;
const pool = new Pool(DB_CFG);

// Havuz hata dinleme
pool.on('error', (err) => {
  console.error('[PG POOL] unexpected error on idle client:', err);
});

// Açılışta bağlantı ping + retry
async function ensureDbConnectionWithRetry(retry = 6, delayMs = 1500) {
  for (let i = 0; i < retry; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('[DB] bağlantı başarılı.');
      return;
    } catch (e) {
      const last = i === retry - 1;
      console.error(`[DB] bağlantı hatası (deneme ${i + 1}/${retry}):`, e.message || e);
      if (last) {
        console.error('[DB] bağlantı kurulamadı, uygulama yine de başlıyor (istek geldiğinde tekrar denenecek).');
        return;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
ensureDbConnectionWithRetry()
  .then(() => ensureDbSqlHelpers())
  .then(async () => {
    try {
      await pool.query(`ALTER TABLE public.olay DROP COLUMN IF EXISTS photo_url CASCADE`);
      await pool.query(`ALTER TABLE public.olay DROP COLUMN IF EXISTS video_url CASCADE`);
      console.log('[DB] legacy photo_url/video_url kolonları varsa temizlendi.');
    } catch (e) {
      console.warn('[DB][WARN] legacy kolon temizlik adımı:', e.message);
    }
  })
  .catch((e) => {
    console.error('[DB] açılış/migration hatası:', e && e.message ? e.message : e);
  });


/* ===================== SMTP (opsiyonel) ===================== */
let transporter = null;
const CAN_SEND_MAIL = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER));
if (CAN_SEND_MAIL) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
const MAIL_FROM = `"${process.env.SMTP_FROM_NAME || 'Afet Yönetimi'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com'}>`;
const FORCE_EMAIL_VERIFY = String(process.env.FORCE_EMAIL_VERIFY || 'false') === 'true';

/* ===================== MIDDLEWARE ===================== */
// CORS
app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      const allowList = FRONTEND_ORIGIN.split(',').map((s) => s.trim());
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error('CORS engellendi: ' + origin), false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// JSON body
app.use(express.json({ limit: '30mb' }));
app.use(cookieParser());

// uploads klasörü
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// === Yardımcılar: video uzantı ve mime tespiti ===
const VIDEO_EXT_WHITELIST = ['.mp4', '.m4v', '.mov', '.mkv', '.avi', '.wmv', '.3gp', '.3gpp', '.webm', '.ogg', '.ogv', '.mpeg', '.mpg'];
function hasVideoExtension(filename) {
  const ext = (path.extname(String(filename || '')).toLowerCase() || '');
  return VIDEO_EXT_WHITELIST.includes(ext);
}
function isVideoMimetype(m) {
  const mm = String(m || '').toLowerCase();
  if (!mm) return false;
  if (mm.startsWith('video/')) return true;
  return ['application/octet-stream'].includes(mm); // bazı cihazlar octet-stream gönderir
}

// === (YENİ) Dosya adını doğru uzantıyla oluşturma ===
function chooseExt(originalName, mimetype, kind /* 'photo'|'video' */) {
  let ext = path.extname(originalName || '').toLowerCase();
  if (!ext) {
    const extByMime = mimeTypes.extension(mimetype || '');
    if (extByMime) ext = '.' + extByMime.toLowerCase();
  }
  if (!ext) ext = kind === 'photo' ? '.jpg' : '.mp4';
  if (kind === 'video' && !hasVideoExtension(ext)) ext = '.mp4';
  return ext;
}
function uniqueFileName(ext) {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
}

// Multer diskStorage – dosyaları DOĞRU UZANTIYLA kaydet
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const kind = req.path.includes('/photo') ? 'photo' : req.path.includes('/video') ? 'video' : 'photo';
    const ext = chooseExt(file.originalname, file.mimetype, kind);
    cb(null, uniqueFileName(ext));
  }
});

// multer
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const mt = file.mimetype || '';
    const on = file.originalname || '';
    const isImage = mt.startsWith('image/');
    const isVideo = isVideoMimetype(mt) || hasVideoExtension(on);

    if (req.path.includes('/photo')) {
      return isImage ? cb(null, true) : cb(new Error('Sadece resim yükleyin'));
    }
    if (req.path.includes('/video')) {
      return isVideo ? cb(null, true) : cb(new Error('Sadece video yükleyin'));
    }
    cb(null, false);
  },
});

/* ========= /uploads/* için Range destekli servis ========= */
app.get(/^\/uploads\/(.+)$/, (req, res) => {
  const rest = req.params[0] || '';
  const rel = path.posix.join('uploads', rest).replace(/^\/+/, ''); // uploads/...
  const abs = path.join(PUBLIC_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR)) {
    return res.status(403).end();
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(404).end();
  }

  const size = fs.statSync(abs).size;
  const mime = mimeTypes.lookup(abs) || 'application/octet-stream';
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (range) {
    const m = String(range).match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (start >= size || end >= size) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.setHeader('Content-Length', String(size));
  return fs.createReadStream(abs).pipe(res);
});

// Statik servis
app.use(express.static(PUBLIC_DIR));

/* ===================== HELPERS ===================== */
function signToken(user, expires = JWT_EXPIRES) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: expires });
}
function getTokenFrom(req) {
  return (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null) || req.cookies?.token || null;
}
const norm = (s) => String(s ?? '').trim();

// Cookie helper
function baseCookieFlags(req) {
  const xfProto = req?.headers?.['x-forwarded-proto'];
  const isHttps = !!(req?.secure || (typeof xfProto === 'string' && xfProto.toLowerCase() === 'https'));

  const isLocalhostOrigin = FRONTEND_ORIGIN.split(',')
    .map((s) => s.trim().toLowerCase())
    .some((o) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o));

  let secure = COOKIE_SECURE;
  if (secure && !isHttps && isLocalhostOrigin) {
    secure = false;
  }

  let sameSite = COOKIE_SAMESITE;
  if (sameSite === 'none' && !secure) {
    sameSite = 'lax';
  }

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
  };
}
function cookieOpts(days = 7, req = null) {
  return { ...baseCookieFlags(req), maxAge: days * 24 * 60 * 60 * 1000 };
}
function cookieOptsSession(req = null) {
  return { ...baseCookieFlags(req) };
}
// === QFIELD INGEST: DCIM/files içindeki dosyaları public/uploads'a kopyala ve DB'yi normalize et ===
function _fileExists(p){ try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } }

// QField paketinde adı geçen dosyayı (relatif veya tam ad) bul
function _findFileRecursive(root, relOrName) {
  const name = path.basename(String(relOrName || ''));
  if (!name) return null;

  // 1) Tam verilmişse
  if (_fileExists(relOrName)) return relOrName;

  // 2) root + relative
  const tryRel = path.join(root, relOrName);
  if (_fileExists(tryRel)) return tryRel;

  // 3) Ada göre tarama (yeterince hızlı + güvenli)
  let hit = null;
  (function walk(dir) {
    if (hit) return;
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && path.basename(p) === name) { hit = p; return; }
    }
  })(root);
  return hit;
}

function _uniqueNameWithExt(srcFullPath, fallbackExt) {
  const ext = (path.extname(srcFullPath || '') || fallbackExt || '.bin').toLowerCase();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
}

// Tek kayıt dönüştür: telefon yolu -> uploads’a kopyala -> /uploads/... olarak döndür
function _convertOnePathToUploads(absRoot, rawPath, kind /* 'photo'|'video' */) {
  if (!rawPath) return null;

  // Zaten bizim formatta ise bırak
  if (String(rawPath).startsWith('/uploads/')) return String(rawPath);

  // JSON diziden tek eleman gelmiş olabilir; hepsini toplayacağız
  const src = _findFileRecursive(absRoot, rawPath);
  if (!src) return null;

  const newName = _uniqueNameWithExt(src, kind === 'photo' ? '.jpg' : '.mp4');
  const dst = path.join(UPLOAD_DIR, newName);
  fs.copyFileSync(src, dst);
  return `/uploads/${newName}`;
}

// TEXT(JSON) alanı oku → JS dizi
function _parseTextJson(txt) {
  try { const v = JSON.parse(String(txt || '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
}
function _toTextJson(arr) {
  try { return JSON.stringify(Array.isArray(arr) ? arr : []); } catch { return '[]'; }
}

// DB tarayıp dönüştür
async function ingestQFieldFolder(absRoot) {
  if (!absRoot || !fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error('QFIELD_SYNC_ROOT geçersiz veya erişilemiyor');
  }

  // uploads klasörü garanti
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Zaten /uploads/ içermeyen kayıtları hedefleyelim (boş olmayanlar)
  const q = `
    SELECT olay_id, photo_urls, video_urls
    FROM public.olay
    WHERE (
            COALESCE(photo_urls,'[]') <> '[]' AND photo_urls NOT LIKE '%/uploads/%'
          )
       OR (
            COALESCE(video_urls,'[]') <> '[]' AND video_urls NOT LIKE '%/uploads/%'
          )
    ORDER BY olay_id DESC
    LIMIT 500
  `;
  const { rows } = await pool.query(q);
  if (!rows.length) return { updated: 0 };

  let updated = 0;
  for (const r of rows) {
    const photosIn = _parseTextJson(r.photo_urls);
    const videosIn = _parseTextJson(r.video_urls);

    const photosOut = [];
    for (const it of (Array.isArray(photosIn) && photosIn.length ? photosIn : [r.photo_urls]).flat()) {
      const converted = _convertOnePathToUploads(absRoot, it, 'photo');
      if (converted) photosOut.push(converted);
    }

    const videosOut = [];
    for (const it of (Array.isArray(videosIn) && videosIn.length ? videosIn : [r.video_urls]).flat()) {
      const converted = _convertOnePathToUploads(absRoot, it, 'video');
      if (converted) videosOut.push(converted);
    }

    // en az bir şey dönüştüyse yaz
    if (photosOut.length || videosOut.length) {
      await pool.query(
        `UPDATE public.olay
           SET photo_urls = $1::text,
               video_urls = $2::text
         WHERE olay_id = $3`,
        [_toTextJson(photosOut.length ? photosOut : photosIn), _toTextJson(videosOut.length ? videosOut : videosIn), r.olay_id]
      );
      updated++;
    }
  }
  return { updated };
}

// Arka plan döngüsü (çakışma olmasın)
let _ingestBusy = false;
async function _ingestTick() {
  if (_ingestBusy) return;
  if (!QFIELD_SYNC_ROOT) return;
  _ingestBusy = true;
  try {
    const result = await ingestQFieldFolder(QFIELD_SYNC_ROOT);
    if (result?.updated) console.log(`[QFIELD] ingest: ${result.updated} kayıt güncellendi.`);
  } catch (e) {
    console.warn('[QFIELD] ingest hata:', e.message || e);
  } finally {
    _ingestBusy = false;
  }
}

function startQFieldIngestLoop() {
  if (!QFIELD_SYNC_ROOT) {
    console.log('[QFIELD] QFIELD_SYNC_ROOT tanımlı değil; arka plan ingest devre dışı.');
    return;
  }
  console.log(`[QFIELD] arka plan ingest aktif. Kök: ${QFIELD_SYNC_ROOT} | interval: ${QFIELD_INGEST_INTERVAL_MS}ms`);
  setInterval(_ingestTick, Math.max(5000, QFIELD_INGEST_INTERVAL_MS));
  // sunucu açılır açılmaz bir kez dene
  _ingestTick();
}

// Email alan adı kuralı (çoklu domain desteği)
function isEmailAllowed(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  const m = email.match(/^[^@\s]+@([^@\s]+\.[^@\s]+)$/);
  if (!m) return false;
  const domain = m[1];
  
  // Eğer domain listesi boşsa, tüm e-postalar kabul edilir
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  
  // Domain listesinde var mı kontrol et
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// Auth middleware
async function requireAuth(req, res, next) {
  try {
    const t = getTokenFrom(req);
    if (!t) return res.status(401).json({ error: 'unauthenticated' });
    const payload = jwt.verify(t, JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT id, username, role, email, COALESCE(is_active,true) AS is_active
       FROM users WHERE id=$1`,
      [payload.sub]
    );
    if (!rows.length) {
      res.clearCookie('token', cookieOpts(0, req));
      return res.status(401).json({ error: 'unauthenticated' });
    }
    const u = rows[0];
    if (!u.is_active) {
      res.clearCookie('token', cookieOpts(0, req));
      return res.status(403).json({ error: 'user_inactive' });
    }
    req.user = { id: u.id, username: u.username, role: u.role, email: u.email };
    next();
  } catch {
    res.clearCookie('token', cookieOpts(0, req));
    return res.status(401).json({ error: 'invalid_token' });
  }
}
function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// Şifre politikası
const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^\w\s]).{8,}$/;
function isStrongPassword(pw) {
  return PW_REGEX.test(String(pw || ''));
}

/* ===================== 2FA Gizli Anahtar Şifreleme ===================== */
function getTotpKey() {
  const rawHex = process.env.TOTP_ENC_KEY || crypto.createHash('sha256').update(String(JWT_SECRET)).digest('hex');
  return Buffer.from(rawHex.slice(0, 64), 'hex');
}
function encSecret(base32Plain) {
  const key = getTotpKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(base32Plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}
function decSecret(stored) {
  try {
    if (typeof stored !== 'string' || !stored) return null;
    if (!stored.startsWith('enc:v1:')) return stored;
    const [, , ivb, ctb, tagb] = stored.split(':');
    const key = getTotpKey();
    const iv = Buffer.from(ivb, 'base64');
    const ct = Buffer.from(ctb, 'base64');
    const tag = Buffer.from(tagb, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}
function normalizeBase32(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}
function padBase32(b32) {
  const clean = String(b32 || '');
  const rem = clean.length % 8;
  return rem === 0 ? clean : clean + '='.repeat(8 - rem);
}

/* ===================== Attachment Helpers (TEXT JSON) ===================== */
function toRelUploadPath(p) {
  const base = String(p || '').trim();
  if (!base) return null;
  if (base.startsWith('/uploads/')) return base;
  const onlyName = path.basename(base);
  return `/uploads/${onlyName}`;
}

// dataURL kaydet -> /uploads/... döndür
function saveDataUrlToUploads(dataUrl, kind /* 'photo'|'video' */) {
  const m = String(dataUrl || '').match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error('gecersiz_dataurl');
  const mime = (m[1] || '').toLowerCase();
  const buf = Buffer.from(m[2], 'base64');

  const ext = (() => {
    if (kind === 'photo') {
      if (mime.includes('png')) return '.png';
      if (mime.includes('webp')) return '.webp';
      if (mime.includes('gif')) return '.gif';
      if (mime.includes('heic')) return '.heic';
      if (mime.includes('heif')) return '.heif';
      return '.jpg';
    }
    if (mime.includes('mp4') || mime.includes('mpeg4')) return '.mp4';
    if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
    if (mime.includes('x-matroska') || mime.includes('mkv')) return '.mkv';
    if (mime.includes('x-msvideo') || mime.includes('avi')) return '.avi';
    if (mime.includes('x-ms-wmv') || mime.includes('wmv')) return '.wmv';
    if (mime.includes('3gpp2')) return '.3gpp';
    if (mime.includes('3gpp') || mime.includes('3gp')) return '.3gp';
    if (mime.includes('m4v')) return '.m4v';
    if (mime.includes('mpeg')) return '.mpeg';
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg') || mime.includes('ogv')) return '.ogv';
    return '.mp4';
  })();

  const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const fp = path.join(UPLOAD_DIR, fname);
  fs.writeFileSync(fp, buf);
  return `/uploads/${fname}`;
}

function normalizeIncomingToUrlArray(input, kind /* 'photo'|'video' */) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out = [];
  for (const v of arr) {
    if (!v) continue;

    // 1) dataURL string
    if (typeof v === 'string' && v.startsWith('data:')) {
      try {
        out.push(saveDataUrlToUploads(v, kind));
        continue;
      } catch {}
    }

    // 2) doğrudan string path/URL
    if (typeof v === 'string') {
      const rel = toRelUploadPath(v);
      if (rel) out.push(rel);
      continue;
    }

    // 3) obje formunda { path|url|href|relativePath, dataUrl? }
    if (typeof v === 'object' && v.dataUrl) {
      try {
        out.push(saveDataUrlToUploads(v.dataUrl, kind));
        continue;
      } catch {}
    }
    if (typeof v === 'object') {
      const relRaw = v.path || v.url || v.href || v.relativePath || '';
      const rel = toRelUploadPath(relRaw);
      if (rel) out.push(rel);
    }
  }
  // aynıları temizle
  return Array.from(new Set(out));
}

// TEXT(JSON) yardımcıları
function toJsonText(arr) {
  try {
    return JSON.stringify(Array.isArray(arr) ? arr : []);
  } catch {
    return '[]';
  }
}
function parseJsonText(txt) {
  try {
    const v = JSON.parse(String(txt ?? '[]'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ===================== Başlangıç Seed ===================== */
async function seedOlaylarFromEnv(pool) {
  const csv = process.env.OLAY_TURLERI_CSV;
  if (!csv) return;
  const list = csv.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return;

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const name of list) {
      await c.query('INSERT INTO olaylar (o_adi, active) VALUES ($1, true) ON CONFLICT (o_adi) DO NOTHING', [name]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('seed error:', e);
  } finally {
    c.release();
  }
}
seedOlaylarFromEnv(pool);

/* ===================== Açılışta düz TOTP’leri şifrele ===================== */
async function migratePlainTotpOnBoot() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, two_factor_secret FROM users
       WHERE two_factor_secret IS NOT NULL
         AND two_factor_secret <> ''
         AND two_factor_secret NOT LIKE 'enc:v1:%'`
    );
    for (const r of rows) {
      const enc = encSecret(r.two_factor_secret);
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.bypass_totp_check','1',true)`);
        await client.query('UPDATE users SET two_factor_secret=$1, two_factor_enabled=TRUE WHERE id=$2', [enc, r.id]);
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      }
    }
    if (rows.length) console.log(`[2FA] ${rows.length} kullanıcı için TOTP secret şifrelendi.`);
  } catch (e) {
    console.error('[2FA] Açılışta şifreleme hatası:', e);
  } finally {
    client.release();
  }
}
migratePlainTotpOnBoot();

/* ===================== DB Şema + Triggerlar (TEXT JSON) ===================== */
// === replace the WHOLE ensureDbSqlHelpers() with this version ===
async function ensureDbSqlHelpers() {
  console.log('[DB] SQL helpers kurulumu başlıyor...');

  // Her adımı tek tek çalıştır, hata olursa WARN ver ama devam et
  async function run(name, sql) {
    try {
      await pool.query(sql);
      console.log(`[DB][OK] ${name}`);
    } catch (e) {
      console.warn(`[DB][WARN] ${name} step failed: ${e.message}`);
    }
  }

  // Bazı karmaşık adımlar için kısa transaction yardımcıları
  async function tx(name, fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await fn(c);
      await c.query('COMMIT');
      console.log(`[DB][OK] ${name}`);
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch {}
      console.warn(`[DB][WARN] ${name} step failed: ${e.message}`);
    } finally {
      c.release();
    }
  }

  // 1) Extension / schema
  await run('create extension pgcrypto', `CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await run('create extension postgis',  `CREATE EXTENSION IF NOT EXISTS postgis`);
  await run('create schema app_api',     `CREATE SCHEMA IF NOT EXISTS app_api`);

  // 2) Indexler (idempotent)
  await run('users_username_idx', `CREATE INDEX IF NOT EXISTS users_username_idx ON public.users (lower(btrim(username)))`);
  await run('users_email_idx',    `CREATE INDEX IF NOT EXISTS users_email_idx    ON public.users (lower(btrim(email)))`);

  // 3) users/olay/olaylar kolon eklemeleri (idempotent)
  // users
  await run('users add is_active',          `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
  await run('users add deleted_by',         `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_by text`);
  await run('users add deleted_by_role',    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_by_role text`);
  await run('users add deleted_by_id',      `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_by_id integer`);
  await run('users add deleted_at',         `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
  await run('users add reset_code',         `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_code text`);
  await run('users add reset_expires',      `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_expires timestamptz`);
  await run('users drop two_factor_hash',   `ALTER TABLE public.users DROP COLUMN IF EXISTS two_factor_hash`);
  await run('users add two_factor_norm_hash', `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_norm_hash text`);

  // olay TEXT(JSON) alanları ve meta
  await run('olay add photo_urls',          `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS photo_urls text`);
  await run('olay add video_urls',          `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS video_urls text`);
  await run('olay photo default',           `ALTER TABLE public.olay ALTER COLUMN photo_urls SET DEFAULT '[]'`);
  await run('olay photo not null',          `ALTER TABLE public.olay ALTER COLUMN photo_urls SET NOT NULL`);
  await run('olay video default',           `ALTER TABLE public.olay ALTER COLUMN video_urls SET DEFAULT '[]'`);
  await run('olay video not null',          `ALTER TABLE public.olay ALTER COLUMN video_urls SET NOT NULL`);
  await run('olay drop photo',              `ALTER TABLE public.olay DROP COLUMN IF EXISTS photo`);
  await run('olay drop video',              `ALTER TABLE public.olay DROP COLUMN IF EXISTS video`);

  // ——— TEKİL KOLONLAR OLMASIN (photo_url / video_url) ———
  // 3a) Basit drop (varsa)
  await run('olay drop photo_url (legacy single)', `ALTER TABLE public.olay DROP COLUMN IF EXISTS photo_url`);
  await run('olay drop video_url (legacy single)', `ALTER TABLE public.olay DROP COLUMN IF EXISTS video_url`);

  // 3b) Herhangi bir şemadaki *olay* tablosunda bu kolonlar varsa kuvvetli düşür (CASCADE)
  await tx('drop photo_url/video_url on any schema.olay (CASCADE)', async (c) => {
    const { rows } = await c.query(`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_name = 'olay'
        AND column_name IN ('photo_url','video_url')
    `);
    for (const r of rows) {
      const fq = `"${r.table_schema}"."${r.table_name}"`;
      const col = `"${r.column_name}"`;
      await c.query(`ALTER TABLE ${fq} DROP COLUMN ${col} CASCADE`);
    }
  });

  // 3c) Bazı durumlarda DEFAULT/NOT NULL constraint nedeniyle düşmeyebilir; önce temizle sonra tekrar dene
  await tx('ensure photo_url/video_url fully removed', async (c) => {
    const { rows } = await c.query(`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_name = 'olay'
        AND column_name IN ('photo_url','video_url')
    `);
    for (const r of rows) {
      const fq = `"${r.table_schema}"."${r.table_name}"`;
      const col = `"${r.column_name}"`;
      // güvenli temizlik
      try { await c.query(`ALTER TABLE ${fq} ALTER COLUMN ${col} DROP DEFAULT`); } catch {}
      try { await c.query(`ALTER TABLE ${fq} ALTER COLUMN ${col} DROP NOT NULL`); } catch {}
      await c.query(`ALTER TABLE ${fq} DROP COLUMN ${col} CASCADE`);
    }
  });
  // ————————————————————————————————————————————————

  await run('olay add created_by_name',     `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS created_by_name text`);
  await run('olay add created_by_role_name',`ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS created_by_role_name text`);
  await run('olay add created_by_id',       `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS created_by_id integer`);
  await run('olay add active',              `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS active boolean DEFAULT true`);
  await run('olay add deactivated_by_name', `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS deactivated_by_name text`);
  await run('olay add deactivated_by_role', `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS deactivated_by_role_name text`);
  await run('olay add deactivated_by_id',   `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS deactivated_by_id integer`);
  await run('olay add deactivated_at',      `ALTER TABLE public.olay ADD COLUMN IF NOT EXISTS deactivated_at timestamptz`);
  await run('olay drop created_by legacy',  `ALTER TABLE public.olay DROP COLUMN IF EXISTS created_by`);

  // olaylar meta
  await run('olaylar add active',             `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS active boolean DEFAULT true`);
  await run('olaylar add created_by_name',    `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS created_by_name text`);
  await run('olaylar add created_by_role',    `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS created_by_role_name text`);
  await run('olaylar add created_by_id',      `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS created_by_id integer`);
  await run('olaylar add created_at default', `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
  await run('olaylar add deactivated_at',     `ALTER TABLE public.olaylar ADD COLUMN IF NOT EXISTS deactivated_at timestamptz`);
  await run('olaylar drop created_by legacy', `ALTER TABLE public.olaylar DROP COLUMN IF EXISTS created_by`);

  // 4) Eşsiz kısıt (idempotent)
  await tx('olaylar unique(o_adi)', async (c) => {
    try {
      await c.query(`ALTER TABLE public.olaylar ADD CONSTRAINT olaylar_o_adi_key UNIQUE (o_adi)`);
    } catch (e) {
      if (!/already exists|duplicate|exists/i.test(e.message)) throw e;
    }
  });

  // 5) users identity/PK ve olay/olaylar identity/PK
  await tx('users identity+pk', async (c) => {
    try { await c.query(`ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)`); } catch {}
    try { await c.query(`ALTER TABLE public.users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY`); } catch {}
  });

  await tx('olay identity+pk', async (c) => {
    try { await c.query(`ALTER TABLE public.olay ADD CONSTRAINT olay_pkey PRIMARY KEY (olay_id)`); } catch {}
    try { await c.query(`ALTER TABLE public.olay ALTER COLUMN olay_id ADD GENERATED BY DEFAULT AS IDENTITY`); } catch {}
  });

  await tx('olaylar identity+pk', async (c) => {
    try { await c.query(`ALTER TABLE public.olaylar ADD CONSTRAINT olaylar_pkey PRIMARY KEY (o_id)`); } catch {}
    try { await c.query(`ALTER TABLE public.olaylar ALTER COLUMN o_id ADD GENERATED BY DEFAULT AS IDENTITY`); } catch {}
  });

  // 6) text[] -> TEXT(JSON) dönüşümleri
  await tx('olay photo_urls ARRAY->text(JSON)', async (c) => {
    try {
      const info = await c.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='olay' AND column_name='photo_urls'
      `);
    if (info.rows[0]?.data_type === 'ARRAY') {
        await c.query(`ALTER TABLE public.olay ALTER COLUMN photo_urls TYPE text USING to_json(photo_urls)::text`);
      }
    } catch (e) {
      console.warn('[DB][WARN] olay photo_urls type check failed:', e.message);
    }
  });

  await tx('olay video_urls ARRAY->text(JSON)', async (c) => {
    try {
      const info = await c.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='olay' AND column_name='video_urls'
      `);
      if (info.rows[0]?.data_type === 'ARRAY') {
        await c.query(`ALTER TABLE public.olay ALTER COLUMN video_urls TYPE text USING to_json(video_urls)::text`);
      }
    } catch (e) {
      console.warn('[DB][WARN] olay video_urls type check failed:', e.message);
    }
  });

  // 7) Fonksiyonlar
  await run('fn _check_password_policy', `
    CREATE OR REPLACE FUNCTION app_api._check_password_policy(pw text)
    RETURNS void LANGUAGE plpgsql AS $fn$
    BEGIN
      -- Postgres POSIX regex: lookahead yok; \w/\s yok.
      -- Kurallar: >=8, en az 1 küçük, 1 büyük, 1 sembol (harf/rakam/boşluk dışı).
      IF pw IS NULL
         OR length(pw) < 8
         OR pw !~ '[[:lower:]]'
         OR pw !~ '[[:upper:]]'
         OR pw !~ '[^[:alnum:][:space:]]'
      THEN
        RAISE EXCEPTION 'Şifre politikası: En az 8 karakter, en az bir küçük harf, en az bir büyük harf ve en az bir noktalama/simge.' USING ERRCODE='P0001';
      END IF;
    END
    $fn$;
  `);


  await run('fn _normalize_base32', `
    CREATE OR REPLACE FUNCTION app_api._normalize_base32(b32 text)
    RETURNS text LANGUAGE sql AS
    $$ SELECT NULLIF(regexp_replace(upper(COALESCE(b32,'')), '[^A-Z2-7]', '', 'g'), '') $$;
  `);

  await run('fn _sha256_hex', `
    CREATE OR REPLACE FUNCTION app_api._sha256_hex(t text)
    RETURNS text LANGUAGE sql AS
    $$ SELECT CASE WHEN t IS NULL THEN NULL ELSE encode(digest(t,'sha256'),'hex') END $$;
  `);

  await run('fn _extract_plain_from_query', `
    CREATE OR REPLACE FUNCTION app_api._extract_plain_from_query(q text)
    RETURNS text LANGUAGE plpgsql AS $fn$
    DECLARE m text;
    BEGIN
      IF q IS NULL THEN RETURN NULL; END IF;
      m := substring(q from $rx$crypt\\('([^']+)'\\s*,\\s*gen_salt\\('bf'[^\\)]*\\)\\)$rx$);
      RETURN m;
    END
    $fn$;
  `);

  await run('fn users_before_ins_upd', `
    CREATE OR REPLACE FUNCTION app_api.users_before_ins_upd()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE plain text; curq text;
    BEGIN
      IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.password_hash IS DISTINCT FROM NEW.password_hash)) THEN
        plain := current_setting('app.password_plain', true);
        IF plain IS NULL THEN
          SELECT query INTO curq FROM pg_stat_activity WHERE pid = pg_backend_pid();
          plain := app_api._extract_plain_from_query(curq);
        END IF;
        IF plain IS NULL THEN
          RAISE EXCEPTION 'Şifre doğrulaması için ya düz parolayı SQL içinde crypt(''PAROLA'', gen_salt(''bf'')) şeklinde verin ya da INSERT öncesi SELECT set_config(''app.password_plain'',''PAROLA'',true) çağırın.' USING ERRCODE='P0001';
        END IF;
        PERFORM app_api._check_password_policy(plain);
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_prevent_global_dup', `
    CREATE OR REPLACE FUNCTION app_api.users_prevent_global_dup()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE v_dummy int;
    BEGIN
      IF NEW.username IS NOT NULL THEN NEW.username := NULLIF(btrim(NEW.username),''); END IF;
      IF NEW.email    IS NOT NULL THEN NEW.email    := NULLIF(btrim(NEW.email),   ''); END IF;

      IF TG_OP='INSERT' THEN
        SELECT 1 INTO v_dummy FROM public.users u
        WHERE (lower(btrim(u.username)) = lower(COALESCE(NEW.username,'')) OR lower(btrim(u.email)) = lower(COALESCE(NEW.email,'')))
        LIMIT 1;
        IF FOUND THEN RAISE EXCEPTION 'active_username_or_email_exists' USING ERRCODE='P0002'; END IF;
      ELSIF TG_OP='UPDATE' THEN
        IF COALESCE(OLD.is_active,false)=false AND COALESCE(NEW.is_active,true)=true THEN RETURN NEW; END IF;

        IF (COALESCE(NEW.username,'') IS DISTINCT FROM COALESCE(OLD.username,''))
           OR (COALESCE(NEW.email,'') IS DISTINCT FROM COALESCE(OLD.email,'')) THEN
          SELECT 1 INTO v_dummy FROM public.users u
          WHERE u.id <> NEW.id
            AND (lower(btrim(u.username)) = lower(COALESCE(NEW.username,'')) OR lower(btrim(u.email)) = lower(COALESCE(NEW.email,'')))
          LIMIT 1;
          IF FOUND THEN RAISE EXCEPTION 'active_username_or_email_exists' USING ERRCODE='P0002'; END IF;
        END IF;
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_prevent_useless_activate', `
    CREATE OR REPLACE FUNCTION app_api.users_prevent_useless_activate()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF TG_OP='UPDATE'
         AND (TG_ARGV[0] IS NULL OR TG_ARGV[0] <> 'bypass')
         AND COALESCE(OLD.is_active,true)=true
         AND COALESCE(NEW.is_active,true)=true THEN
        RAISE EXCEPTION 'active liği true olan bir kullanıcının active liği true olamaz' USING ERRCODE='P0004';
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_totp_before', `
    CREATE OR REPLACE FUNCTION app_api.users_totp_before()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE b32 text; h text; bypass text;
    BEGIN
      bypass := current_setting('app.bypass_totp_check', true);
      IF bypass = '1' THEN RETURN NEW; END IF;

      IF NEW.role IS DISTINCT FROM 'supervisor' THEN
        NEW.two_factor_norm_hash := NULL;
        RETURN NEW;
      END IF;

      IF NEW.two_factor_secret IS NULL OR NEW.two_factor_secret = '' THEN
        NEW.two_factor_enabled := false;
        NEW.two_factor_norm_hash := NULL;
        RETURN NEW;
      END IF;

      IF NEW.two_factor_secret LIKE 'enc:v1:%' THEN
        RAISE EXCEPTION 'totp_plain_required' USING ERRCODE='P0003';
      END IF;

      b32 := app_api._normalize_base32(NEW.two_factor_secret);
      IF b32 IS NULL OR b32 = '' THEN
        RAISE EXCEPTION 'invalid_base32' USING ERRCODE='P0003';
      END IF;

      h := app_api._sha256_hex(b32);
      PERFORM 1 FROM public.users u
        WHERE u.role='supervisor'
          AND u.two_factor_norm_hash = h
          AND (TG_OP='INSERT' OR u.id <> NEW.id)
        LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'base32_conflict' USING ERRCODE='P0003';
      END IF;

      NEW.two_factor_norm_hash := h;
      NEW.two_factor_enabled := true;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_after_status_change', `
    CREATE OR REPLACE FUNCTION app_api.users_after_status_change()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF TG_OP='UPDATE' AND COALESCE(OLD.is_active,false)=false AND COALESCE(NEW.is_active,true)=true THEN
        UPDATE public.olay o
          SET active = TRUE,
              deactivated_by_name = NULL,
              deactivated_by_role_name = NULL,
              deactivated_by_id = NULL,
              deactivated_at = NULL
        WHERE COALESCE(o.active,false)=false
          AND (o.created_by_id = NEW.id OR (o.created_by_id IS NULL AND o.created_by_name = NEW.username));

        IF NEW.role = 'supervisor' THEN
          UPDATE public.olaylar t
            SET active = TRUE,
                deactivated_by_name = NULL,
                deactivated_by_role_name = NULL,
                deactivated_by_id = NULL,
                deactivated_at = NULL
          WHERE COALESCE(t.active,false)=false
            AND (t.created_by_id = NEW.id OR (t.created_by_id IS NULL AND t.created_by_name = NEW.username));
        END IF;
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_after_ins_upd', `
    CREATE OR REPLACE FUNCTION app_api.users_after_ins_upd()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.two_factor_secret IS NOT NULL
         AND NEW.two_factor_secret <> ''
         AND NEW.two_factor_secret NOT LIKE 'enc:v1:%' THEN
        PERFORM pg_notify('encrypt_totp', NEW.id::text);
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn olay_fill_deactivated_meta', `
    CREATE OR REPLACE FUNCTION app_api.olay_fill_deactivated_meta()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE actor_name text := current_setting('app.actor_name', true);
            actor_role text := current_setting('app.actor_role', true);
            actor_id   int  := NULLIF(current_setting('app.actor_id', true),'')::int;
    BEGIN
      IF COALESCE(OLD.active,true)=true AND COALESCE(NEW.active,false)=false THEN
        IF NEW.deactivated_by_name IS NULL THEN NEW.deactivated_by_name := COALESCE(actor_name, current_user); END IF;
        IF NEW.deactivated_by_role_name IS NULL THEN NEW.deactivated_by_role_name := COALESCE(actor_role, 'db_user'); END IF;
        IF NEW.deactivated_by_id IS NULL THEN NEW.deactivated_by_id := actor_id; END IF;
        IF NEW.deactivated_at IS NULL THEN NEW.deactivated_at := NOW(); END IF;
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn olaylar_fill_deactivated_meta', `
    CREATE OR REPLACE FUNCTION app_api.olaylar_fill_deactivated_meta()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE actor_name text := current_setting('app.actor_name', true);
            actor_role text := current_setting('app.actor_role', true);
            actor_id   int  := NULLIF(current_setting('app.actor_id', true),'')::int;
    BEGIN
      IF COALESCE(OLD.active,true)=true AND COALESCE(NEW.active,false)=false THEN
        IF NEW.deactivated_by_name IS NULL THEN NEW.deactivated_by_name := COALESCE(actor_name, current_user); END IF;
        IF NEW.deactivated_by_role_name IS NULL THEN NEW.deactivated_by_role_name := COALESCE(actor_role, 'db_user'); END IF;
        IF NEW.deactivated_by_id IS NULL THEN NEW.deactivated_by_id := actor_id; END IF;
        IF NEW.deactivated_at IS NULL THEN NEW.deactivated_at := NOW(); END IF;
      END IF;
      RETURN NEW;
    END
    $fn$;
  `);

  await run('fn users_enforce_update_rows', `
    CREATE OR REPLACE FUNCTION app_api.users_enforce_update_rows()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
  `);

  // 8) Triggerlar (önce varsa düşür, sonra oluştur)
  await run('drop trg_users_prevent_global_dup', `DROP TRIGGER IF EXISTS trg_users_prevent_global_dup ON public.users`);
  await run('drop trg_users_before_ins_upd',     `DROP TRIGGER IF EXISTS trg_users_before_ins_upd ON public.users`);
  await run('drop trg_users_totp_before',        `DROP TRIGGER IF EXISTS trg_users_totp_before ON public.users`);
  await run('drop trg_users_guard_reactivate',   `DROP TRIGGER IF EXISTS trg_users_guard_reactivate ON public.users`);
  await run('drop trg_users_enforce_is_active_update', `DROP TRIGGER IF EXISTS trg_users_enforce_is_active_update ON public.users`);
  await run('drop trg_users_after_ins_upd',      `DROP TRIGGER IF EXISTS trg_users_after_ins_upd ON public.users`);  // <— EKLENDİ
  await run('drop trg_olay_fill_deactivated',    `DROP TRIGGER IF EXISTS trg_olay_fill_deactivated ON public.olay`);

  await run('trg_users_prevent_global_dup', `
    CREATE TRIGGER trg_users_prevent_global_dup
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION app_api.users_prevent_global_dup()
  `);

  await run('trg_users_before_ins_upd', `
    CREATE TRIGGER trg_users_before_ins_upd
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION app_api.users_before_ins_upd()
  `);

  await run('trg_users_totp_before', `
    CREATE TRIGGER trg_users_totp_before
    BEFORE INSERT OR UPDATE OF two_factor_secret, two_factor_enabled, role ON public.users
    FOR EACH ROW EXECUTE FUNCTION app_api.users_totp_before()
  `);

  await run('trg_users_guard_reactivate', `
    CREATE TRIGGER trg_users_guard_reactivate
    BEFORE UPDATE OF is_active ON public.users
    FOR EACH ROW EXECUTE FUNCTION app_api.users_prevent_useless_activate()
  `);

  await run('trg_users_enforce_is_active_update', `
    CREATE TRIGGER trg_users_enforce_is_active_update
    AFTER UPDATE ON public.users
    FOR EACH STATEMENT EXECUTE FUNCTION app_api.users_enforce_update_rows()
  `);

  await run('trg_users_after_ins_upd', `
    CREATE TRIGGER trg_users_after_ins_upd
    AFTER INSERT OR UPDATE OF two_factor_secret ON public.users
    FOR EACH ROW EXECUTE FUNCTION app_api.users_after_ins_upd()
  `);

  await run('trg_olay_fill_deactivated', `
    CREATE TRIGGER trg_olay_fill_deactivated
    BEFORE UPDATE OF active ON public.olay
    FOR EACH ROW EXECUTE FUNCTION app_api.olay_fill_deactivated_meta()
  `);

  // 9) Query Tool fonksiyonları (SECURITY DEFINER)
  await run('fn app_api.create_user', `
    CREATE OR REPLACE FUNCTION app_api.create_user(
      p_username text, p_password text, p_role text, p_name text, p_surname text, p_email text
    )
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id integer;
    BEGIN
      IF p_role NOT IN ('user','supervisor','admin') THEN
        RAISE EXCEPTION 'Geçersiz rol: %', p_role USING ERRCODE='P0001';
      END IF;

      PERFORM app_api._check_password_policy(p_password);
      PERFORM set_config('app.password_plain', p_password, true);

      INSERT INTO public.users (username, password_hash, role, name, surname, email, email_verified, is_verified, is_active)
      VALUES (p_username, crypt(p_password, gen_salt('bf',10)), p_role, NULLIF(p_name,''), NULLIF(p_surname,''), p_email, TRUE, TRUE, TRUE)
      RETURNING id INTO v_id;

      PERFORM set_config('app.password_plain', NULL, true);
      RETURN v_id;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.password_plain', NULL, true);
      RAISE;
    END
    $fn$;
  `);

  await run('fn app_api.set_user_totp', `
    CREATE OR REPLACE FUNCTION app_api.set_user_totp(p_user_id integer, p_base32 text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE public.users
      SET two_factor_secret = NULLIF(p_base32,''),
          two_factor_enabled = (p_base32 IS NOT NULL AND p_base32 <> '')
      WHERE id = p_user_id;
    END
    $fn$;
  `);

  await run('fn app_api.activate_user', `
    CREATE OR REPLACE FUNCTION app_api.activate_user(p_user_id integer)
    RETURNS TABLE (id integer, username text, is_active boolean)
    LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE cur record;
    BEGIN
      SELECT id, username, COALESCE(is_active,true) AS is_active
      INTO cur FROM public.users WHERE id = p_user_id FOR UPDATE;

      IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='P0005'; END IF;
      IF cur.is_active = TRUE THEN
        RAISE EXCEPTION 'active liği true olan bir kullanıcının active liği true olamaz' USING ERRCODE='P0004';
      END IF;

      UPDATE public.users
      SET is_active = TRUE, deleted_by=NULL, deleted_by_role=NULL, deleted_by_id=NULL, deleted_at=NULL
      WHERE id = p_user_id AND COALESCE(is_active, FALSE) = FALSE
      RETURNING id, username, is_active INTO id, username, is_active;

      RETURN NEXT;
    END
    $fn$;
  `);

  await run('fn app_api.hard_delete_user', `
    CREATE OR REPLACE FUNCTION app_api.hard_delete_user(p_user_id integer)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id integer;
    BEGIN
      SELECT id INTO v_id FROM public.users WHERE id = p_user_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='P0005'; END IF;
      DELETE FROM public.users WHERE id = p_user_id;
    END
    $fn$;
  `);

  // 10) unique index for supervisor totp norm hash (partial)
  await run('users_supervisor_totp_norm_uniq', `
    CREATE UNIQUE INDEX IF NOT EXISTS users_supervisor_totp_norm_uniq
      ON public.users (two_factor_norm_hash)
      WHERE role='supervisor' AND two_factor_norm_hash IS NOT NULL
  `);

  console.log('[DB] SQL helpers + TEXT(JSON) attachments kuruldu/migre edildi (adım adım).');
}


/* ===================== NOTIFY Dinleyicisi: TOTP şifrele ===================== */
let listenClient;
async function startTotpListener() {
  try {
    listenClient = await pool.connect();
    await listenClient.query('LISTEN encrypt_totp');
    listenClient.on('notification', async (msg) => {
      const id = parseInt(msg.payload, 10);
      if (!Number.isInteger(id)) return;
      try {
        const { rows } = await listenClient.query('SELECT two_factor_secret FROM users WHERE id=$1', [id]);
        if (!rows.length) return;
        const cur = rows[0].two_factor_secret;
        if (!cur || String(cur).startsWith('enc:v1:')) return;
        const enc = encSecret(cur);

        try {
          await listenClient.query('BEGIN');
          await listenClient.query(`SELECT set_config('app.bypass_totp_check','1',true)`);
          await listenClient.query('UPDATE users SET two_factor_secret=$1, two_factor_enabled=TRUE WHERE id=$2', [enc, id]);
          await listenClient.query('COMMIT');
          console.log(`[2FA] Kullanıcı #${id} için TOTP şifrelendi (NOTIFY).`);
        } catch (e) {
          try { await listenClient.query('ROLLBACK'); } catch {}
          console.error('[2FA] NOTIFY işleme hatası:', e);
        }
      } catch (e) {
        console.error('[2FA] NOTIFY işleme hatası:', e);
      }
    });
    listenClient.on('error', (e) => {
      console.error('[LISTEN] bağlantı hatası:', e);
      setTimeout(startTotpListener, 2000);
    });
    console.log('[LISTEN] encrypt_totp kanalına abone olundu.');
  } catch (e) {
    console.error('[LISTEN] kanal başlatılamadı:', e);
  }
}
startTotpListener();

/* ===================== Site config ===================== */
app.get('/api/config', (_req, res) => {
  res.json({
    siteTitle: process.env.SITE_TITLE || 'Afet Yönetimi',
    siteLogoUrl: process.env.SITE_LOGO_URL || '/afet_logo.png',
    allowedDomains: ALLOWED_EMAIL_DOMAINS.length > 0 ? ALLOWED_EMAIL_DOMAINS : null,
    allowedEmailDomains: ALLOWED_EMAIL_DOMAINS,
    pageSizeEvents: parseInt(process.env.TABLE_PAGE_SIZE_EVENTS || '0', 10),
    pageSizeTypes: parseInt(process.env.TABLE_PAGE_SIZE_TYPES || '0', 10),
    pageSizeUsers: parseInt(process.env.TABLE_PAGE_SIZE_USERS || '0', 10),
  });
});
/* ===================== AUTH ===================== */
async function failIfAnyDuplicate(usernameRaw, emailRaw) {
  const username = norm(usernameRaw);
  const email = norm(emailRaw);
  const q = `
    SELECT 1
    FROM users
    WHERE (lower(btrim(username))=lower($1) OR lower(btrim(email))=lower($2))
    LIMIT 1`;
  const r = await pool.query(q, [username, email]);
  if (r.rowCount) {
    const err = new Error('active_username_or_email_exists');
    err.code = 'ACTIVE_DUP';
    throw err;
  }
}

app.post('/api/auth/register', async (req, res) => {
  const username = norm(req.body?.username);
  const password = req.body?.password;
  const name = req.body?.name || null;
  const surname = req.body?.surname || null;
  const email = norm(req.body?.email);

  if (!username || !password || !email)
    return res.status(400).json({ error: 'eksik_bilgi', message: 'Kullanıcı adı, şifre ve e-posta zorunludur.' });
  if (!isStrongPassword(password))
    return res.status(400).json({ error: 'zayif_sifre', message: 'Zayıf şifre: En az 8 karakter, bir büyük, bir küçük harf ve bir sembol içermeli.' });
  if (!isEmailAllowed(email)) {
    let message = 'Geçerli formatta bir e-posta adresi giriniz.';
    if (ALLOWED_EMAIL_DOMAINS.length > 0) {
      if (ALLOWED_EMAIL_DOMAINS.length === 1) {
        message = `Yalnızca ${ALLOWED_EMAIL_DOMAINS[0]} alan adına sahip e-posta adresleriyle kayıt olunabilir.`;
      } else {
        message = `Yalnızca şu alan adlarına sahip e-posta adresleriyle kayıt olunabilir: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`;
      }
    }
    return res.status(400).json({
      error: 'gecersiz_eposta',
      message: message,
    });
  }

  try {
    await failIfAnyDuplicate(username, email);
  } catch (e) {
    if (e.code === 'ACTIVE_DUP')
      return res.status(409).json({ error: 'kullanici_veya_eposta_kayitli', message: 'Kullanıcı adı veya e-posta zaten kayıtlı.' });
    throw e;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const verifyToken = crypto.randomBytes(20).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(`SELECT set_config('app.password_plain', $1, true)`, [password]);

    const ins = await client.query(
      `INSERT INTO users (username, password_hash, role, name, surname, email, email_verified, is_verified, verify_token, verify_expires, is_active)
       VALUES ($1, crypt($2, gen_salt('bf',10)), 'user', $3, $4, $5, false, false, $6, $7, true)
       RETURNING id, username, email`,
      [username, password, name, surname, email, verifyToken, verifyExpires]
    );

    await client.query('COMMIT');

    if (transporter) {
      try {
        const verifyLink = `${req.protocol}://${req.get('host')}/api/auth/verify?token=${verifyToken}`;
        await transporter.sendMail({
          from: MAIL_FROM,
          to: email,
          subject: 'E-posta doğrulama',
          html: `<p>Merhaba <b>${username}</b>,</p><p>Hesabını doğrulamak için <a href="${verifyLink}">buraya tıkla</a>.</p><p>Bağlantı 24 saat geçerlidir.</p>`,
        });
      } catch (mailErr) {
        console.error('mail send error:', mailErr);
        if (!FORCE_EMAIL_VERIFY) {
          await pool.query('UPDATE users SET email_verified=true, is_verified=true, verify_token=null, verify_expires=null WHERE id=$1', [
            ins.rows[0].id,
          ]);
        } else {
          return res.status(500).json({ error: 'eposta_gonderilemedi', message: 'Doğrulama e-postası gönderilemedi.' });
        }
      }
    } else if (!FORCE_EMAIL_VERIFY) {
      await pool.query('UPDATE users SET email_verified=true, is_verified=true, verify_token=null, verify_expires=null WHERE id=$1', [
        ins.rows[0].id,
      ]);
    }

    res.json({
      ok: true,
      message: transporter || FORCE_EMAIL_VERIFY ? 'dogrulama_epostasi_gonderildi' : 'eposta_dogrulama_gerekmiyor',
      user: { id: ins.rows[0].id, username },
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('register error:', e);
    if (e.code === 'P0001' || e.code === 'P0002') return res.status(400).json({ error: 'gecersiz', message: e.message });
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  } finally {
    try { await client.query(`SELECT set_config('app.password_plain', NULL, true)`); } catch {}
    client.release();
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).send('Geçersiz bağlantı.');
  try {
    const { rows } = await pool.query('SELECT id, verify_expires FROM users WHERE verify_token=$1', [token]);
    if (!rows.length) return res.status(400).send('Geçersiz veya kullanılmış bağlantı.');
    if (new Date(rows[0].verify_expires) < new Date()) return res.status(400).send('Bağlantının süresi dolmuş.');

    await pool.query('UPDATE users SET email_verified=true, is_verified=true, verify_token=null, verify_expires=null WHERE id=$1', [
      rows[0].id,
    ]);
    res.send('E-posta doğrulandı. Giriş yapabilirsiniz.');
  } catch (e) {
    console.error('verify error:', e);
    res.status(500).send('Sunucu hatası.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password, totp } = req.body || {};
  if (!usernameOrEmail || !password)
    return res.status(400).json({ error: 'eksik_bilgi', message: 'Kullanıcı adı/e-posta ve şifre zorunludur.' });

  try {
    const input = norm(usernameOrEmail);
    const { rows } = await pool.query(
      `SELECT id, username, password_hash, role, email, email_verified,
              two_factor_enabled, two_factor_secret,
              COALESCE(is_active,true) AS is_active
       FROM users
       WHERE (lower(btrim(username))=lower($1) OR lower(btrim(email))=lower($1))
       ORDER BY id DESC
       LIMIT 1`,
      [input]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'hesap_bulunamadi', message: 'Hesabınız bulunamadı.' });
    }

    const u = rows[0];
    if (!u.is_active) return res.status(403).json({ error: 'kullanici_pasif', message: 'Kullanıcı pasif durumdadır.' });

    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'sifre_hatali', message: 'Şifreyi yanlış girdiniz.' });
    if (!u.email_verified) return res.status(403).json({ error: 'email_dogrulanmamış', message: 'E-posta doğrulanmamış. Lütfen e-postanızı doğrulayın.' });

    if (u.two_factor_enabled) {
      if (!u.two_factor_secret) return res.status(401).json({ error: 'totp_gerekli', message: 'TOTP kurulumu gerekiyor.' });
      if (!totp) return res.status(401).json({ error: 'totp_gerekli', message: 'Doğrulama kodu gerekli.' });

      const secretPlain = decSecret(String(u.two_factor_secret));
      const secretNorm = normalizeBase32(secretPlain);
      const secretB32 = padBase32(secretNorm);
      const tokenNorm = String(totp).replace(/\s+/g, '');

      const verified = !!secretB32 && speakeasy.totp.verify({
        secret: secretB32,
        encoding: 'base32',
        token: tokenNorm,
        digits: 6,
        step: 30,
        window: 2,
      });

      if (!verified) return res.status(401).json({ error: 'totp_gecersiz', message: 'Doğrulama kodu geçersiz.' });

      if (u.two_factor_secret && !String(u.two_factor_secret).startsWith('enc:v1:')) {
        const enc = encSecret(secretNorm);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.bypass_totp_check','1',true)`);
          await client.query('UPDATE users SET two_factor_secret=$1, two_factor_enabled=TRUE WHERE id=$2', [enc, u.id]);
          await client.query('COMMIT');
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          console.error('login-side totp encrypt error:', e);
        } finally {
          client.release();
        }
      }
    }

    const token = signToken(u);
    const homePath = (u.role === 'admin' || u.role === 'supervisor') ? '/admin' : '/';

    return res.json({
      ok: true,
      token,
      token_type: 'Bearer',
      home_path: homePath,
      user: { id: u.id, username: u.username, role: u.role, email: u.email }
    });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  }
});

app.post('/api/auth/remember', requireAuth, async (_req, res) => {
  return res.status(410).json({ ok: false, removed: true, message: 'remember_kaldirildi' });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOpts(0, req) });
  res.json({ ok: true });
});
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, me: req.user });
});

/* ===================== ŞİFREMİ UNUTTUM ===================== */
function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.post('/api/auth/forgot/start', async (req, res) => {
  const email = norm(req.body?.email);
  if (!email) return res.status(400).json({ error: 'eksik_bilgi', message: 'E-posta zorunludur.' });

  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, COALESCE(is_active,true) AS is_active FROM users WHERE lower(btrim(email))=lower($1) LIMIT 1',
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: 'kayitli_hesap_yok',
        message: 'Lütfen kayıtlı bir hesabın mail adresini giriniz.',
      });
    }

    const u = rows[0];

    if (!u.is_active) {
      return res.status(403).json({
        error: 'kullanici_pasif',
        message: 'Aktif bir kullanıcı giriniz.',
      });
    }

    const code = generateResetCode();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query('UPDATE users SET reset_code=$1, reset_expires=$2 WHERE id=$3', [code, expires, u.id]);

    if (transporter) {
      try {
        await transporter.sendMail({
          from: MAIL_FROM,
          to: u.email,
          subject: 'Şifre Sıfırlama Kodu',
          html: `<p>Merhaba <b>${u.username}</b>,</p>
                 <p>Şifre sıfırlama kodunuz: <b>${code}</b></p>
                 <p>Kod <b>5 dakika</b> boyunca geçerlidir.</p>`,
        });
      } catch (e) {
        console.error('reset mail error:', e);
        return res.status(500).json({ error: 'eposta_gonderilemedi', message: 'E-posta gönderilemedi.' });
      }
    }

    res.json({ ok: true, message: 'Kod gönderildi.' });
  } catch (e) {
    console.error('forgot/start error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  }
});

app.post('/api/auth/forgot/verify', async (req, res) => {
  const email = norm(req.body?.email);
  const code = norm(req.body?.code);
  if (!email || !code) return res.status(400).json({ error: 'eksik_bilgi', message: 'E-posta ve kod zorunludur.' });
  try {
    const { rows } = await pool.query('SELECT id, reset_code, reset_expires FROM users WHERE lower(btrim(email))=lower($1) LIMIT 1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'hesap_bulunamadi', message: 'Hesabınız bulunamadı.' });

    const u = rows[0];
    if (!u.reset_code || !u.reset_expires || new Date(u.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'kod_suresi_doldu', message: 'Kodun süresi dolmuş. Yeniden kod talep ediniz.' });
    }
    if (String(u.reset_code) !== String(code)) {
      return res.status(400).json({ error: 'kod_gecersiz', message: 'Doğrulama kodu hatalı.' });
    }
    res.json({ ok: true, verified: true });
  } catch (e) {
    console.error('forgot/verify error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  }
});

app.post('/api/auth/forgot/reset', async (req, res) => {
  const email = norm(req.body?.email);
  const code = norm(req.body?.code);
  const newPw = req.body?.new_password;
  const newPw2 = req.body?.new_password_confirm;

  if (!email || !code || !newPw || !newPw2) {
    return res.status(400).json({ error: 'eksik_bilgi', message: 'E-posta, kod ve yeni şifre alanları zorunludur.' });
  }
  if (newPw !== newPw2) {
    return res.status(400).json({ error: 'sifre_eslesmiyor', message: 'Yeni şifreler eşleşmiyor.' });
  }
  if (!isStrongPassword(newPw)) {
    return res.status(400).json({
      error: 'zayif_sifre',
      message: 'Zayıf şifre: En az 8 karakter, bir büyük, bir küçük harf ve bir sembol içermeli.'
    });
  }

  const client = await pool.connect();
  try {
    // 1) Kullanıcı ve kodu doğrula
    const { rows } = await client.query(
      'SELECT id, reset_code, reset_expires FROM users WHERE lower(btrim(email))=lower($1) LIMIT 1',
      [email]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'hesap_bulunamadi', message: 'Hesabınız bulunamadı.' });
    }

    const u = rows[0];
    if (!u.reset_code || !u.reset_expires || new Date(u.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'kod_suresi_doldu', message: 'Kodun süresi dolmuş. Yeniden kod talep ediniz.' });
    }
    if (String(u.reset_code) !== String(code)) {
      return res.status(400).json({ error: 'kod_gecersiz', message: 'Doğrulama kodu hatalı.' });
    }

    // 2) Transaction içinde GUC ayarla + tetikleyici erişimini garantile + güncelle
    await client.query('BEGIN');

    // a) Parolayı tetikleyiciye göstermek için session-local GUC olarak ata
    // (SET LOCAL parametre kabul etmediği için güvenli yoldan set_config kullanıyoruz)
    await client.query(`SELECT set_config('app.password_plain', $1, true)`, [newPw]);

    // b) Tetikleyici tarafının görebildiğini *özellikle* doğrula (NULL ise aynı P0001’i üretir)
    // Bu adım isteğe bağlı ama üretimde sebebi hızlı teşhis etmemizi sağlar.
    await client.query(
      `DO $blk$
       BEGIN
         PERFORM app_api._check_password_policy(current_setting('app.password_plain', true));
       END
       $blk$;`
    );

    // c) Şifreyi güncelle + reset_code alanlarını temizle (tek UPDATE; tetikleyici BEFORE aşamasında çalışır)
    await client.query(
      `UPDATE users
         SET password_hash = crypt(current_setting('app.password_plain', true), gen_salt('bf',10)),
             reset_code    = NULL,
             reset_expires = NULL
       WHERE id = $1`,
      [u.id]
    );

    await client.query('COMMIT');

    return res.json({ ok: true, message: 'Şifrenizi sıfırladınız. Giriş yapabilirsiniz.' });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    // Tetikleyici P0001 üretirse bunu kullanıcıya düzgün döndür.
    if (e && (e.code === 'P0001' || e.code === 'P0002')) {
      return res.status(400).json({ error: 'gecersiz', message: e.message });
    }
    console.error('forgot/reset error:', e);
    return res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  } finally {
    // GUC’u temizle (her ihtimale karşı)
    try { await client.query(`SELECT set_config('app.password_plain', NULL, true)`); } catch {}
    client.release();
  }
});


/* ===================== Public  ===================== */
app.get('/api/olaylar', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT o_id, o_adi, created_by_id, created_by_name 
      FROM olaylar 
      WHERE COALESCE(active,true)=true 
      ORDER BY o_id
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('GET /api/olaylar error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Olay türleri çekilemedi.' });
  }
});

app.get('/api/olaylar_tum', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `
      SELECT
        o.olay_id,
        o.enlem,
        o.boylam,
        o.olay_turu AS olay_turu_id,
        l.o_adi     AS olay_turu_adi,
        o.aciklama,
        o.created_by_id              AS created_by_id,
        o.created_by_name            AS created_by_username,
        o.created_at,
        o.photo_urls,
        o.video_urls,
        ((o.created_by_id = $1) OR (o.created_by_name = $2)) AS is_mine
      FROM olay o
      LEFT JOIN olaylar l ON l.o_id = o.olay_turu
      WHERE COALESCE(o.active, true) = true
      ORDER BY o.olay_id DESC
      `,
      [req.user?.id || 0, req.user?.username || '']
    );

    const rows = r.rows.map((row) => ({
      ...row,
      photo_urls: parseJsonText(row.photo_urls),
      video_urls: parseJsonText(row.video_urls),
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/olaylar_tum error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'Sunucu hatası' });
  }
});

/* =============== QField: GeoJSON =============== */
app.get('/api/qfield/olaylar', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        o.olay_id,
        o.enlem, o.boylam,
        o.aciklama,
        o.olay_turu,
        l.o_adi AS olay_turu_adi,
        o.photo_urls,
        o.video_urls,
        o.created_by_id,
        o.created_by_name
      FROM olay o
      LEFT JOIN olaylar l ON l.o_id = o.olay_turu
      WHERE COALESCE(o.active,true)=true
      ORDER BY o.olay_id DESC
    `);

    const features = r.rows.map((row) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(row.boylam), Number(row.enlem)]
      },
      properties: {
        olay_id: row.olay_id,
        olay_turu_id: row.olay_turu,
        olay_turu_adi: row.olay_turu_adi,
        aciklama: row.aciklama,
        created_by_id: row.created_by_id,
        created_by_username: row.created_by_name,
        photo_urls: parseJsonText(row.photo_urls),
        video_urls: parseJsonText(row.video_urls)
      }
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (e) {
    console.error('GET /api/qfield/olaylar error:', e);
    res.status(500).json({ error: 'sunucu_hatasi', message: 'GeoJSON oluşturulamadı.' });
  }
});

/* ===================== Olay Ekleme / Güncelleme (TEXT JSON) ===================== */
app.post('/api/submit_olay', requireAuth, async (req, res) => {
  try {
    const { p_id, olay_turu, aciklama, enlem, boylam } = req.body || {};
    const lat = parseFloat(enlem), lng = parseFloat(boylam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      return res.status(400).json({ error: 'gecersiz_koordinat', message: 'Koordinatlar eksik ya da hatalı' });

    let olayTuruId = null;
    if (olay_turu !== '' && olay_turu != null) {
      const asNum = parseInt(olay_turu, 10);
      if (!Number.isNaN(asNum)) {
        const t = await pool.query('SELECT 1 FROM olaylar WHERE o_id=$1 AND COALESCE(active,true)=true', [asNum]);
        if (!t.rowCount) return res.status(400).json({ error: 'gecersiz_olay_turu', message: 'Geçersiz/kapalı olay türü' });
        olayTuruId = asNum;
      } else {
        const q = await pool.query('SELECT o_id FROM olaylar WHERE o_adi=$1 AND COALESCE(active,true)=true', [String(olay_turu)]);
        if (!q.rowCount) return res.status(400).json({ error: 'gecersiz_olay_turu', message: 'Geçersiz olay türü' });
        olayTuruId = q.rows[0].o_id;
      }
    }

    const photoIncoming = req.body?.photo_urls ?? req.body?.photo ?? req.body?.photo_attachments ?? null;
    const videoIncoming = req.body?.video_urls ?? req.body?.video ?? req.body?.video_attachments ?? null;

    const photoUrls = normalizeIncomingToUrlArray(photoIncoming, 'photo');
    const videoUrls = normalizeIncomingToUrlArray(videoIncoming, 'video');

    const ins = await pool.query(
      `INSERT INTO olay (enlem, boylam, olay_turu, aciklama, geom,
                         created_by_name, created_by_role_name, created_by_id, active,
                         photo_urls, video_urls)
       VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($2,$1),4326),
               $5, $6, $7, true,
               $8::text, $9::text)
       RETURNING olay_id`,
      [lat, lng, olayTuruId, aciklama ?? null, req.user.username, req.user.role, req.user.id, toJsonText(photoUrls), toJsonText(videoUrls)]
    );
    const olay_id = ins.rows[0].olay_id;

    const pId = p_id === '' || p_id == null ? null : parseInt(p_id, 10);
    if (Number.isInteger(pId)) await pool.query('INSERT INTO kayit (p_id, olay_id) VALUES ($1,$2)', [pId, olay_id]);

    res.json({ success: true, olay_id, photo_urls: photoUrls, video_urls: videoUrls });
  } catch (e) {
    console.error('submit_olay error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.patch('/api/olay/:id', requireAuth, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });

  if (req.user.role === 'supervisor') {
    return res.status(403).json({ error: 'yetkisiz', message: 'Supervisor güncelleme yapamaz.' });
  }

  const { enlem, boylam, olay_turu, aciklama } = req.body || {};
  const fields = [];
  const vals = [];
  let idx = 1;

  if (enlem != null) { fields.push(`enlem=$${idx++}`); vals.push(parseFloat(enlem)); }
  if (boylam != null) { fields.push(`boylam=$${idx++}`); vals.push(parseFloat(boylam)); }

  if (req.body?.photo_urls !== undefined || req.body?.photo !== undefined || req.body?.photo_attachments !== undefined) {
    const photoIncoming = req.body?.photo_urls ?? req.body?.photo ?? req.body?.photo_attachments ?? [];
    const photos = normalizeIncomingToUrlArray(photoIncoming, 'photo');
    fields.push(`photo_urls=$${idx++}::text`); vals.push(toJsonText(photos));
  }
  if (req.body?.video_urls !== undefined || req.body?.video !== undefined || req.body?.video_attachments !== undefined) {
    const videoIncoming = req.body?.video_urls ?? req.body?.video ?? req.body?.video_attachments ?? [];
    const videos = normalizeIncomingToUrlArray(videoIncoming, 'video');
    fields.push(`video_urls=$${idx++}::text`); vals.push(toJsonText(videos));
  }

  if (olay_turu !== undefined) {
    if (olay_turu === '' || olay_turu == null) {
      fields.push(`olay_turu=NULL`);
    } else {
      const asNum = parseInt(olay_turu, 10);
      if (Number.isNaN(asNum)) return res.status(400).json({ error: 'gecersiz_olay_turu', message: 'Geçersiz olay_turu' });
      const t = await pool.query('SELECT 1 FROM olaylar WHERE o_id=$1 AND COALESCE(active,true)=true', [asNum]);
      if (!t.rowCount) return res.status(400).json({ error: 'gecersiz_olay_turu', message: 'Geçersiz/kapalı olay_turu' });
      fields.push(`olay_turu=$${idx++}`);
      vals.push(asNum);
    }
  }
  if (aciklama !== undefined) {
    fields.push(`aciklama=$${idx++}`);
    vals.push(aciklama ?? null);
  }
  if (fields.length === 0) return res.status(400).json({ error: 'alan_yok', message: 'Güncellenecek alan yok.' });

  if (enlem != null || boylam != null) {
    const lat = enlem != null ? parseFloat(enlem) : null;
    const lng = boylam != null ? parseFloat(boylam) : null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      fields.push(`geom=ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)`);
    }
  }

  try {
    let where = `olay_id=$${idx++} AND COALESCE(active,true)=true`;
    vals.push(id);

    const q = `UPDATE olay SET ${fields.join(', ')} WHERE ${where} RETURNING olay_id, photo_urls, video_urls`;
    const r = await pool.query(q, vals);
    if (!r.rowCount) return res.status(404).json({ error: 'bulunamadi', message: 'Kayıt bulunamadı veya yetkiniz yok.' });

    res.json({
      ok: true,
      olay_id: r.rows[0].olay_id,
      photo_urls: parseJsonText(r.rows[0].photo_urls),
      video_urls: parseJsonText(r.rows[0].video_urls)
    });
  } catch (e) {
    console.error('update olay error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.delete('/api/olay/:id', requireAuth, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.actor_name',$1,true),
              set_config('app.actor_role',$2,true),
              set_config('app.actor_id',$3,true)`,
      [req.user.username, req.user.role, String(req.user.id)]
    );

    const r = await client.query(
      `UPDATE olay
       SET active=false,
           deactivated_by_name=$2,
           deactivated_by_role_name=$3,
           deactivated_by_id=$4,
           deactivated_at=NOW()
       WHERE olay_id=$1 AND COALESCE(active,true)=true
       RETURNING olay_id`,
      [id, req.user.username, req.user.role, req.user.id]
    );
    await client.query('COMMIT');

    if (!r.rowCount) return res.status(404).json({ error: 'bulunamadi', message: 'Kayıt bulunamadı.' });
    res.set('X-UI-Remove', '1');
    res.json({ ok: true, olay_id: r.rows[0].olay_id, ui_remove: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('delete olay error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  } finally {
    client.release();
  }
});

/* ===================== Admin / Supervisor ===================== */
const adminOnly = [requireAuth, requireAnyRole(['admin', 'supervisor'])];
app.post('/api/admin/olaylar', adminOnly, async (req, res) => {
  const o_adi = norm(req.body?.o_adi);
  if (!o_adi) return res.status(400).json({ error: 'o_adi_gerekli', message: 'Olay türü adı zorunludur.' });
  try {
    // Aynı isimde aktif veya pasif kayıt var mı kontrol et
    const existing = await pool.query(
      `SELECT o_id, active FROM olaylar WHERE LOWER(o_adi) = LOWER($1)`,
      [o_adi]
    );
    
    if (existing.rowCount > 0) {
      const status = existing.rows[0].active ? 'aktif' : 'pasif';
      return res.status(409).json({ 
        error: 'duplicate_olay_turu',
        message: `Aynı ad ile olay türü ekleyemezsiniz (${status} bir kayıt mevcut)`
      });
    }
    
    const r = await pool.query(
      `INSERT INTO olaylar (o_adi, active, created_by_name, created_by_role_name, created_by_id)
       VALUES ($1, true, $2, $3, $4)
       RETURNING o_id,o_adi,created_by_name,created_by_id,created_at`,
      [o_adi, req.user.username, req.user.role, req.user.id]
    );
    res.json({ ok: true, created: r.rows[0] });
  } catch (e) {
    console.error('admin add olaylar error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.patch('/api/admin/olaylar/:id', adminOnly, async (req, res) => {
  const id = +req.params.id;
  const o_adi = norm(req.body?.o_adi);
  if (!Number.isInteger(id) || !o_adi) {
    return res.status(400).json({ error: 'gecersiz_istek', message: 'Geçersiz istek' });
  }
  
  try {
    const existing = await pool.query('SELECT * FROM olaylar WHERE o_id = $1', [id]);
    
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'bulunamadi', message: 'Olay türü bulunamadı' });
    }
    
    if (req.user.role === 'supervisor' && existing.rows[0].created_by_id !== req.user.id) {
      return res.status(403).json({ error: 'yetkisiz', message: 'Bu olay türünü güncelleme yetkiniz yok' });
    }
    
    const duplicate = await pool.query(
      'SELECT * FROM olaylar WHERE o_adi = $1 AND o_id != $2 AND COALESCE(active,true)=true',
      [o_adi, id]
    );
    
    if (duplicate.rowCount) {
      return res.status(400).json({ error: 'isim_mevcut', message: 'Bu isimde bir olay türü zaten mevcut' });
    }
    
    const r = await pool.query(
      'UPDATE olaylar SET o_adi = $1, created_at = NOW() WHERE o_id = $2 RETURNING o_id, o_adi, created_at',
      [o_adi, id]
    );
    
    res.json({ ok: true, message: 'Olay türü güncellendi', updated: r.rows[0] });
  } catch (e) {
    console.error('admin patch olaylar error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});
app.delete('/api/admin/olaylar/:id', adminOnly, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `SELECT set_config('app.actor_name',$1,true),
                set_config('app.actor_role',$2,true),
                set_config('app.actor_id',$3,true)`,
        [req.user.username, req.user.role, String(req.user.id)]
      );

      // Supervisor ise sadece kendi oluşturduğu türleri silebilir
      let whereClause = 'o_id=$1 AND COALESCE(active,true)=true';
      const params = [id, req.user.username, req.user.role, req.user.id];
      
      if (req.user.role === 'supervisor') {
        whereClause += ' AND (created_by_id=$5 OR (created_by_id IS NULL AND created_by_name=$2))';
        params.push(req.user.id);
      }

      const rType = await client.query(
        `UPDATE olaylar
         SET active=false,
             deactivated_by_name=$2,
             deactivated_by_role_name=$3,
             deactivated_by_id=$4,
             deactivated_at=NOW()
         WHERE ${whereClause}
         RETURNING o_id`,
        params
      );
      
      if (!rType.rowCount) {
        await client.query('ROLLBACK');
        const msg = req.user.role === 'supervisor' 
          ? 'Kayıt bulunamadı, pasif veya size ait değil.' 
          : 'Kayıt bulunamadı veya zaten pasif.';
        return res.status(404).json({ error: 'bulunamadi_veya_pasif', message: msg });
      }

      const rOlay = await client.query(
        `UPDATE olay
         SET active=false,
             deactivated_by_name=$2,
             deactivated_by_role_name=$3,
             deactivated_by_id=$4,
             deactivated_at=NOW()
         WHERE olay_turu=$1 AND COALESCE(active,true)=true
         RETURNING olay_id`,
        [id, req.user.username, req.user.role, req.user.id]
      );

      await client.query('COMMIT');
      res.json({ ok: true, cascaded: true, deactivatedTypeId: id, deactivatedOlayCount: rOlay.rowCount });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('admin delete olaylar error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.delete('/api/admin/olay/:id', adminOnly, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.actor_name',$1,true),
                set_config('app.actor_role',$2,true),
                set_config('app.actor_id',$3,true)`,
        [req.user.username, req.user.role, String(req.user.id)]
      );

      const r = await client.query(
        `UPDATE olay
         SET active=false,
             deactivated_by_name=$2,
             deactivated_by_role_name=$3,
             deactivated_by_id=$4,
             deactivated_at=NOW()
         WHERE olay_id=$1 AND COALESCE(active,true)=true
         RETURNING olay_id`,
        [id, req.user.username, req.user.role, req.user.id]
      );
      await client.query('COMMIT');

      if (!r.rowCount) return res.status(404).json({ error: 'bulunamadi', message: 'Kayıt bulunamadı.' });
      res.set('X-UI-Remove', '1');
      res.json({ ok: true, deletedId: id, ui_remove: true });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('admin delete olay error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.get('/api/admin/users', adminOnly, async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '0') === '1';
    res.set('Cache-Control', 'no-store');

    const where = includeInactive ? 'TRUE' : 'COALESCE(is_active,true)=true';
    const { rows } = await pool.query(
      `SELECT id, username, name, surname, email, role, email_verified, is_verified,
              COALESCE(is_active, true) AS is_active, deleted_by, deleted_by_role, deleted_by_id, deleted_at
       FROM users
       WHERE ${where}
       ORDER BY id`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/admin/users error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.post('/api/admin/users', adminOnly, async (req, res) => {
  const username = norm(req.body?.username);
  const password = req.body?.password;
  const role = req.body?.role;
  const name = req.body?.name || null;
  const surname = req.body?.surname || null;
  const email = norm(req.body?.email);
  const base32Raw = norm(req.body?.BASE32Code || req.body?.base32 || req.body?.base32Code || req.body?.totp || '');

  if (!username || !password || !role || !email) return res.status(400).json({ error: 'gecersiz_istek', message: 'Zorunlu alanlar eksik.' });
  if (!['supervisor', 'admin', 'user'].includes(role)) return res.status(400).json({ error: 'gecersiz_rol', message: 'Geçersiz rol.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'zayif_sifre', message: 'Zayıf şifre.' });
  if (!isEmailAllowed(email)) {
    let message = 'Geçerli formatta bir e-posta adresi giriniz.';
    if (ALLOWED_EMAIL_DOMAINS.length > 0) {
      if (ALLOWED_EMAIL_DOMAINS.length === 1) {
        message = `Yalnızca ${ALLOWED_EMAIL_DOMAINS[0]} alan adına sahip e-posta adresleriyle kayıt olunabilir.`;
      } else {
        message = `Yalnızca şu alan adlarına sahip e-posta adresleriyle kayıt olunabilir: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`;
      }
    }
    return res.status(400).json({
      error: 'gecersiz_eposta',
      message: message,
    });
  }

  try {
    await failIfAnyDuplicate(username, email);
  } catch (e) {
    if (e.code === 'ACTIVE_DUP')
      return res.status(409).json({ error: 'kullanici_veya_eposta_kayitli', message: 'Kullanıcı adı veya e-posta zaten kayıtlı.' });
    throw e;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.password_plain', $1, true)`, [password]);

    const hashPw = await bcrypt.hash(password, 10);

    let twoFactorSecretPlain = null;
    let twoFactorEnabled = false;
    if (role === 'supervisor' && base32Raw) {
      twoFactorSecretPlain = normalizeBase32(base32Raw);
      twoFactorEnabled = true;
    }

    const r = await client.query(
      `INSERT INTO users (username, password_hash, role, name, surname, email, email_verified, is_verified, is_active,
                          two_factor_secret, two_factor_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,true,true,true,$7,$8)
       RETURNING id, username, role`,
      [username, hashPw, role, name, surname, email, twoFactorSecretPlain, twoFactorEnabled]
    );

    await client.query('COMMIT');
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e.code === 'P0001' || e.code === 'P0002' || e.code === 'P0003') {
      return res.status(400).json({ error: 'gecersiz', message: e.message });
    }
    if (e.code === '23505') {
      return res.status(409).json({ error: 'base32_cakisma', message: 'BASE32 CODE aynı. Lütfen BASE32CODE unu değiştirin.' });
    }
    console.error('admin create user error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  } finally {
    try { await client.query(`SELECT set_config('app.password_plain', NULL, true)`); } catch {}
    client.release();
  }
});

app.delete('/api/admin/users/:id', adminOnly, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const u = await client.query('SELECT id, username, role FROM users WHERE id=$1', [id]);
    if (!u.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'bulunamadi', message: 'Kullanıcı bulunamadı.' });
    }
    const victimId = u.rows[0].id;
    const victimUsername = u.rows[0].username;
    const victimRole = u.rows[0].role;

    // Supervisor kısıtlaması: supervisor sadece kendisini veya user rolündekileri silebilir
    if (req.user.role === 'supervisor') {
      const isSelf = victimId === req.user.id;
      if (!isSelf && victimRole === 'supervisor') {
        await client.query('ROLLBACK');
        return res.status(403).json({ 
          error: 'yetkisiz', 
          message: 'Supervisor sadece kendisini veya user rolündeki kullanıcıları silebilir.' 
        });
      }
    }

    await client.query(
      `SELECT set_config('app.actor_name',$1,true),
              set_config('app.actor_role',$2,true),
              set_config('app.actor_id',$3,true)`,
      [req.user.username, req.user.role, String(req.user.id)]
    );

    const r = await client.query(
      `UPDATE users
       SET is_active=false,
           deleted_by=$2,
           deleted_by_role=$3,
           deleted_by_id=$4,
           deleted_at=NOW()
       WHERE id=$1 AND COALESCE(is_active,true)=true
       RETURNING id`,
      [victimId, req.user.username, req.user.role, req.user.id]
    );
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'bulunamadi_veya_pasif', message: 'Kullanıcı bulunamadı veya zaten pasif.' });
    }

// 1) Her durumda: kullanıcının KENDİ OLUŞTURDUĞU olayları pasifle
    // (Hangi türden olursa olsun, onu ekleyen kişi siliniyorsa o olay pasifleşir)
    await client.query(
      `UPDATE olay
       SET active=false,
           deactivated_by_name=$3,
           deactivated_by_role_name=$4,
           deactivated_by_id=$5,
           deactivated_at=NOW()
       WHERE COALESCE(active,true)=true
         AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))`,
      [victimId, victimUsername, req.user.username, req.user.role, req.user.id]
    );

    // 2) SADECE supervisor ise: 
    //    a) Onun oluşturduğu olay türlerini pasifle
    //    b) O türlere başkaları tarafından eklenen olayları DOKUNMA (aktif kalsın)
    if (victimRole === 'supervisor') {
      // Önce supervisor'ın oluşturduğu tür ID'lerini al
      const typeResult = await client.query(
        `SELECT o_id FROM olaylar 
         WHERE COALESCE(active,true)=true
           AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))`,
        [victimId, victimUsername]
      );
      
      const typeIds = typeResult.rows.map(r => r.o_id);

      // Türleri pasifleştir
      if (typeIds.length > 0) {
        await client.query(
          `UPDATE olaylar
           SET active=false,
               deactivated_by_name=$2,
               deactivated_by_role_name=$3,
               deactivated_by_id=$4,
               deactivated_at=NOW()
           WHERE o_id = ANY($1::int[])`,
          [typeIds, req.user.username, req.user.role, req.user.id]
        );

        // SADECE bu türlere AİT ve SUPERVISOR'IN KENDİSİNİN EKLEDİĞİ olayları pasifleştir
        // (Başkaları tarafından eklenen olaylar aktif kalacak)
        await client.query(
          `UPDATE olay
           SET active=false,
               deactivated_by_name=$4,
               deactivated_by_role_name=$5,
               deactivated_by_id=$6,
               deactivated_at=NOW()
           WHERE COALESCE(active,true)=true
             AND olay_turu = ANY($1::int[])
             AND (created_by_id=$2 OR (created_by_id IS NULL AND created_by_name=$3))`,
          [typeIds, victimId, victimUsername, req.user.username, req.user.role, req.user.id]
        );
      }
    }

    // 3) Meta doldurma: pasif edilmiş ama meta'sı boş kayıtlar için (olay)
    await client.query(
      `UPDATE olay
       SET deactivated_by_name=$3,
           deactivated_by_role_name=$4,
           deactivated_by_id=$5,
           deactivated_at=COALESCE(deactivated_at, NOW())
       WHERE COALESCE(active,false)=false
         AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))
         AND (deactivated_by_name IS NULL OR deactivated_by_role_name IS NULL OR deactivated_by_id IS NULL)`,
      [victimId, victimUsername, req.user.username, req.user.role, req.user.id]
    );

    // 4) Meta doldurma: SADECE supervisor ise pasif edilmiş türlerde de meta'yı tamamla
    if (victimRole === 'supervisor') {
      await client.query(
        `UPDATE olaylar
         SET deactivated_by_name=$3,
             deactivated_by_role_name=$4,
             deactivated_by_id=$5,
             deactivated_at=COALESCE(deactivated_at, NOW())
         WHERE COALESCE(active,false)=false
           AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))
           AND (deactivated_by_name IS NULL OR deactivated_by_role_name IS NULL OR deactivated_by_id IS NULL)`,
        [victimId, victimUsername, req.user.username, req.user.role, req.user.id]
      );
    }


    await client.query('COMMIT');

    const isSelf = req.user && Number(req.user.id) === victimId;
    if (isSelf) {
      res.clearCookie('token', cookieOpts(0, req));
      res.set('X-Logged-Out', '1');
    }
    // UI: İsteğe bağlı ön-yüz sinyalleri (kullanmasan da mevcut mantığı bozmaz)
    res.set('X-UI-Remove', '1');
    res.set('X-Data-Changed', 'users,olay,olaylar');
    res.set('X-UI-Refetch', '/api/olaylar_tum,/api/olaylar,/api/admin/users');

    return res.json({
      ok: true,
      deletedId: victimId,
      selfDeleted: !!isSelf,
      loggedOut: !!isSelf,
      ui_remove: true,
      message: isSelf ? 'Kendinizi sildiniz, giriş ekranına yönlendiriliyorsunuz.' : 'Kullanıcı pasifleştirildi.',
      // Ön yüz isterse kullanır:
      data_changed: ['users','olay','olaylar'],
      refetch: ['/api/olaylar_tum','/api/olaylar','/api/admin/users']
    });

  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('admin delete user error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  } finally {
    try {
      await pool.query(
        `SELECT set_config('app.actor_name',NULL,true); SELECT set_config('app.actor_role',NULL,true); SELECT set_config('app.actor_id',NULL,true);`
      );
    } catch {}
    client.release();
  }
});

app.post('/api/admin/users/:id/activate', adminOnly, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let activated;
    try {
      const r = await client.query('SELECT * FROM app_api.activate_user($1)', [id]);
      activated = r.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === 'P0005') return res.status(404).json({ error: 'bulunamadi', message: 'Kullanıcı bulunamadı.' });
      if (e.code === 'P0004')
        return res.status(409).json({ error: 'zaten_aktif', message: 'active liği true olan bir kullanıcının active liği true olamaz' });
      if (e.code === 'P0006') return res.status(404).json({ error: 'bulunamadi_veya_zaten_aktif', message: 'Kullanıcı bulunamadı veya zaten aktif.' });
      throw e;
    }

    const u = await client.query('SELECT id, username, role FROM users WHERE id=$1', [activated.id]);
    const username = u.rows[0].username;
    const role = u.rows[0].role;

    const rRestore = await client.query(
      `UPDATE olay
       SET active=true,
           deactivated_by_name=NULL,
           deactivated_by_role_name=NULL,
           deactivated_by_id=NULL,
           deactivated_at=NULL
       WHERE COALESCE(active,false)=false
         AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))`,
      [activated.id, username]
    );

    let restoredTypes = 0;
    if (role === 'supervisor') {
      const t = await client.query(
        `UPDATE olaylar
         SET active=true,
             deactivated_by_name=NULL,
             deactivated_by_role_name=NULL,
             deactivated_by_id=NULL,
             deactivated_at=NULL
         WHERE COALESCE(active,false)=false
           AND (created_by_id=$1 OR (created_by_id IS NULL AND created_by_name=$2))`,
        [activated.id, username]
      );
      restoredTypes = t.rowCount;
    }

    await client.query('COMMIT');
    res.json({ ok: true, reactivatedUserId: activated.id, restoredOlayCount: rRestore.rowCount, restoredOlayTypeCount: restoredTypes });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('admin activate user error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  } finally {
    client.release();
  }
});

app.post('/api/admin/users/:id/totp', adminOnly, async (req, res) => {
  const id = +req.params.id;
  const base32 = norm(req.body?.base32 || req.body?.BASE32Code || req.body?.base32Code || req.body?.totp);
  if (!Number.isInteger(id) || !base32) return res.status(400).json({ error: 'gecersiz_istek', message: 'Geçersiz istek' });
  try {
    const base32Norm = normalizeBase32(base32);
    await pool.query('UPDATE users SET two_factor_secret=$1, two_factor_enabled=TRUE WHERE id=$2', [base32Norm, id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505' || e.code === 'P0003') {
      return res.status(409).json({
        error: 'base32_cakisma',
        message: 'BASE32 CODE aynı. Lütfen BASE32CODE’unu değiştirin.',
      });
    }
    console.error('admin set totp error:', e);
    res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

app.delete('/api/admin/users/:id/hard', adminOnly, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'gecersiz_id', message: 'Geçersiz ID' });

  try {
    await pool.query('SELECT app_api.hard_delete_user($1)', [id]);
    return res.json({ ok: true, hardDeletedId: id });
  } catch (e) {
    if (e.code === 'P0005') {
      return res.status(404).json({ error: 'bulunamadi', message: 'Kullanıcı bulunamadı, silme yapılmadı.' });
    }
    console.error('hard delete user error:', e);
    return res.status(500).json({ error: 'veritabani_hatasi', message: 'Veritabanı hatası' });
  }
});

/* ===================== Upload Uçları ===================== */
app.post('/api/upload/photo', requireAuth, upload.array('files', 10), (req, res) => {
  try {
    if (req.files && req.files.length) {
      const urls = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
      return res.json({ ok: true, urls, url: urls[0] || null });
    }
    if (req.is('application/json') && req.body && req.body.dataUrl) {
      const url = saveDataUrlToUploads(req.body.dataUrl, 'photo');
      return res.json({ ok: true, urls: [url], url });
    }
    return res.status(400).json({ error: 'yukleme_hatasi', message: 'Geçersiz içerik.' });
  } catch (e) {
    console.error('upload photo error:', e);
    res.status(400).json({ error: 'yukleme_hatasi', message: 'Fotoğraf yüklenemedi.' });
  }
});

app.post('/api/upload/video', requireAuth, upload.array('files', 10), (req, res) => {
  try {
    if (req.files && req.files.length) {
      const urls = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
      return res.json({ ok: true, urls, url: urls[0] || null });
    }
    if (req.is('application/json') && req.body && req.body.dataUrl) {
      const url = saveDataUrlToUploads(req.body.dataUrl, 'video');
      return res.json({ ok: true, urls: [url], url });
    }
    return res.status(400).json({ error: 'yukleme_hatasi', message: 'Geçersiz içerik.' });
  } catch (e) {
    console.error('upload video error:', e);
    res.status(400).json({ error: 'yukleme_hatasi', message: 'Video yüklenemedi.' });
  }
});

/* ===================== Health ===================== */
app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.set('Content-Type', 'text/plain').send('OK');
  } catch {
    res.status(500).send('DB NOK');
  }
});

/* ===================== SPA fallback ===================== */
app.get(
  ['/login', '/register', '/forgot', '/admin', '/supervisor', '/panel', '/dashboard'],
  (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
);

/* ===================== Server ===================== */
const server = app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
startQFieldIngestLoop();
const shutdown = async () => {
  try { if (listenClient) listenClient.release(); } catch {}
  try { await pool.end(); } catch {}
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
