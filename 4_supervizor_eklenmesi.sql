--1. Terminalde base32 parola kodunun elde edilmesi: 
node generate-2fa-secret.js

--2. Postgresql'de supervizörün eklenmesi. Elde edilen base32 kodu, "two_factor_secret"a eklenecek:
-- Birden çok süpervizör olabilir.
-- Her biri için ayrı base32 kodu üretilmeli.
INSERT INTO public.users (
    username,
    password_hash,
    role,
    name,
    surname,
    email,
    email_verified,
    is_verified,
    is_active,
    two_factor_secret,
    two_factor_enabled
) VALUES (
    'HU_supervizör',
    crypt('12345Aa.', gen_salt('bf', 10)),
    'supervisor',
    'Berk',
    'Anbaroğlu',
    'banbar@hacettepe.edu.tr',
     TRUE,
     TRUE,
     TRUE,
     'N5FUYRJZOFGCQQJ7F5RCQSJKKVWV4SDL',
     TRUE
);



-- İkinci süpervizörün eklenmesi:
INSERT INTO public.users (
    username,
    password_hash,
    role,
    name,
    surname,
    email,
    email_verified,
    is_verified,
    is_active,
    two_factor_secret,
    two_factor_enabled
) VALUES (
    'afad_supervizör',
    crypt('123456Aa.', gen_salt('bf', 10)),
    'supervisor',
    'İbrahim',
    'Topcu',
    'ibrahim_supervizor@afad.gov.tr',
     TRUE,
     TRUE,
     TRUE,
     'IQ3FOZSVJQWE2OTVJV4UKKTIEE3UQKKB',
     TRUE
);

--3. Süpervizörün cep telefonundaki Authenticator uygulamasına, base32 kodunun girilmesi
