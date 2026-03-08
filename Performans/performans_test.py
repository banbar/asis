#!/usr/bin/env python3
"""
Kullanım:
    pip install psycopg2-binary python-dotenv matplotlib numpy
    python performans_test.py
"""

import psycopg2
import psycopg2.extras
import random
import time
import os
import sys
import json
import shutil
import math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pathlib import Path


load_dotenv()

DB_CONFIG = {
    'host':     os.getenv('PGHOST', ''),
    'port':     int(os.getenv('PGPORT',)),
    'user':     os.getenv('PGUSER', ''),
    'password': os.getenv('PGPASSWORD', ''),
    'database': os.getenv('PGDATABASE', ''),
}


SCRIPT_DIR  = Path(__file__).resolve().parent

if (SCRIPT_DIR / 'Performans' / 'data').exists():
    PROJECT_DIR = SCRIPT_DIR
elif (SCRIPT_DIR.parent / 'Performans' / 'data').exists():
    PROJECT_DIR = SCRIPT_DIR.parent
else:
    PROJECT_DIR = SCRIPT_DIR

# Performans/data klasöründeki fotoğraf ve video
PERF_DATA_DIR   = PROJECT_DIR / 'Performans' / 'data'
PHOTO_FILENAME  = '1763203444090_p2385k6hmk.jpg'
VIDEO_FILENAME  = '1763203444091_affw8078dnc.mp4'
PHOTO_SRC       = PERF_DATA_DIR / PHOTO_FILENAME
VIDEO_SRC       = PERF_DATA_DIR / VIDEO_FILENAME

# Uploads hedef klasörü (index.js'in okuduğu yer)
UPLOADS_DIR = PROJECT_DIR / 'public' / 'uploads'

# Grafik çıktı klasörü
OUTPUT_DIR = PROJECT_DIR / 'Performans' / 'sonuclar'

# Test kullanıcıları için şifre
#  en az 8 karakter, 1 küçük harf, 1 büyük harf, 1 simge/noktalama)
PERF_TEST_PASSWORD = 'PerfTest1!'

# Ankara mahalle merkezleri 
DISTRICTS = [
    {'lat': 39.9180, 'lng': 32.8620},  # Kızılay
    {'lat': 39.9686, 'lng': 32.8580},  # Keçiören
    {'lat': 39.9520, 'lng': 32.7850},  # Etimesgut
    {'lat': 39.9180, 'lng': 32.9100},  # Mamak
    {'lat': 39.9180, 'lng': 32.6770},  # Sincan
    {'lat': 39.9680, 'lng': 32.5780},  # Polatlı
    {'lat': 39.9450, 'lng': 32.8780},  # Altındağ
    {'lat': 39.7890, 'lng': 32.8100},  # Gölbaşı
]

# 8 farklı kurum ve email domainleri
KURUMLAR = [
    {'ad': 'Hacettepe Üniversitesi',         'domain': 'hacettepe.edu.tr',   'kisaltma': 'hu'},
    {'ad': 'AFAD Ankara İl Müdürlüğü',       'domain': 'afad.gov.tr',        'kisaltma': 'afad'},
    {'ad': 'Harita Genel Müdürlüğü',         'domain': 'harita.gov.tr',      'kisaltma': 'hgm'},
    {'ad': 'Çevre ve Şehircilik Bakanlığı',  'domain': 'csb.gov.tr',         'kisaltma': 'cbs'},
    {'ad': 'Ankara Büyükşehir Belediyesi',   'domain': 'ankara.bel.tr',      'kisaltma': 'abb'},
    {'ad': 'Kızılay Derneği',                'domain': 'kizilay.org.tr',     'kisaltma': 'kzl'},
    {'ad': 'İtfaiye Daire Başkanlığı',       'domain': 'itfaiye.gov.tr',     'kisaltma': 'itf'},
    {'ad': 'Sağlık Bakanlığı',               'domain': 'saglik.gov.tr',      'kisaltma': 'sag'},
]

# 11 olay türü 
OLAY_TURLERI = [
    {'ad': 'Az Hasarlı',       'good': True},
    {'ad': 'Orta Hasarlı',     'good': True},
    {'ad': 'Çok Hasarlı',      'good': True},
    {'ad': 'Yıkık',            'good': True},
    {'ad': 'Elektrik kaçağı',  'good': False},
    {'ad': 'Su dağıtım',       'good': True},
    {'ad': 'Gaz kaçağı',       'good': False},
    {'ad': 'Polis',            'good': False},
    {'ad': 'Yemek dağıtım',   'good': True},
    {'ad': 'Erzak dağıtım',   'good': True},
    {'ad': 'Çocuk bakım',      'good': True},
]

