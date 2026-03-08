/**
 * Bu script, Artillery yük testi öncesinde veritabanına
 * test kullanıcılarını ekler ve test-users.csv dosyasını oluşturur.
 *
 * Kullanım:
 *   node create-test-users.js
 *
 * Gereksinimler:
 *   npm install pg dotenv
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const pool = new Pool({
    host: process.env.PGHOST || '',
    port: parseInt(process.env.PGPORT || '', 10),
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || '',
});

const KULLANICI_SAYISI = 50;

const TEST_PASSWORD = 'ArtTest1!';

const KURUMLAR = [
    { kisaltma: 'art_hu',   domain: 'hacettepe.edu.tr' },
    { kisaltma: 'art_afad', domain: 'afad.gov.tr' },
    { kisaltma: 'art_hgm',  domain: 'harita.gov.tr' },
    { kisaltma: 'art_cbs',  domain: 'csb.gov.tr' },
    { kisaltma: 'art_abb',  domain: 'ankara.bel.tr' },
    { kisaltma: 'art_kzl',  domain: 'kizilay.org.tr' },
    { kisaltma: 'art_itf',  domain: 'itfaiye.gov.tr' },
    { kisaltma: 'art_sag',  domain: 'saglik.gov.tr' },
];

// Olay türleri
const OLAY_TURLERI = [
    { ad: 'Az Hasarlı',      good: true },
    { ad: 'Orta Hasarlı',    good: true },
    { ad: 'Çok Hasarlı',     good: true },
    { ad: 'Yıkık',           good: true },
    { ad: 'Elektrik kaçağı', good: false },
    { ad: 'Su dağıtım',      good: true },
    { ad: 'Gaz kaçağı',      good: false },
    { ad: 'Polis',           good: false },
    { ad: 'Yemek dağıtım',  good: true },
    { ad: 'Erzak dağıtım',  good: true },
    { ad: 'Çocuk bakım',     good: true },
];

async function main() {
    console.log('='.repeat(60));
    console.log('  ASİS - Artillery Test Kullanıcı Oluşturucu');
    console.log('='.repeat(60));

    const client = await pool.connect();

    try {
        console.log('\n[1/3] Olay türleri kontrol ediliyor...');
        for (const ot of OLAY_TURLERI) {
            const check = await client.query(
                "SELECT o_id FROM olaylar WHERE o_adi = $1 AND COALESCE(active, true) = true",
                [ot.ad]
            );
            if (check.rowCount === 0) {
                await client.query(
                    `INSERT INTO olaylar (o_adi, good, active, created_by_name, created_by_role_name)
                     VALUES ($1, $2, true, 'artillery_test', 'admin')`,
                    [ot.ad, ot.good]
                );
                console.log(`  [+] Olay türü eklendi: ${ot.ad}`);
            }
        }
        console.log('  [OK] 11 olay türü hazır.');

        console.log(`\n[2/3] ${KULLANICI_SAYISI} test kullanıcısı oluşturuluyor...`);

        const csvLines = ['username,password'];
        let created = 0;
        let skipped = 0;

        for (let i = 1; i <= KULLANICI_SAYISI; i++) {
            const kurum = KURUMLAR[i % KURUMLAR.length];
            const username = `${kurum.kisaltma}_${i}`;
            const email = `${username}@${kurum.domain}`;

            const exists = await client.query(
                "SELECT id FROM users WHERE username = $1",
                [username]
            );

            if (exists.rowCount > 0) {
                skipped++;
            } else {
                await client.query(
                    "SELECT set_config('app.password_plain', $1, false)",
                    [TEST_PASSWORD]
                );
                await client.query(
                    `INSERT INTO users (
                        username, password_hash, role, email,
                        email_verified, is_verified, is_active
                    ) VALUES (
                        $1,
                        crypt($2, gen_salt('bf', 10)),
                        'user', $3,
                        true, true, true
                    )`,
                    [username, TEST_PASSWORD, email]
                );
                created++;
            }

            csvLines.push(`${username},${TEST_PASSWORD}`);
        }

        console.log(`  [OK] ${created} yeni kullanıcı oluşturuldu, ${skipped} zaten mevcuttu.`);

        const csvPath = path.join(__dirname, 'test-users.csv');
        fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
        console.log(`\n[3/3] CSV dosyası oluşturuldu: ${csvPath}`);
        console.log(`      (${csvLines.length - 1} kullanıcı)`);

    } catch (err) {
        console.error('\n[HATA]', err.message);
    } finally {
        client.release();
        await pool.end();
    }

    console.log('\n' + '='.repeat(60));
    console.log('  Hazır! Şimdi Artillery testini çalıştırabilirsiniz:');
    console.log('  artillery run artillery-test.yml');
    console.log('='.repeat(60));
}

main();