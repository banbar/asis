--1. Terminalde base32 parola kodunun elde edilmesi: 
node generate-2fa-secret.js

--2. Postgresql'de supervizörün eklenmesi. Elde edilen base32 kodu, "two_factor_secret"a eklenecek:
-- Birden çok süpervizör olabilir.
-- Her biri için ayrı base32 kodu üretilmeli.
INSERT INTO users (username, password_hash, role, name, surname, email, email_verified, is_verified)
VALUES (
  'supervizor',
  crypt('12345Aa.', gen_salt('bf')),
  'supervisor',
  'Berk',
  'Anbaroğlu',
  'banbar@hacettepe.edu.tr',
  TRUE,
  TRUE
);
UPDATE users
SET two_factor_secret='N5FUYRJZOFGCQQJ7F5RCQSJKKVWV4SDL', two_factor_enabled=TRUE
WHERE username='banbar';


-- İkinci süpervizörün eklenmesi:
INSERT INTO users (username, password_hash, role, name, surname, email, email_verified, is_verified)
VALUES (
  'afad_supervizör',
  crypt('123456Aa.', gen_salt('bf')),
  'supervisor',
  'İbrahim',
  'Topcu',
  'ibrahim_supervizor@afad.gov.tr',
  TRUE,
  TRUE
);
UPDATE users
SET two_factor_secret='IQ3FOZSVJQWE2OTVJV4UKKTIEE3UQKKB', two_factor_enabled=TRUE
WHERE username='ibrahim';


--3. Süpervizörün cep telefonundaki Authenticator uygulamasına, base32 kodunun girilmesi