# Deney parametreleri
DENEY_SAYISI = 32
MIN_KULLANICI = 30
MAX_KULLANICI = 2000


def deney_kullanici_sayilari():
    """32 deney için 30'dan 2000'e logaritmik ölçekte kullanıcı sayıları üret."""
    sayilar = np.logspace(
        np.log10(MIN_KULLANICI),
        np.log10(MAX_KULLANICI),
        DENEY_SAYISI
    )
    sayilar = np.ceil(sayilar).astype(int)
    sayilar[0] = MIN_KULLANICI
    sayilar[-1] = MAX_KULLANICI
    for i in range(1, len(sayilar)):
        if sayilar[i] <= sayilar[i-1]:
            sayilar[i] = sayilar[i-1] + 1
    return sayilar.tolist()


def get_coords():
    d = random.choice(DISTRICTS)
    return (
        round(d['lat'] + random.uniform(-0.02, 0.02), 6),
        round(d['lng'] + random.uniform(-0.02, 0.02), 6),
    )


def get_date():
    return datetime.now() - timedelta(
        days=random.randint(0, 60),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )


def copy_media_file(src_path, prefix):
    if not src_path.exists():
        return None
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ts = int(time.time() * 1000)
    rnd = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
    ext = src_path.suffix
    new_name = f"{ts}_{prefix}_{rnd}{ext}"
    dst = UPLOADS_DIR / new_name
    shutil.copy2(src_path, dst)
    return f'/uploads/{new_name}'


def build_photo_url():
    url = copy_media_file(PHOTO_SRC, 'photo')
    return json.dumps([url]) if url else '[]'


def build_video_url():
    url = copy_media_file(VIDEO_SRC, 'video')
    return json.dumps([url]) if url else '[]'


def get_desc(olay_adi, good):
    if good:
        return f'{olay_adi} - Bölgede tespit edildi ve hizmet veriliyor'
    else:
        return f'{olay_adi} - Olay yerine ekipler sevk edildi'


def db_connect():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        return conn
    except Exception as e:
        print(f"[HATA] Veritabanı bağlantısı kurulamadı: {e}")
        print(f"       Ayarlar: host={DB_CONFIG['host']}, port={DB_CONFIG['port']}, "
              f"db={DB_CONFIG['database']}, user={DB_CONFIG['user']}")
        print("       .env dosyanızı kontrol edin.")
        sys.exit(1)


def temizle_ve_hazirla(conn):
    cur = conn.cursor()
    olay_turu_ids = {}
    for ot in OLAY_TURLERI:
        cur.execute(
            "SELECT o_id FROM olaylar WHERE o_adi = %s AND COALESCE(active, true) = true",
            (ot['ad'],)
        )
        row = cur.fetchone()
        if row:
            olay_turu_ids[ot['ad']] = row[0]
        else:
            cur.execute(
                """INSERT INTO olaylar (o_adi, good, active, created_by_name, created_by_role_name)
                   VALUES (%s, %s, true, 'performans_test', 'admin')
                   RETURNING o_id""",
                (ot['ad'], ot['good'])
            )
            olay_turu_ids[ot['ad']] = cur.fetchone()[0]

    conn.commit()
    print(f"  [OK] {len(olay_turu_ids)} olay türü hazır.")
    return olay_turu_ids


