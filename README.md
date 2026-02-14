# ASİS - Afet Sonrası İzleme Sistemi

<div align="center">

![ASİS Logo](https://img.shields.io/badge/ASİS-Afet%20Sonrası%20İzleme%20Sistemi-red?style=for-the-badge)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)
[![AWS](https://img.shields.io/badge/AWS-EC2-orange?style=for-the-badge&logo=amazonaws&logoColor=white)](https://aws.amazon.com/ec2/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![QGIS](https://img.shields.io/badge/QGIS-3.x-589632?style=for-the-badge&logo=qgis&logoColor=white)](https://qgis.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.x-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)](https://getbootstrap.com/)

**Afet durumlarında vatandaşların ve ekiplerin konum bazlı olay bildirimi yapabildiği, hem web hem de mobil (QField) üzerinden offline çalışabilen, yöneticilerin bu bildirimleri takip edebildiği PostgreSQL tabanlı açık kaynak izleme ve raporlama platformu.**

[Özellikler](#-özellikler) •
[Kurulum](#-kurulum) •
[QField Entegrasyonu](#-qfield-entegrasyonu-offline-veri-toplama) •
[Kullanım](#-kullanım) •


</div>
## ASİS | AWS Production Kurulum + QField Offline Veri Toplama Entegrasyonu (PostGIS, QGIS)

 YouTube Tutorial: https://youtu.be/aaaHWfvmJPs
---

## İçindekiler

- [Özellikler](#-özellikler)
- [Teknolojiler](#-teknolojiler)
- [Sistem Gereksinimleri](#-sistem-gereksinimleri)
- [Kurulum](#-kurulum)
  - [Web Uygulaması Kurulumu](#1-web-uygulaması-kurulumu)
  - [.env Dosyası Yapılandırması](#2-env-dosyası-yapılandırması)
  - [AWS (EC2) Üzerine Yayınlama](#-aws-ec2-üzerine-yayınlama)
- [QField Entegrasyonu](#-qfield-entegrasyonu-offline-veri-toplama)
- [Kullanım](#-kullanım)
- [Proje Yapısı](#-proje-yapısı)


---

##  Özellikler

### Web Uygulaması Özellikleri

#### Harita Tabanlı Olay Yönetimi
- **Leaflet.js** kullanarak interaktif harita görünümü
- Harita üzerinde tıklayarak veya canlı konum kullanarak olay bildirimi
- Marker kümeleme (clustering) ile performanslı görüntüleme
- Özelleştirilebilir harita başlangıç konumu ve zoom seviyeleri
- Çoklu harita görünümü (kullanıcı haritası + admin/supervisor haritası)

#### Multimedya Yönetimi
- Fotoğraf ve video yükleme desteği
- Kamera ile doğrudan fotoğraf çekme (Web API)
- Video kaydetme özelliği (MediaRecorder API)
- Lightbox ile tam ekran medya görüntüleme
- QField'dan gelen fotoğraf ve videoların otomatik format dönüşümü

#### Gelişmiş Veri Girişi
- Web Speech API ile sesli açıklama ekleme
- Türkçe dil desteği
- Gerçek zamanlı konuşma tanıma

#### Rol Tabanlı Yetkilendirme
- **User (Vatandaş)**: Olay bildirimi, kendi olaylarını düzenleme
- **Supervisor (Gözlemci)**: Tüm olayları görüntüleme, kendi eklediği türleri yönetme, kullanıcı yönetimi
- **Admin (Yönetici)**: Tam sistem kontrolü, tüm yönetim yetkileri

####  Gelişmiş Filtreleme ve Analiz
- Tarih bazlı filtreleme (özel tarih aralıkları, sıralama)
- E-posta domain bazlı filtreleme
- Olay türü filtreleme (faydalı/faydasız)
- Kullanıcı bazlı filtreleme
- GeoJSON export özelliği

####  Güvenlik
- JWT token bazlı kimlik doğrulama
- İki faktörlü kimlik doğrulama (2FA/TOTP)
- E-posta doğrulama sistemi
- bcrypt ile parola hashleme
- XSS ve SQL injection koruması

#### Kullanıcı Deneyimi
- Koyu/Açık tema desteği
- Responsive tasarım (mobil uyumlu)
- PWA (Progressive Web App) desteği potansiyeli
- Türkçe arayüz

### QField (Offline) Özellikleri

####  Mobil Veri Toplama
- **QField** mobil uygulaması ile offline veri toplama
- GPS ile otomatik konum bilgisi
- Fotoğraf ve video ekleme
- Form tabanlı veri girişi
- Özelleştirilebilir widget'lar

####  Senkronizasyon
- QGIS QFieldSync plugin ile otomatik senkronizasyon
- Offline toplanan verilerin PostgreSQL veritabanına aktarımı
- Medya dosyalarının otomatik format dönüşümü
- Çift yönlü veri senkronizasyonu

#### QGIS Entegrasyonu
- QGIS Desktop ile veritabanı bağlantısı
- Layer tabanlı veri yönetimi
- Özelleştirilebilir stil dosyaları (.qml)
- Medya dosyalarını tarayıcıda görüntüleme (hyperlink özelliği)

---

##Teknolojiler

<div align="center">

| Kategori | Teknoloji | Açıklama |
|----------|-----------|----------|
| **Backend** | ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white) | JavaScript runtime environment |
| | ![Express.js](https://img.shields.io/badge/Express.js-000000?style=flat&logo=express&logoColor=white) | Web framework |
| | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white) | İlişkisel veritabanı |
| | ![JWT](https://img.shields.io/badge/JWT-000000?style=flat&logo=jsonwebtokens&logoColor=white) | Token bazlı kimlik doğrulama |
| **Frontend** | ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black) | Vanilla JS (framework-free) |
| | ![Bootstrap](https://img.shields.io/badge/Bootstrap-7952B3?style=flat&logo=bootstrap&logoColor=white) | CSS framework |
| | ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat&logo=leaflet&logoColor=white) | Harita kütüphanesi |
| **GIS** | ![QGIS](https://img.shields.io/badge/QGIS-589632?style=flat&logo=qgis&logoColor=white) | Desktop GIS yazılımı |
| | ![QField](https://img.shields.io/badge/QField-589632?style=flat) | Mobil GIS uygulaması |
| **Güvenlik** | ![bcrypt](https://img.shields.io/badge/bcrypt-003A70?style=flat) | Parola hashleme |
| | ![Speakeasy](https://img.shields.io/badge/Speakeasy-FF6C37?style=flat) | TOTP (2FA) |
| **E-posta** | ![Nodemailer](https://img.shields.io/badge/Nodemailer-339933?style=flat) | E-posta gönderimi |
| **Dosya İşleme** | ![Multer](https://img.shields.io/badge/Multer-FF6C37?style=flat) | Dosya yükleme |
| | ![Sharp](https://img.shields.io/badge/Sharp-99CC00?style=flat) | Görsel işleme |

</div>

---

## Sistem Gereksinimleri

### Web Uygulaması İçin
- **Node.js**: v14 veya üzeri (önerilen: v18+)
- **PostgreSQL**: v13 veya üzeri
- **npm** veya **yarn**: Paket yöneticisi
- **İşletim Sistemi**: Windows, Linux veya macOS

### QField (Offline) Kullanımı İçin
- **QGIS Desktop**: 3.x veya üzeri
- **QField Mobil Uygulama**: Android veya iOS
- **QFieldSync Plugin**: QGIS için
- **USB Bağlantısı**: Mobil cihaz ile bilgisayar arasında veri aktarımı için

---

## Kurulum

### 1. Web Uygulaması Kurulumu

#### Adım 1: Projeyi İndirin
```bash
git clone https://github.com/banbar/asis.git
cd asis
```

#### Adım 2: Bağımlılıkları Yükleyin
```bash
npm install
```

#### Adım 3: PostgreSQL Veritabanını Hazırlayın

##### PostgreSQL Kurulumu (Eğer yoksa)
**Windows:**
- [PostgreSQL resmi sitesinden](https://www.postgresql.org/download/windows/) indirip kurun
- Kurulum sırasında parola belirleyin (örn: `postgres`)

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

##### Veritabanı Oluşturma
```bash
# PostgreSQL'e bağlanın
psql -U postgres

# Veritabanını oluşturun
CREATE DATABASE afet_yonetimi;

# Çıkış yapın
\q
```

#### Adım 4: PostGIS Uzantısını Yükleyin
Github Projesindeki 1_veritabani_tablolari.sql dosyasındaki 
sql sorgusunu kopyalayın ve oluştumuş olduğunuz veri tabanında
 query tool kısmına yapıştırarak gerekli tabloları oluşturun.


### 2. .env Dosyası Yapılandırması

Proje kök dizininde `.env` dosyası oluşturun ve aşağıdaki içeriği kopyalayın:

```env
# =================================
# SUNUCU AYARLARI
# =================================

# Sunucu portu (varsayılan: 3000)
PORT=3000

# CORS origin (geliştirme için localhost, production'da domain adınız)
CORS_ORIGIN=http://localhost:3000

# =================================
# POSTGRESQL VERİTABANI AYARLARI
# =================================

# PostgreSQL sunucu adresi (localhost için 127.0.0.1)
PGHOST=127.0.0.1

# PostgreSQL port numarası (varsayılan: 5432)
PGPORT=5432

# PostgreSQL kullanıcı adı
PGUSER=postgres

# PostgreSQL kullanıcı parolası

PGPASSWORD=porolanız_buraya

# PostgreSQL veritabanı adı
PGDATABASE=oluşturduğun_veritabanı_ismi

# Connection pool maksimum bağlantı sayısı
PGPOOL_MAX=10

# =================================
# JWT GÜVENLİK AYARLARI
# =================================

# JWT token için gizli anahtar
JWT_SECRET=dev-secret

JWT_EXPIRES=7d

# =================================
# COOKIE AYARLARI
# =================================

# Cookie SameSite ayarı (lax, strict, none)
COOKIE_SAMESITE=lax

# Cookie Secure (HTTPS için true, HTTP için false)
COOKIE_SECURE=false

# =================================
# E-POSTA DOĞRULAMA
# =================================

# E-posta doğrulama zorunlu mu? (true/false)
FORCE_EMAIL_VERIFY=true

# =================================
# SMTP E-POSTA AYARLARI
# =================================

# SMTP sunucu adresi
# Gmail: smtp.gmail.com
# Outlook: smtp-mail.outlook.com
# Yahoo: smtp.mail.yahoo.com
SMTP_HOST=smtp.gmail.com

# SMTP port 
SMTP_PORT=587

# SSL kullanımı (true/false)
SMTP_SECURE=false

# SMTP kullanıcı adı (genellikle e-posta adresiniz)
SMTP_USER=...@gmail.com

# SMTP parolası veya uygulama parolası
# Gmail için: https://myaccount.google.com/apppasswords
SMTP_PASS=oluşturdupunuz_uygulama_parolası

# Gönderen adı
SMTP_FROM_NAME=ASİS

# Gönderen e-posta adresi
SMTP_FROM_EMAIL=...@gmail.com

# =================================
# QFIELD SENKRONIZASYON AYARLARI
# =================================

# QField'dan gelen verilerin bulunduğu kök klasör yolu
# Windows örneği: C:\Users\USER\Desktop\qfield_data
# Linux/Mac örneği: /home/user/qfield_data
# ÖNEMLİ: Çift ters slash (\\) kullanın Windows'ta
QFIELD_SYNC_ROOT=C:\\path\\to\\your\\qfield\\folder

# QField verilerinin kontrol aralığı (milisaniye)
# 30000 = 30 saniye, 60000 = 1 dakika
QFIELD_INGEST_INTERVAL_MS=30000

# =================================
# SİTE AYARLARI
# =================================

# Site başlığı (tarayıcı sekmesi ve header'da görünür)
SITE_TITLE=ASİS

# Site logosu URL (örnek: /logo.png veya https://example.com/logo.png)
SITE_LOGO_URL=/afet_logo2.png

# =================================
# KAYIT İZİN AYARLARI
# =================================

# Kayıt için izin verilen e-posta domainleri (noktalı virgülle ayırın)
# Örnek: hacettepe.edu.tr;metu.edu.tr;ankara.edu.tr
# Boş bırakırsanız tüm domainler izinli olur
ALLOWED_EMAIL_DOMAIN=gmail.com;outlook.com;hotmail.com

# =================================
# TABLO SAYFALAMA AYARLARI
# =================================

# Olaylar tablosu sayfa başına kayıt sayısı
TABLE_PAGE_SIZE_EVENTS=25

# Olay türleri tablosu sayfa başına kayıt sayısı
TABLE_PAGE_SIZE_TYPES=20

# Kullanıcılar tablosu sayfa başına kayıt sayısı
TABLE_PAGE_SIZE_USERS=30

# =================================
# HARİTA AYARLARI
# =================================

# Harita başlangıç enlem (latitude)
# Örnekler: Ankara=39.9334, İstanbul=41.0082, İzmir=38.4237
MAP_INITIAL_LAT=39.9334

# Harita başlangıç boylam (longitude)
# Örnekler: Ankara=32.8597, İstanbul=28.9784, İzmir=27.1428
MAP_INITIAL_LNG=32.8597

# Harita başlangıç zoom seviyesi (1-18 arası)
# 1=Dünya, 6=Ülke, 10=Şehir, 15=Mahalle, 18=Bina
MAP_INITIAL_ZOOM=6

# Minimum zoom seviyesi (maksimum uzaklaştırma)
# Küçük değer = Daha fazla uzaklaştırma (önerilen: 2-6)
MAP_MIN_ZOOM=2

# =================================
# OLAY GÖRÜNÜRLÜK AYARLARI (Giriş Yapmamış Kullanıcılar)
# =================================

# "Vatandaşa Faydalı" olayları göster (true/false)
SHOW_GOOD_EVENTS_ON_LOGIN=true

# "Vatandaşa Faydasız" olayları göster (true/false)
SHOW_BAD_EVENTS_ON_LOGIN=false
```



**Gmail Uygulama Parolası Alma:**
1. Google Hesabınıza gidin
2. Güvenlik > İki Adımlı Doğrulama'yı aktif edin
3. "Uygulama Parolaları" seçeneğine tıklayın
4. "Diğer (Özel ad)" seçin, "ASİS" yazın
5. Oluşan 16 haneli parolayı `SMTP_PASS` olarak kullanın


---

##  AWS (EC2) Üzerine Yayınlama

Bu proje **AWS EC2 (Ubuntu 22.04)** üzerinde yayınlanmıştır ve Nginx + PM2 ile production ortamında çalıştırılmaktadır.

###  Canlı Sistem Linki
> **ASİS (AWS):** `http://EC2_PUBLIC_IP`  


---

### 1) EC2 Instance Oluşturma 

AWS Console → EC2 → Launch instance:
- **Name:** `asis-server`
- **AMI:** Ubuntu Server 22.04 LTS (x86_64)
- **Instance type:** t2.micro
- **Key pair:** `.pem` dosyasını indir
- **Security group:**
  - SSH (22) → Source: **My IP**
  - HTTP (80) → Source: **0.0.0.0/0**
- Launch instance → Sunucu çalışır hale gelir.

---

### 2) SSH ile Sunucuya Bağlanma

Windows PowerShell üzerinden:
```powershell
ssh -i .\asis1.pem ubuntu@EC2_PUBLIC_DNS
```

---

### 3) Otomatik Kurulum (install_asis.sh)

 Bu repoya **install_asis.sh** dosyası eklendi.

Projeyi GitHub’dan çektikten sonra **proje kök dizininde** zaten hazır olacak.

#### Adım 1: Repo’yu çek
```bash
sudo mkdir -p /var/www/asis
sudo chown -R ubuntu:ubuntu /var/www/asis
cd /var/www/asis
git clone https://github.com/banbar/asis
cd asis
```

#### Adım 2: .env dosyasını oluştur
```bash
nano .env
```

 `.env` dosyasını kaydet (Ctrl+O, Enter) ve çık (Ctrl+X).

#### Adım 3: Script’i çalıştır
```bash
chmod +x install_asis.sh
./install_asis.sh
```

Bu script sırasıyla:
- Sistem güncellemesi yapar (`apt update/upgrade`)
- Node.js, PostgreSQL, PostGIS, Nginx ve UFW kurar
- `.env` içinden veritabanı ayarlarını okuyup DB oluşturur
- `1_veritabani_tablolari.sql` dosyasını otomatik import eder
- `pm2` ile Node uygulamasını başlatır
- `nginx` reverse proxy ayarlar (`80 → 3000`)

---

### 4) Kurulum Sonrası Kontrol

PM2 durumu:
```bash
pm2 status
```

Nginx durumu:
```bash
sudo systemctl status nginx --no-pager
```

Veritabanına giriş:
```bash
sudo -u postgres psql -d asis
```

PostgreSQL’den çıkış:
```sql
\q
```
### 4.1) Bilgisayarınızdaki QField Klasörünü Sunucuya Aktarma (SCP)

Aşağıdaki adımlar, bilgisayarınızdaki bir klasörü (ör. `Y1`) **EC2 sunucusuna** kopyalayıp
sonrasında **/var/www/asis/asis/** altına taşımanız içindir.

>  Not: Bu adımlar **Windows PowerShell** içindir.  
>  Örnek: QField projesi klasörü `Y1` gibi tek bir klasör olabilir (içinde `*.qgs`, `*.gpkg`, `photos/` vb. bulunur).

#### Adım 1: Klasörü sunucuya `/tmp` dizinine kopyala (SCP)

```powershell
scp -i ".\KEY.pem" -r "C:\PATH\TO\LOCAL\FOLDER\Y1" ubuntu@EC2_PUBLIC_DNS:/tmp/
```

- `KEY.pem` → EC2 anahtar dosyanız (ör. `asis3.pem`)
- `C:\PATH\TO\LOCAL\FOLDER\Y1` → Bilgisayarınızdaki klasör yolu
- `EC2_PUBLIC_DNS` → EC2 Public DNS (veya Public IP)

#### Adım 2: SSH ile sunucuya bağlan

```powershell
ssh -i .\KEY.pem ubuntu@EC2_PUBLIC_DNS
```

#### Adım 3: Klasörü hedef dizine taşı ve izinleri ayarla

Sunucuda (SSH içindeyken) çalıştırın:

```bash

# /tmp altına gelen klasörü hedef dizine taşı
sudo mv /tmp/Y1 /var/www/asis/asis/Y1

# Web sunucusunun (nginx/node) erişebilmesi için sahiplik/izin
sudo chown -R www-data:www-data /var/www/asis/asis/Y1
sudo chmod -R 775 /var/www/asis/asis/Y1
```

 Bu işlemden sonra QField klasörünüz sunucuda şu konumda olur:

- `/var/www/asis/asis/Y1`

---

### 5) QGIS ile AWS’deki PostgreSQL/PostGIS Veritabanına Bağlanma

#### 1) AWS Tarafı (Security Group)
QGIS dışarıdan bağlanacağı için EC2 instance’ının Security Group (Inbound rules) kısmında PostgreSQL portu (5432) açılmalıdır.  
Öneri: 5432 portunu sadece kendi IP adresine (My IP) aç. 0.0.0.0/0 (herkese açık) bırakma.

**Yapılacaklar:**
1. AWS Console → EC2 → Instances → (instance’ı seç) → Security sekmesi → Security groups.
2. İlgili Security Group → Inbound rules → Edit inbound rules.
3. Yeni kural ekle: Type = PostgreSQL, Port = 5432, Source = My IP (ör. 88.xxx.xxx.xxx/32).
4. Kaydet.

#### 2) Ubuntu Sunucu Tarafı (PostgreSQL’ü dışarıya açma)

##### 2.1) PostgreSQL 5432 portu dinliyor mu kontrol et
```bash
sudo ss -lntp | grep 5432
```
Eğer çıktı `127.0.0.1:5432` ise PostgreSQL dışarıdan bağlantı kabul etmiyordur. `0.0.0.0:5432` veya `*:5432` olmalıdır.

##### 2.2) postgresql.conf → listen_addresses ayarı
PostgreSQL sürüm klasörünü kontrol et:
```bash
ls /etc/postgresql/
```
Örnek sürüm 16 ise dosyayı aç:
```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```
Dosyada şu satırı bul (genelde yorumlu gelir):
```conf
#listen_addresses = 'localhost'
```
Başındaki `#` işaretini kaldırıp şu hale getir:
```conf
listen_addresses = '*'
```
Kaydet: **Ctrl+O (Enter)** → Çık: **Ctrl+X**

##### 2.3) pg_hba.conf → dış IP’ye izin ver
QGIS’in bağlandığı bilgisayarın public IP adresine izin vermelisin. Dosyayı aç:
```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```
Şu bloğun altına veya dosyanın en altına ekle:
```conf
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
```
(SENIN_PUBLIC_IP kısmını kendi IP’n ile değiştir):
```conf
host    all     all     SENIN_PUBLIC_IP/32     scram-sha-256
```
Örnek:
```conf
host    all     all     88.123.45.67/32        scram-sha-256
```
Kaydet/çık (**Ctrl+O, Enter, Ctrl+X**).

##### 2.4) PostgreSQL’i yeniden başlat ve tekrar kontrol et
```bash
sudo systemctl restart postgresql
sudo ss -lntp | grep 5432
```
Beklenen: `0.0.0.0:5432` ve/veya `[::]:5432` (yani dış arayüzlerde dinleme).

##### 2.5) UFW (Firewall) 5432 izni
UFW açıksa 5432’ye ayrıca izin vermen gerekir:
```bash
sudo ufw status
sudo ufw allow 5432/tcp
sudo ufw reload
sudo ufw status
```

#### 3) QGIS Tarafı (PostGIS Connection)
QGIS → Browser Panel → PostgreSQL → New Connection (veya Layer → Data Source Manager → PostgreSQL → New).  
**‘Service’ alanını boş bırakabilirsin (gerekli değil).**

| Alan | Ne yazılacak? |
|---|---|
| Name | ASIS-AWS (istediğin isim) |
| Service | Boş bırak |
| Host | EC2 Public IPv4 DNS veya Public IPv4 Address (ör: ec2-...amazonaws.com veya 13.xx.xx.xx) |
| Port | 5432 |
| Database | asis (PGDATABASE) |
| SSL mode | disable |
| Username | postgres (PGUSER) |
| Password | `.env` içindeki PGPASSWORD |

Doldurduktan sonra: **Test Connection → başarılıysa OK.**

---

## 🗺️ QField Entegrasyonu (Offline Veri Toplama)

QField entegrasyonu sayesinde internet bağlantısı olmadan mobil cihazlarla coğrafi veri toplayabilir ve sonradan PostgreSQL veritabanına aktarabilirsiniz.

### Gerekli Yazılımlar

1. **QGIS Desktop** (3.x+): [qgis.org/download](https://qgis.org/download)
2. **QField Mobil Uygulama**: 
   - [Google Play](https://play.google.com/store/apps/details?id=ch.opengis.qfield)
   - [App Store](https://apps.apple.com/app/qfield-for-qgis/id1531726814)
3. **QFieldSync Plugin**: QGIS için

---

###  QField Kurulum Adımları

#### 1️⃣ Boş Çalışma Klasörü Oluşturun

Bilgisayarınızda QField projeleri için bir klasör oluşturun:

```

📁 qfield_projeler/

```

**Önerilen Konum:**
- Windows: `C:\Users\[KullaniciAdi]\Documents\qfield_projeler`
- Linux/Mac: `/home/[kullanici]/qfield_projeler`

---

#### 2️⃣ QGIS'te Yeni Proje Oluşturun ve Veritabanına Bağlanın

##### a) QGIS'i açın ve yeni bir proje oluşturun

**Menü:** `Proje > Yeni`

##### b) PostgreSQL veritabanına bağlanın

1. **Browser Panel'i açın** (Görünüm > Paneller > Browser)
2. **PostgreSQL** sağ tık > **Yeni Bağlantı**
3. Bağlantı bilgilerini girin:

```

Ad: ASİS Veritabanı
Host: 127.0.0.1
Port: 5432
Veritabanı: oluşturduğunuz_veritabanı_adı
Kullanıcı Adı: postgres
Parola: Postgres kurulumunda oluşturduğunuz parola
Don't Resolve type of unrestricted columns (GEOMETRY) kutucuğuna tik işareti koyun

```

4. **Tamam** ile kaydedin

![QGIS PostgreSQL Bağlantısı](docs/1.jpg)

##### c) Gerekli Layer'ları Çekin

Browser panelinde oluşturduğunuz bağlantıyı genişletin:

```

PostgreSQL
└── ASİS Veritabanı
    └── public (schema)
        ├── olay (tablo) ← Bu layer'ı sürükle-bırak
        ├── olaylar (tablo)
        └── users (tablo)

```

**`olay` tablosunu** ana haritaya sürükleyip bırakın.

![Layer Ekleme](docs/2.jpg)

---

#### 3️⃣ QFieldSync Plugin'ini Yükleyin

1. **Menü:** `Eklentiler > Eklentileri Yönet ve Yükle`
2. Arama kutusuna **"QFieldSync"** yazın
3. **QFieldSync** seçin ve **Eklentiyi Yükle** butonuna tıklayın
4. Yükleme tamamlandığında **Kapat**


---

#### 4️⃣ Projeyi QField İçin Paketleyin

##### a) QFieldSync Plugin'ini açın

**Menü:** `Eklentiler > QFieldSync > Package for QField`

![QFieldSync Menü](docs/3.jpg)

##### b) Paketleme ayarlarını yapın

1. **Export Directory:** Daha önce oluşturduğunuz boş klasörü seçin
   - Örnek: `C:\Users\USER\Documents\qfield_projeler\asis_proje`

2. **Create** butonuna tıklayın

![Package Ayarları](docs/4.jpg)


#### 5️⃣ Olay Layer'ı İçin Özel Stil Dosyası Yükleyin

Projedeki `qfield-style` klasöründe hazır stil dosyası bulunmaktadır. Bu stil, web uygulamasındaki fotoğraf ve videoların QField'da görüntülenebilmesini sağlar.

##### a) Paketlenmiş QGIS projesini açın

Veritabanı bağlantılı projeyi **kapatın**, bunun yerine:

1. QGIS'te **Proje > Aç**
2. Az önce oluşturduğunuz `asis_proje/asis_proje.qgs` dosyasını açın

##### b) Stil dosyasını yükleyin

1. `olay` layer'ına **sağ tık** > **Özellikler**
2. Sol panelden **Attributes Form** seçin
3. Sağ altta **Style** butonuna tıklayın
4. **Load Style** seçin
5. **From File** seçeneğini işaretleyin
6. **...** (üç nokta) butonuna tıklayın
7. İndirdiğiniz projeden `qfield-style/asis-style.qml` dosyasını seçin
8. **Load Style** butonuna tıklayın
9. **OK** ile onaylayın

![Stil Yükleme](docs/5.jpg)

##### c) Değişiklikleri kaydedin

**Menü:** `Proje > Kaydet` (Ctrl+S)

---

#### 6️⃣ Fotoğraf ve Video Görüntüleme Testi 

Web sitesinde eklediğiniz olaylarda fotoğraf veya video varsa:

1. **Identify Features** seçin
2. Haritada bir olay noktasına **sağ tık**
3. Open Photo at Your Browser a tıklayın
4. Open Video at Your Browser a tıklayın
5. Tarayıcınızda **tam ekran** görüntülenir

![Medya Görüntüleme](docs/6.jpg)

---

#### 7️⃣ Projeyi Mobil Cihaza Aktarın

##### a) USB ile bağlanın

Mobil cihazınızı bilgisayara **USB kablosu** ile bağlayın.

##### b) QField klasörüne gidin

```

Android:
Internal Storage > QField > Imported Projects

iOS:
Files > On My iPhone > QField > Imported Projects

```

Eğer `Imported Projects` klasörü yoksa, QField uygulamasını en az bir kez açıp kapattığınızda oluşacaktır.

##### c) Paketlenmiş projeyi kopyalayın

Bilgisayarınızdaki `asis_proje` klasörünün **tamamını** mobil cihazdaki `Imported Projects` klasörüne **kopyalayın**.

![USB Transfer](docs/7.jpg)


#### 8️⃣ QField'da Projeyi Açın ve Veri Toplayın

##### a) QField uygulamasını açın

Mobil cihazınızda **QField** uygulamasını başlatın.

##### b) Projeyi seçin

1. Ana ekranda **Open Local File** seçeneğine dokunun
2. **Imported Projects** klasörüne gidin
3. **asis_proje** klasörünü açın
4. **asis_proje.qgs** dosyasını seçin


##### c) Düzenleme modunu aktif edin

1. Sağ üstteki **kalem** simgesine dokunun
2. Haritada veri eklemek istediğiniz noktaya dokunun
3. Açılan formda:
   - **Olay Türü** seçin
   - **Açıklama** yazın
   - **Fotoğraf** veya **video** ekleyin (kamera simgesine dokunun)
   - GPS otomatik olarak konumunuzu alacaktır
4. **Kaydet** (✓)

![QField Veri Ekleme](docs/qfield-2.jpg)

##### d) Veri toplamaya devam edin

İstediğiniz kadar olay ekleyin. QField tüm verileri offline olarak saklar.

---

#### 9️⃣ Toplanan Verileri Veritabanına Aktarın

Veri toplama tamamlandıktan sonra:

##### a) Mobil cihazı bilgisayara bağlayın

USB ile bağlanın ve güncellenmiş `asis_proje` klasörünü bilgisayara **kopyalayın**.

**Kopyalama Yeri (Örnek):**
```

C:\Users\USER\Desktop\qfield_data\asis_proje_guncel

```

⚠️ **ÖNEMLİ**: Bu klasör `.env` dosyasındaki `QFIELD_SYNC_ROOT` parametresine yazılacaktır!

##### b) QGIS'te senkronizasyonu başlatın

1. QGIS Desktop'ta **veritabanına bağlı** orijinal projenizi açın (paketlemeden önceki)
2. **Menü:** `Eklentiler > QFieldSync > Synchronize from QField`


3. Açılan pencerede:
   - **QField project folder:** **...** (üç nokta) ile bilgisayara kopyaladığınız güncel klasörü seçin
     - Örnek: `C:\Users\USER\Desktop\qfield_data\asis_proje_guncel`
   - **Synchronize** butonuna tıklayın


##### c) Senkronizasyon tamamlandı

QGIS, QField'dan gelen tüm yeni verileri PostgreSQL veritabanına aktaracaktır. Haritada yeni eklenen noktaları görebilirsiniz.

---

#### 🔟 Fotoğraf ve Videoların Web'de Görünmesi İçin .env Ayarı

QField'dan gelen fotoğraf ve videolar başlangıçta web uygulamasında görünmeyecektir. Bunun nedeni dosya yollarının farklı formatda olmasıdır.

##### a) .env dosyasını düzenleyin

`.env` dosyasını açın ve `QFIELD_SYNC_ROOT` parametresini güncelleyin:

```env
# QField'dan gelen güncel verilerin bulunduğu klasör
QFIELD_SYNC_ROOT=C:\\Users\\USER\\Desktop\\qfield_data\\asis_proje_guncel
```

**Dikkat:**
- Windows'ta çift ters slash (`\\`) kullanın
- Linux/Mac'te tek slash (`/`) kullanın
- Klasör projenizin **kök dizininde** olmalı

##### b) Sunucuyu yeniden başlatın

```bash
# Sunucuyu durdurun (Ctrl+C)
# Sunucuyu başlatın
npm start
```

##### c) Otomatik format dönüşümü

Sunucu başladığında, `index.js` içindeki özel script:

1. `QFIELD_SYNC_ROOT` klasöründeki fotoğraf ve videoları tarar
2. Dosya yollarını web uygulaması formatına dönüştürür
3. Veritabanındaki `photo_urls` ve `video_urls` alanlarını günceller
4. Dosyaları `data/uploads/photos` ve `data/uploads/videos` klasörlerine kopyalar

##### d) Web'de görüntüleme

Artık `http://localhost:3000` adresinden giriş yaptığınızda, QField ile eklenen olayların fotoğraf ve videolarını görebileceksiniz!

![Web Medya Görünümü](docs/qfield-1.png)

---

###  QField Workflow Özeti

```

┌─────────────────────────────────────────────────────────────┐
│                    1. WEB UYGULAMASI                        │
│           (PostgreSQL Veritabanı + Web Arayüzü)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  2. QGIS DESKTOP                            │
│          (PostgreSQL Bağlantısı + QFieldSync)               │
│                 Package for QField                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  3. QFIELD MOBİL                            │
│         (Offline Veri Toplama + Fotoğraf/Video)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  4. QGIS DESKTOP                            │
│       (Synchronize from QField → PostgreSQL'e aktar)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  5. WEB UYGULAMASI                          │
│        (Otomatik Format Dönüşümü + Medya Görünümü)          │
└──────────────────────┬──────────────────────────────────────┘

```

---

## Kullanım

### İlk Giriş

1. Tarayıcınızda `http://localhost:3000` adresine gidin
2. **"Giriş Yap"** butonuna tıklayın
3. İlk admin hesabı ile giriş yapın:
   - **Kullanıcı Adı:** `admin`
   - **Parola:** `Admin@123`

İlk girişten sonra **Profil > parola Değiştir** menüsünden admin parolasını mutlaka değiştirin!

---

### Yeni Kullanıcı Kaydı

1. Ana sayfada **"Kayıt Ol"** butonuna tıklayın
2. Formu doldurun:
   - Kullanıcı adı, e-posta, parola
   - İsim, soyisim (opsiyonel)
3. E-posta doğrulama aktifse, gelen e-postadaki linke tıklayın
4. Giriş yapın

---

### Olay Bildirimi (User Rolü)

1. Haritada bir noktaya **tıklayın** veya **"Konumumu Kullan"** butonuna tıklayın
2. Olay türünü seçin
3. Açıklama yazın veya **mikrofon** butonuna basarak sesli açıklama ekleyin
4. İsteğe bağlı **fotoğraf/video** ekleyin
5. **"Gönder"** butonuna tıklayın

---

### Admin/Supervisor Paneli

Giriş yaptıktan sonra üç sekme görünür:

####  Olaylar Sekmesi
- Tüm olayları listeler
- Gelişmiş filtreleme (tarih, tür, kullanıcı, medya)
- GeoJSON export
- Harita görünümü
- Olay düzenleme ve silme

####  Olay Türleri Sekmesi
- Olay türlerini yönetir
- Yeni tür ekleme
- Tür düzenleme ve silme
- "Vatandaşa Faydalı/Faydasız" ayarı

#### Kullanıcılar Sekmesi
- Kullanıcıları listeler
- Kullanıcı filtreleme
- Kullanıcı silme

---

### 2FA (İki Faktörlü Kimlik Doğrulama)

Admin ve Supervisor kullanıcıları için 2FA aktifleştirme

---

##  Güvenlik

ASİS, aşağıdaki güvenlik önlemlerini içerir:

-  **bcrypt** ile parola hashleme (10 salt rounds)
-  **JWT** token bazlı kimlik doğrulama
-  **2FA/TOTP** desteği (speakeasy)
-  **E-posta doğrulama** sistemi
-  **SQL injection koruması** (parameterized queries)
-  **CORS** ayarları
-  **Dosya yükleme** güvenlik kontrolleri

**Öneriler:**
- Production'da `JWT_SECRET` değerini mutlaka değiştirin
- HTTPS kullanın
- `.env` dosyasını asla Git'e eklemeyin
- PostgreSQL parolasını güçlü tutun

---


## Teşekkürler

Bu proje aşağıdaki açık kaynak projeleri kullanmaktadır:

| Proje | Açıklama |
|-------|----------|
| [Node.js](https://nodejs.org/) | JavaScript runtime environment |
| [Express.js](https://expressjs.com/) | Web application framework |
| [PostgreSQL](https://www.postgresql.org/) | İlişkisel veritabanı |
| [PostGIS](https://postgis.net/) | PostgreSQL coğrafi uzantısı |
| [Leaflet.js](https://leafletjs.com/) | Interaktif harita kütüphanesi |
| [OpenStreetMap](https://www.openstreetmap.org/) | Açık kaynak harita verileri |
| [QGIS](https://qgis.org/) | Açık kaynak masaüstü GIS |
| [QField](https://qfield.org/) | Açık kaynak mobil GIS |
| [Bootstrap](https://getbootstrap.com/) | CSS framework |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | Şifreleme kütüphanesi |
| [JWT](https://jwt.io/) | JSON Web Token |
| [Nodemailer](https://nodemailer.com/) | E-posta gönderimi |
| [Speakeasy](https://github.com/speakeasyjs/speakeasy) | 2FA/TOTP kütüphanesi |

---

## İstatistikler

<div align="center">

![GitHub stars](https://img.shields.io/github/stars/banbar/asis?style=social)
![GitHub forks](https://img.shields.io/github/forks/banbar/asis?style=social)
![GitHub issues](https://img.shields.io/github/issues/banbar/asis)
![GitHub pull requests](https://img.shields.io/github/issues-pr/banbar/asis)
![GitHub last commit](https://img.shields.io/github/last-commit/banbar/asis)

</div>


<div align="center">



</div>
