-- Supervisor ekleme
-- 1. kısım - veritabanına ekleme
INSERT INTO users (username, password_hash, role, name, surname, email, email_verified, is_verified)
VALUES (
  'supervisor1',
  crypt('<supervisor parolasi - en az 8 haneli, 1 büyük, 1 küçük harf ve 1 noktalama işareti içermeli>', gen_salt('bf')),
  'supervisor',
  '<Supervisor adını giriniz>',
  '<Supervisor soyadini giriniz>',
  '<Supervisor e-posta adresini giriniz>',
  TRUE,
  TRUE
);
UPDATE users
SET two_factor_secret='base32 kodunu buraya giriniz', two_factor_enabled=TRUE
WHERE username='supervisor1';

-- 2. kısım: terminalde kodun çalıştırılması:
--node generate-2fa-secret.js

-- 3. kısım: mobil authenticator uygulamasına base32 kodunun girilmesi.