def kullanicilari_olustur(conn, deney_no, kullanici_sayisi):
    """
    Belirli bir deney için kullanıcıları oluştur.

    ÖNEMLİ: index.js'deki app_api.users_before_ins_upd() trigger'ı
    her INSERT öncesinde set_config('app.password_plain', ...) çağrılmasını
    VE password_hash alanında crypt() kullanılmasını zorunlu kılar.
    Şifre politikası: en az 8 karakter, 1 küçük harf, 1 büyük harf, 1 simge.
    """
    cur = conn.cursor()
    kurum_agirliklari = [10, 50, 100, 200, 10, 50, 100, 200]
    toplam_agirlik = sum(kurum_agirliklari)

    kullanici_idleri = []
    kurum_kullanici_map = {}

    for k_idx, kurum in enumerate(KURUMLAR):
        oran = kurum_agirliklari[k_idx] / toplam_agirlik
        kurum_kullanici_n = max(1, round(kullanici_sayisi * oran))

        kurum_ids = []
        for u_idx in range(kurum_kullanici_n):
            username = f"d{deney_no}_{kurum['kisaltma']}_{u_idx+1}"
            email = f"{username}@{kurum['domain']}"

            cur.execute(
                "SELECT id FROM users WHERE username = %s",
                (username,)
            )
            row = cur.fetchone()
            if row:
                uid = row[0]
            else:
                cur.execute(
                    "SELECT set_config('app.password_plain', %s, true)",
                    (PERF_TEST_PASSWORD,)
                )
                cur.execute(
                    """INSERT INTO users (
                           username, password_hash, role, email,
                           email_verified, is_verified, is_active
                       ) VALUES (
                           %s,
                           crypt(%s, gen_salt('bf', 10)),
                           'user',
                           %s,
                           true, true, true
                       )
                       RETURNING id""",
                    (username, PERF_TEST_PASSWORD, email)
                )
                uid = cur.fetchone()[0]

            kullanici_idleri.append({
                'id': uid,
                'username': username,
                'kurum': kurum['ad'],
                'domain': kurum['domain'],
            })
            kurum_ids.append(uid)

        kurum_kullanici_map[kurum['domain']] = kurum_ids

    conn.commit()
    return kullanici_idleri, kurum_kullanici_map


# Veri ekleme 
def veri_ekle(conn, kullanicilar, olay_turu_ids, deney_no):
    cur = conn.cursor()
    olay_adi_listesi = list(olay_turu_ids.keys())
    olay_id_listesi = list(olay_turu_ids.values())

    toplam_eklenen = 0
    insert_suresi_baslangic = time.time()

    batch_data = []

    for user_info in kullanicilar:
        veri_sayisi = random.randint(10, 50)

        for _ in range(veri_sayisi):
            lat, lng = get_coords()
            tarih = get_date()
            olay_idx = random.randint(0, len(olay_adi_listesi) - 1)
            olay_adi = olay_adi_listesi[olay_idx]
            olay_id  = olay_id_listesi[olay_idx]
            olay_good = OLAY_TURLERI[olay_idx]['good']
            aciklama = get_desc(olay_adi, olay_good)

            has_photo = random.random() < 0.5
            has_video = random.random() < 0.5

            if has_photo:
                photo_urls = json.dumps([f'/uploads/{PHOTO_FILENAME}'])
            else:
                photo_urls = '[]'

            if has_video:
                video_urls = json.dumps([f'/uploads/{VIDEO_FILENAME}'])
            else:
                video_urls = '[]'

            batch_data.append((
                lat, lng, olay_id, aciklama,
                lng, lat,
                user_info['username'], 'user', user_info['id'],
                photo_urls, video_urls, tarih
            ))
            toplam_eklenen += 1

    insert_sql = """
        INSERT INTO olay (
            enlem, boylam, olay_turu, aciklama, geom,
            created_by_name, created_by_role_name, created_by_id,
            photo_urls, video_urls, created_at, active
        ) VALUES %s
    """
    template = """(
        %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
        %s, %s, %s, %s, %s, %s, true
    )"""

    BATCH_SIZE = 5000
    for i in range(0, len(batch_data), BATCH_SIZE):
        chunk = batch_data[i:i + BATCH_SIZE]
        psycopg2.extras.execute_values(
            cur, insert_sql, chunk, template=template, page_size=BATCH_SIZE
        )

    conn.commit()
    insert_suresi = time.time() - insert_suresi_baslangic

    return toplam_eklenen, insert_suresi

# Süpervizör sorguları
def sorgu_calistir(conn, sql, params=None):
    cur = conn.cursor()
    baslangic = time.time()
    cur.execute(sql, params or ())
    rows = cur.fetchall()
    sure = time.time() - baslangic
    return rows, sure


