

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Personel (eski/demo)
CREATE TABLE IF NOT EXISTS personel (
  p_id SERIAL PRIMARY KEY,
  adi VARCHAR(50) NOT NULL,
  soyadi VARCHAR(50) NOT NULL,
  parola VARCHAR(5) NOT NULL
);

-- Kullanıcılar (uygulamadaki hesaplar)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('supervisor','admin','user')),
  name VARCHAR(50),
  surname VARCHAR(50),
  email VARCHAR(120) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  verify_token TEXT,
  verify_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Olay türleri
CREATE TABLE IF NOT EXISTS olaylar (
  o_id  SERIAL PRIMARY KEY,
  o_adi VARCHAR(25) UNIQUE NOT NULL
);

-- Olaylar
-- NOT: Eğer tablo zaten varsa, aşağıdaki ALTER'lar ile yeni sütunlar eklenir.
CREATE TABLE IF NOT EXISTS olay (
  olay_id   SERIAL PRIMARY KEY,
  enlem     DOUBLE PRECISION NOT NULL,
  boylam    DOUBLE PRECISION NOT NULL,
  olay_turu INT REFERENCES olaylar(o_id),
  aciklama  TEXT,
  geom      geometry(Point, 4326) NOT NULL,
  -- yeni alanlar:
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_by_display TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_by INT REFERENCES users(id) ON DELETE SET NULL,
  deactivated_by_display TEXT,
  deactivated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Eğer olay tablosu daha önceden var ise; eksik kolonları ekle
ALTER TABLE olay
  ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_display TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deactivated_by INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by_display TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Geometri indeksi
CREATE INDEX IF NOT EXISTS idx_olay_geom     ON olay USING GIST (geom);
-- Kullanışlı ek indeksler
CREATE INDEX IF NOT EXISTS idx_olay_active   ON olay (is_active);
CREATE INDEX IF NOT EXISTS idx_olay_creator  ON olay (created_by);
CREATE INDEX IF NOT EXISTS idx_olay_tur      ON olay (olay_turu);

-- Kayıt (eski/demo ilişki)
CREATE TABLE IF NOT EXISTS kayit (
  p_id INT REFERENCES personel(p_id),
  olay_id INT REFERENCES olay(olay_id),
  kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (p_id, olay_id, kayit_tarihi)
);

-- Eski demo tablo
CREATE TABLE IF NOT EXISTS olay_detay (
  id SERIAL PRIMARY KEY,
  personel_id VARCHAR(50) NOT NULL,
  kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  olay_turu VARCHAR(50) NOT NULL
);

-- =========================
--  Yabancı anahtarların CASCADE/SET NULL ayarlanması
-- =========================

-- olay.olay_turu -> olaylar.o_id  (TÜR silinince bağlı olaylar da silinsin)
DO $$
DECLARE fk text;
BEGIN
  SELECT conname INTO fk FROM pg_constraint
  WHERE conrelid='public.olay'::regclass AND confrelid='public.olaylar'::regclass
    AND contype='f' LIMIT 1;
  IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE public.olay DROP CONSTRAINT %I', fk); END IF;

  EXECUTE 'ALTER TABLE public.olay
           ADD CONSTRAINT olay_olay_turu_fkey
           FOREIGN KEY (olay_turu) REFERENCES public.olaylar(o_id) ON DELETE CASCADE';
END $$;

-- kayit.olay_id -> olay.olay_id  (OLAY silinince kayit satırları silinsin)
DO $$
DECLARE fk text;
BEGIN
  SELECT conname INTO fk FROM pg_constraint
  WHERE conrelid='public.kayit'::regclass AND confrelid='public.olay'::regclass
    AND contype='f' LIMIT 1;
  IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE public.kayit DROP CONSTRAINT %I', fk); END IF;

  EXECUTE 'ALTER TABLE public.kayit
           ADD CONSTRAINT kayit_olay_id_fkey
           FOREIGN KEY (olay_id) REFERENCES public.olay(olay_id) ON DELETE CASCADE';
END $$;

-- =========================
--  Görünümler (opsiyonel) – ön yüz için yardımcı
-- =========================

-- Aktif olayları tür adı ve ekleyen kullanıcı ile birlikte veren görünüm
CREATE OR REPLACE VIEW v_olaylar_aktif AS
SELECT
  o.olay_id,
  o.enlem,
  o.boylam,
  o.olay_turu           AS olay_turu_id,
  l.o_adi               AS olay_turu_adi,
  o.aciklama,
  o.is_active,
  o.created_at,
  u.username            AS created_by_username,
  u.role                AS created_by_role,
  COALESCE(o.created_by_display, u.username) AS created_by_display
FROM olay o
LEFT JOIN olaylar l ON l.o_id = o.olay_turu
LEFT JOIN users u   ON u.id = o.created_by
WHERE o.is_active = TRUE
ORDER BY o.olay_id DESC;

-- Tüm olaylar (aktif/pasif) – yönetim için
CREATE OR REPLACE VIEW v_olaylar_tum AS
SELECT
  o.*,
  l.o_adi AS olay_turu_adi,
  u.username AS created_by_username,
  u.role     AS created_by_role
FROM olay o
LEFT JOIN olaylar l ON l.o_id = o.olay_turu
LEFT JOIN users u   ON u.id = o.created_by
ORDER BY o.olay_id DESC;

-- =========================
--  Yardımcı notlar
--  • Uygulama eklerken created_by = current_user.id ve created_by_display = current_user.username doldurmalıdır.
--  • Supervisor “sil” işlemi için: UPDATE olay SET is_active=FALSE, deactivated_by=:user_id, deactivated_by_display=:username, deactivated_at=NOW() WHERE olay_id=:id;
--  • Admin “sil” işlemi fizikî DELETE olabilir (kayit tablosu CASCADE ile temizlenir).
--  • Ön yüzde tür ID gösterilmeyecek; tür adı (o_adi) kullanılacaktır.
-- =========================


-- Örnek
INSERT INTO personel (adi, soyadi, parola) VALUES ('Mehmet', 'Yılmaz', '12345') ON CONFLICT DO NOTHING;
INSERT INTO olaylar (o_adi) VALUES ('Bozuk yol'), ('Yıkık Bina'), ('Elektrik Kaçağı') ON CONFLICT (o_adi) DO NOTHING;
