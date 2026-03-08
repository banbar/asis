
const DISTRICTS = [
    { lat: 39.9180, lng: 32.8620 },  // Kızılay
    { lat: 39.9686, lng: 32.8580 },  // Keçiören
    { lat: 39.9520, lng: 32.7850 },  // Etimesgut
    { lat: 39.9180, lng: 32.9100 },  // Mamak
    { lat: 39.9180, lng: 32.6770 },  // Sincan
    { lat: 39.9680, lng: 32.5780 },  // Polatlı
    { lat: 39.9450, lng: 32.8780 },  // Altındağ
    { lat: 39.7890, lng: 32.8100 },  // Gölbaşı
];

const OLAY_TURU_IDLERI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const ACIKLAMALAR = [
    'Bölgede tespit edildi - ekipler yönlendirildi',
    'Bina hasar durumu kontrol ediliyor',
    'Yardım malzemesi dağıtım noktası',
    'Arama kurtarma operasyonu devam ediyor',
    'Altyapı hasarı bildirildi',
    'Sağlık ekibi sahada',
    'Geçici barınma alanı kuruldu',
    'Su dağıtım noktası aktif',
    'Elektrik arızası bildirildi',
    'Gaz kaçağı tespit edildi - alan tahliye ediliyor',
];


function generateRandomEvent(userContext, events, done) {
    const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];

    userContext.vars.randomLat = (district.lat + (Math.random() - 0.5) * 0.04).toFixed(6);
    userContext.vars.randomLng = (district.lng + (Math.random() - 0.5) * 0.04).toFixed(6);
    userContext.vars.randomOlayTuru = OLAY_TURU_IDLERI[Math.floor(Math.random() * OLAY_TURU_IDLERI.length)];
    userContext.vars.randomAciklama = ACIKLAMALAR[Math.floor(Math.random() * ACIKLAMALAR.length)];

    return done();
}

module.exports = {
    generateRandomEvent,
};