def supervizor_sorgulari(conn, kurum_kullanici_map):
    sonuclar = {}

    domain_list = list(kurum_kullanici_map.keys())
    secili_domain = random.choice(domain_list)
    secili_kurum = next(k['ad'] for k in KURUMLAR if k['domain'] == secili_domain)

    tum_userids = []
    for ids in kurum_kullanici_map.values():
        tum_userids.extend(ids)
    secili_user_id = random.choice(tum_userids) if tum_userids else 1

    cur = conn.cursor()
    cur.execute("SELECT o_id FROM olaylar WHERE COALESCE(active,true)=true ORDER BY random() LIMIT 1")
    secili_olay_turu = cur.fetchone()[0]

    t2 = datetime.now()
    t1 = t2 - timedelta(days=30)

    # Sorgu 1: X kurumundan toplanan verileri getir
    sql1 = """
        SELECT o.olay_id, o.enlem, o.boylam, o.olay_turu, o.aciklama,
               o.created_by_name, o.photo_urls, o.video_urls, o.created_at
        FROM olay o
        JOIN users u ON o.created_by_id = u.id
        WHERE u.email LIKE %s
          AND COALESCE(o.active, true) = true
    """
    rows1, sure1 = sorgu_calistir(conn, sql1, (f'%@{secili_domain}',))
    sonuclar['sorgu1_kurum'] = {
        'ad': f'Kurum sorgulama ({secili_kurum})',
        'sure_sn': round(sure1, 4),
        'sonuc_sayisi': len(rows1),
    }

    # Sorgu 2: Y uzmanının topladığı verileri getir
    sql2 = """
        SELECT o.olay_id, o.enlem, o.boylam, o.olay_turu, o.aciklama,
               o.created_by_name, o.photo_urls, o.video_urls, o.created_at
        FROM olay o
        WHERE o.created_by_id = %s
          AND COALESCE(o.active, true) = true
    """
    rows2, sure2 = sorgu_calistir(conn, sql2, (secili_user_id,))
    sonuclar['sorgu2_uzman'] = {
        'ad': f'Uzman sorgulama (id={secili_user_id})',
        'sure_sn': round(sure2, 4),
        'sonuc_sayisi': len(rows2),
    }

    # Sorgu 3: Z olay türüne ait verileri getir
    sql3 = """
        SELECT o.olay_id, o.enlem, o.boylam, o.aciklama,
               o.created_by_name, o.photo_urls, o.video_urls, o.created_at
        FROM olay o
        WHERE o.olay_turu = %s
          AND COALESCE(o.active, true) = true
    """
    rows3, sure3 = sorgu_calistir(conn, sql3, (secili_olay_turu,))
    sonuclar['sorgu3_olay_turu'] = {
        'ad': f'Olay türü sorgulama (id={secili_olay_turu})',
        'sure_sn': round(sure3, 4),
        'sonuc_sayisi': len(rows3),
    }

    # Sorgu 4: Z olay türünde fotoğraf/video olanlar
    sql4 = """
        SELECT o.olay_id, o.enlem, o.boylam, o.aciklama,
               o.created_by_name, o.photo_urls, o.video_urls, o.created_at
        FROM olay o
        WHERE o.olay_turu = %s
          AND COALESCE(o.active, true) = true
          AND (
              (o.photo_urls IS NOT NULL AND o.photo_urls <> '[]')
              OR
              (o.video_urls IS NOT NULL AND o.video_urls <> '[]')
          )
    """
    rows4, sure4 = sorgu_calistir(conn, sql4, (secili_olay_turu,))
    sonuclar['sorgu4_medya'] = {
        'ad': f'Medyalı olay sorgulama (tür={secili_olay_turu})',
        'sure_sn': round(sure4, 4),
        'sonuc_sayisi': len(rows4),
    }

    # Sorgu 5: T1-T2 arası X kurumundan toplanan veri
    sql5 = """
        SELECT o.olay_id, o.enlem, o.boylam, o.olay_turu, o.aciklama,
               o.created_by_name, o.photo_urls, o.video_urls, o.created_at
        FROM olay o
        JOIN users u ON o.created_by_id = u.id
        WHERE u.email LIKE %s
          AND o.created_at BETWEEN %s AND %s
          AND COALESCE(o.active, true) = true
    """
    rows5, sure5 = sorgu_calistir(conn, sql5, (f'%@{secili_domain}', t1, t2))
    sonuclar['sorgu5_tarih_kurum'] = {
        'ad': f'Tarih+Kurum sorgulama ({secili_kurum}, son 30 gün)',
        'sure_sn': round(sure5, 4),
        'sonuc_sayisi': len(rows5),
    }

    return sonuclar

def deney_verilerini_temizle(conn, deney_no):
    cur = conn.cursor()
    prefix = f"d{deney_no}_%"
    cur.execute("DELETE FROM olay WHERE created_by_name LIKE %s", (prefix,))
    cur.execute("DELETE FROM users WHERE username LIKE %s", (prefix,))
    conn.commit()



# Grafik ve tablo oluşturma 

def grafik_olustur(tum_sonuclar, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)

    deney_nolari       = [s['deney_no'] for s in tum_sonuclar]
    kullanici_sayilari = [s['kullanici_sayisi'] for s in tum_sonuclar]
    toplam_veriler     = [s['toplam_veri'] for s in tum_sonuclar]
    insert_sureleri    = [s['insert_suresi'] for s in tum_sonuclar]

    sorgu_isimleri = [
        ('sorgu1_kurum',       'S1: Kurum Sorgulama'),
        ('sorgu2_uzman',       'S2: Uzman Sorgulama'),
        ('sorgu3_olay_turu',   'S3: Olay Türü Sorgulama'),
        ('sorgu4_medya',       'S4: Medyalı Olay Sorgulama'),
        ('sorgu5_tarih_kurum', 'S5: Tarih+Kurum Sorgulama'),
    ]

    sorgu_sureleri = {}
    for key, label in sorgu_isimleri:
        sorgu_sureleri[key] = [s['sorgular'][key]['sure_sn'] for s in tum_sonuclar]

    plt.rcParams['font.size'] = 10
    plt.rcParams['figure.dpi'] = 150
    plt.rcParams['axes.grid'] = True
    plt.rcParams['grid.alpha'] = 0.3

    # ── Grafik 1: Kullanıcı Sayısı vs Veri Ekleme Süresi ──
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(kullanici_sayilari, insert_sureleri, 'o-', color='#2196F3',
            linewidth=2, markersize=5, label='Veri Ekleme Süresi')
    ax.set_xlabel('Kullanıcı Sayısı', fontsize=12)
    ax.set_ylabel('Süre (saniye)', fontsize=12)
    ax.set_title('Kullanıcı Sayısına Göre Veri Ekleme Süresi', fontsize=14, fontweight='bold')
    ax.legend()
    ax.set_xscale('log')
    fig.tight_layout()
    fig.savefig(output_dir / '01_insert_suresi.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 01_insert_suresi.svg")

    # ── Grafik 2: Kullanıcı Sayısı vs Toplam Eklenen Veri ──
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.bar(range(len(deney_nolari)), toplam_veriler, color='#4CAF50', alpha=0.8)
    ax.set_xlabel('Deney No', fontsize=12)
    ax.set_ylabel('Toplam Veri Sayısı', fontsize=12)
    ax.set_title('Her Deneydeki Toplam Veri Miktarı', fontsize=14, fontweight='bold')
    ax.set_xticks(range(0, len(deney_nolari), 4))
    ax.set_xticklabels([str(deney_nolari[i]) for i in range(0, len(deney_nolari), 4)])
    fig.tight_layout()
    fig.savefig(output_dir / '02_toplam_veri.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 02_toplam_veri.svg")

    # ── Grafik 3: Tüm Sorgu Süreleri (5 sorgu, çizgi grafik) ──
    fig, ax = plt.subplots(figsize=(14, 7))
    renk_paleti = ['#E91E63', '#FF9800', '#9C27B0', '#00BCD4', '#8BC34A']
    for idx, (key, label) in enumerate(sorgu_isimleri):
        ax.plot(kullanici_sayilari, sorgu_sureleri[key], 'o-',
                color=renk_paleti[idx], linewidth=2, markersize=4, label=label)
    ax.set_xlabel('Kullanıcı Sayısı (log ölçek)', fontsize=12)
    ax.set_ylabel('Sorgu Süresi (saniye)', fontsize=12)
    ax.set_title('Süpervizör Sorgu Süreleri vs Kullanıcı Sayısı', fontsize=14, fontweight='bold')
    ax.legend(fontsize=9, loc='upper left')
    ax.set_xscale('log')
    fig.tight_layout()
    fig.savefig(output_dir / '03_sorgu_sureleri.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 03_sorgu_sureleri.svg")

    # ── Grafik 4: Ortalama Sorgu Süreleri (çubuk grafik) ──
    fig, ax = plt.subplots(figsize=(10, 6))
    ort_sureler = [np.mean(sorgu_sureleri[k]) for k, _ in sorgu_isimleri]
    std_sureler = [np.std(sorgu_sureleri[k]) for k, _ in sorgu_isimleri]
    bars = ax.bar(
        [l for _, l in sorgu_isimleri], ort_sureler,
        yerr=std_sureler, capsize=5,
        color=renk_paleti, alpha=0.85, edgecolor='black', linewidth=0.5
    )
    ax.set_ylabel('Ortalama Süre (saniye)', fontsize=12)
    ax.set_title('Sorgu Bazında Ortalama Yanıt Süreleri', fontsize=14, fontweight='bold')
    ax.set_xticklabels([l for _, l in sorgu_isimleri], rotation=25, ha='right', fontsize=9)
    for bar, val in zip(bars, ort_sureler):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.001,
                f'{val:.4f}s', ha='center', va='bottom', fontsize=8, fontweight='bold')
    fig.tight_layout()
    fig.savefig(output_dir / '04_ortalama_sorgu_sureleri.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 04_ortalama_sorgu_sureleri.svg")

    # ── Grafik 5: Veri Ekleme Hızı (veri/saniye) ──
    fig, ax = plt.subplots(figsize=(12, 6))
    hizlar = [v / max(s, 0.001) for v, s in zip(toplam_veriler, insert_sureleri)]
    ax.plot(kullanici_sayilari, hizlar, 's-', color='#FF5722', linewidth=2, markersize=5)
    ax.set_xlabel('Kullanıcı Sayısı (log ölçek)', fontsize=12)
    ax.set_ylabel('Veri/Saniye', fontsize=12)
    ax.set_title('Veri Ekleme Hızı (throughput)', fontsize=14, fontweight='bold')
    ax.set_xscale('log')
    fig.tight_layout()
    fig.savefig(output_dir / '05_insert_hizi.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 05_insert_hizi.svg")

    # ── Grafik 6: Sorgu Sonuç Sayıları Isı Haritası ──
    fig, ax = plt.subplots(figsize=(14, 7))
    sorgu_sonuc_matrix = []
    for key, _ in sorgu_isimleri:
        sorgu_sonuc_matrix.append(
            [s['sorgular'][key]['sonuc_sayisi'] for s in tum_sonuclar]
        )
    im = ax.imshow(sorgu_sonuc_matrix, aspect='auto', cmap='YlOrRd')
    ax.set_yticks(range(len(sorgu_isimleri)))
    ax.set_yticklabels([l for _, l in sorgu_isimleri], fontsize=9)
    ax.set_xlabel('Deney No', fontsize=12)
    ax.set_title('Sorgu Sonuç Sayıları (Isı Haritası)', fontsize=14, fontweight='bold')
    xtick_pos = list(range(0, len(deney_nolari), 4))
    ax.set_xticks(xtick_pos)
    ax.set_xticklabels([str(deney_nolari[i]) for i in xtick_pos])
    fig.colorbar(im, label='Sonuç Sayısı')
    fig.tight_layout()
    fig.savefig(output_dir / '06_sorgu_sonuc_isi_haritasi.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 06_sorgu_sonuc_isi_haritasi.svg")

    # ── Tablo 1: Deney Özet Tablosu (SVG) ──
    fig, ax = plt.subplots(figsize=(18, max(10, len(tum_sonuclar) * 0.35 + 2)))
    ax.axis('off')
    ax.set_title('Deney Sonuçları Özet Tablosu', fontsize=16, fontweight='bold', pad=20)

    basliklar = [
        'Deney\nNo', 'Kullanıcı\nSayısı', 'Toplam\nVeri',
        'Insert\nSüresi(s)', 'S1\nKurum(s)', 'S2\nUzman(s)',
        'S3\nOlay(s)', 'S4\nMedya(s)', 'S5\nTarih(s)'
    ]

    tablo_verisi = []
    for s in tum_sonuclar:
        tablo_verisi.append([
            str(s['deney_no']),
            f"{s['kullanici_sayisi']:,}",
            f"{s['toplam_veri']:,}",
            f"{s['insert_suresi']:.3f}",
            f"{s['sorgular']['sorgu1_kurum']['sure_sn']:.4f}",
            f"{s['sorgular']['sorgu2_uzman']['sure_sn']:.4f}",
            f"{s['sorgular']['sorgu3_olay_turu']['sure_sn']:.4f}",
            f"{s['sorgular']['sorgu4_medya']['sure_sn']:.4f}",
            f"{s['sorgular']['sorgu5_tarih_kurum']['sure_sn']:.4f}",
        ])

    tablo = ax.table(
        cellText=tablo_verisi,
        colLabels=basliklar,
        loc='center',
        cellLoc='center',
    )
    tablo.auto_set_font_size(False)
    tablo.set_fontsize(8)
    tablo.scale(1, 1.4)

    for j in range(len(basliklar)):
        tablo[0, j].set_facecolor('#1976D2')
        tablo[0, j].set_text_props(color='white', fontweight='bold')

    for i in range(1, len(tablo_verisi) + 1):
        renk = '#E3F2FD' if i % 2 == 0 else '#FFFFFF'
        for j in range(len(basliklar)):
            tablo[i, j].set_facecolor(renk)

    fig.tight_layout()
    fig.savefig(output_dir / '07_ozet_tablosu.svg', format='svg', bbox_inches='tight')
    plt.close(fig)
    print(f"  [SVG] 07_ozet_tablosu.svg")

    # ── Tablo 2: İstatistik Özeti Tablosu (SVG) ──
    fig, ax = plt.subplots(figsize=(14, 6))
    ax.axis('off')
    ax.set_title('İstatistiksel Özet', fontsize=16, fontweight='bold', pad=20)

    istatistik_baslik = ['Metrik', 'Min', 'Max', 'Ortalama', 'Medyan', 'Std Sapma']
    metrikler = [
        ('Kullanıcı Sayısı', kullanici_sayilari),
        ('Toplam Veri', toplam_veriler),
        ('Insert Süresi (s)', insert_sureleri),
        ('S1: Kurum Sorgulama (s)', sorgu_sureleri['sorgu1_kurum']),
        ('S2: Uzman Sorgulama (s)', sorgu_sureleri['sorgu2_uzman']),
        ('S3: Olay Türü (s)', sorgu_sureleri['sorgu3_olay_turu']),
        ('S4: Medyalı Olay (s)', sorgu_sureleri['sorgu4_medya']),
        ('S5: Tarih+Kurum (s)', sorgu_sureleri['sorgu5_tarih_kurum']),
    ]

    istatistik_verisi = []
    for ad, veri in metrikler:
        arr = np.array(veri)
        istatistik_verisi.append([
            ad,
            f"{arr.min():.4f}",
            f"{arr.max():.4f}",
            f"{arr.mean():.4f}",
            f"{np.median(arr):.4f}",
            f"{arr.std():.4f}",
        ])

    tablo2 = ax.table(
        cellText=istatistik_verisi,
        colLabels=istatistik_baslik,
        loc='center',
        cellLoc='center',
    )
    tablo2.auto_set_font_size(False)
    tablo2.set_fontsize(9)
    tablo2.scale(1, 1.6)

    for j in range(len(istatistik_baslik)):
        tablo2[0, j].set_facecolor('#388E3C')
        tablo2[0, j].set_text_props(color='white', fontweight='bold')

    for i in range(1, len(istatistik_verisi) + 1):
        renk = '#E8F5E9' if i % 2 == 0 else '#FFFFFF'
        for j in range(len(istatistik_baslik)):
            tablo2[i, j].set_facecolor(renk)

    fig.tight_layout()
    fig.savefig(output_dir / '08_istatistik_ozeti.svg', format='svg', bbox_inches='tight')
    plt.close(fig)
    print(f"  [SVG] 08_istatistik_ozeti.svg")

    # ── Grafik 7: Kutu grafikleri (box plot) ──
    fig, ax = plt.subplots(figsize=(12, 6))
    box_data = [sorgu_sureleri[k] for k, _ in sorgu_isimleri]
    bp = ax.boxplot(box_data, patch_artist=True, labels=[l for _, l in sorgu_isimleri])
    for patch, color in zip(bp['boxes'], renk_paleti):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax.set_ylabel('Sorgu Süresi (saniye)', fontsize=12)
    ax.set_title('Sorgu Süresi Dağılımları (Box Plot)', fontsize=14, fontweight='bold')
    ax.set_xticklabels([l for _, l in sorgu_isimleri], rotation=20, ha='right', fontsize=9)
    fig.tight_layout()
    fig.savefig(output_dir / '09_sorgu_boxplot.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 09_sorgu_boxplot.svg")

    # ── Grafik 8: Veri Sayısı vs Sorgu Süresi (scatter) ──
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    axes_flat = axes.flatten()

    for idx, (key, label) in enumerate(sorgu_isimleri):
        ax = axes_flat[idx]
        ax.scatter(toplam_veriler, sorgu_sureleri[key], c=renk_paleti[idx],
                   s=30, alpha=0.7, edgecolor='black', linewidth=0.3)
        z = np.polyfit(toplam_veriler, sorgu_sureleri[key], 1)
        p = np.poly1d(z)
        x_fit = np.linspace(min(toplam_veriler), max(toplam_veriler), 100)
        ax.plot(x_fit, p(x_fit), '--', color='gray', alpha=0.7)
        ax.set_xlabel('Toplam Veri Sayısı', fontsize=9)
        ax.set_ylabel('Süre (s)', fontsize=9)
        ax.set_title(label, fontsize=10, fontweight='bold')

    axes_flat[5].axis('off')
    fig.suptitle('Veri Miktarı vs Sorgu Süreleri (Trend Çizgisiyle)',
                 fontsize=14, fontweight='bold')
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(output_dir / '10_veri_vs_sorgu_scatter.svg', format='svg')
    plt.close(fig)
    print(f"  [SVG] 10_veri_vs_sorgu_scatter.svg")

    print(f"\n  Tüm grafikler ve tablolar '{output_dir}' klasörüne kaydedildi.")


def main():
    print("=" * 65)
    print("  ASİS - PERFORMANS ANALİZ SCRİPTİ")
    print("  32 Deney | 8 Kurum | 11 Olay Türü | 30-2000 Kullanıcı")
    print("=" * 65)

    print(f"\n[BİLGİ] Script dizini : {SCRIPT_DIR}")
    print(f"[BİLGİ] Proje kökü    : {PROJECT_DIR}")
    print(f"[BİLGİ] Medya dizini  : {PERF_DATA_DIR}")

    if not PHOTO_SRC.exists():
        print(f"[UYARI] Fotoğraf dosyası bulunamadı: {PHOTO_SRC}")
        print("        Fotoğrafsız devam ediliyor...")
    else:
        print(f"[OK] Fotoğraf bulundu: {PHOTO_SRC}")

    if not VIDEO_SRC.exists():
        print(f"[UYARI] Video dosyası bulunamadı: {VIDEO_SRC}")
        print("        Videosuz devam ediliyor...")
    else:
        print(f"[OK] Video bulundu  : {VIDEO_SRC}")

    conn = db_connect()
    print(f"\n[OK] Veritabanı bağlantısı: {DB_CONFIG['database']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}")

    print("\n[1/4] Olay türleri hazırlanıyor...")
    olay_turu_ids = temizle_ve_hazirla(conn)

    kullanici_sayilari = deney_kullanici_sayilari()
    print(f"\n[2/4] 32 Deney planlandı:")
    print(f"       Min kullanıcı: {kullanici_sayilari[0]}")
    print(f"       Max kullanıcı: {kullanici_sayilari[-1]}")

    tum_sonuclar = []

    print(f"\n[3/4] Deneyler başlatılıyor...\n")
    print(f"{'Deney':>5} | {'Kullanıcı':>10} | {'Veri':>10} | {'Insert(s)':>10} | "
          f"{'S1(s)':>8} | {'S2(s)':>8} | {'S3(s)':>8} | {'S4(s)':>8} | {'S5(s)':>8}")
    print("-" * 105)

    for deney_idx in range(DENEY_SAYISI):
        deney_no = deney_idx + 1
        k_sayisi = kullanici_sayilari[deney_idx]

        deney_verilerini_temizle(conn, deney_no)

        kullanicilar, kurum_map = kullanicilari_olustur(conn, deney_no, k_sayisi)
        gercek_k_sayisi = len(kullanicilar)

        toplam_veri, insert_suresi = veri_ekle(conn, kullanicilar, olay_turu_ids, deney_no)

        sorgular = supervizor_sorgulari(conn, kurum_map)

        sonuc = {
            'deney_no': deney_no,
            'kullanici_sayisi': gercek_k_sayisi,
            'toplam_veri': toplam_veri,
            'insert_suresi': round(insert_suresi, 3),
            'sorgular': sorgular,
        }
        tum_sonuclar.append(sonuc)

        s1 = sorgular['sorgu1_kurum']['sure_sn']
        s2 = sorgular['sorgu2_uzman']['sure_sn']
        s3 = sorgular['sorgu3_olay_turu']['sure_sn']
        s4 = sorgular['sorgu4_medya']['sure_sn']
        s5 = sorgular['sorgu5_tarih_kurum']['sure_sn']
        print(f"{deney_no:>5} | {gercek_k_sayisi:>10,} | {toplam_veri:>10,} | "
              f"{insert_suresi:>10.3f} | {s1:>8.4f} | {s2:>8.4f} | "
              f"{s3:>8.4f} | {s4:>8.4f} | {s5:>8.4f}")

        deney_verilerini_temizle(conn, deney_no)

    print(f"\n[4/4] Grafikler ve tablolar oluşturuluyor...")
    grafik_olustur(tum_sonuclar, OUTPUT_DIR)

    json_path = OUTPUT_DIR / 'deney_sonuclari.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tum_sonuclar, f, ensure_ascii=False, indent=2)
    print(f"  [JSON] {json_path}")

    conn.close()
    print(f"\n{'=' * 65}")
    print(f"  TAMAMLANDI!")
    print(f"  Çıktılar: {OUTPUT_DIR}")
    print(f"{'=' * 65}")


if __name__ == '__main__':
    main()