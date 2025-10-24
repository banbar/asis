// scripts/mobile-run.js
// Kullanım:
//   node scripts/mobile-run.js --platform=ios
//   node scripts/mobile-run.js --platform=android
// Opsiyoneller:
//   --url=http://localhost:3000
//   --device="iPhone 14 Pro" | --device="Pixel 7"
//   --gps="39.9334,32.8597"
//   --lang=tr-TR
//   --tz=Europe/Istanbul
//   --viewport=393x852 (CSS px)
//   --headless=false|true

const { chromium, webkit, devices } = require('@playwright/test');

function getArg(key, def = null) {
  const m = process.argv.find(a => a.startsWith(`--${key}=`));
  if (!m) return def;
  return m.split('=').slice(1).join('=');
}

(async () => {
  const platform = (getArg('platform', 'android') || '').toLowerCase();
  const url = getArg('url', 'http://localhost:3000');
  const lang = getArg('lang', 'tr-TR');
  const tz = getArg('tz', 'Europe/Istanbul');
  const gpsStr = getArg('gps', '41.0082,28.9784'); // İstanbul
  const headless = (getArg('headless', 'false') + '').toLowerCase() === 'true';

  let viewport = getArg('viewport', null);
  if (viewport && viewport.includes('x')) {
    const [w, h] = viewport.split('x').map(n => parseInt(n.trim(), 10));
    viewport = { width: w, height: h };
  } else {
    viewport = null; // cihaz profiline bırak
  }

  const [latStr, lonStr] = gpsStr.split(',');
  const geolocation = {
    latitude: Number(latStr || 41.0082),
    longitude: Number(lonStr || 28.9784)
  };

  let browserType, deviceName, device;
  if (platform === 'ios') {
    browserType = webkit; // iOS Safari motoru
    deviceName = getArg('device', 'iPhone 14 Pro');
    device = devices[deviceName] || devices['iPhone 14 Pro'];
  } else if (platform === 'android') {
    browserType = chromium; // Android Chromium
    deviceName = getArg('device', 'Pixel 7');
    device = devices[deviceName] || devices['Pixel 7'];
  } else {
    console.error('Hatalı --platform. ios veya android kullanın.');
    process.exit(1);
  }

  const launchArgs = [];
  if (platform === 'android') {
    // Android deneyimini iyileştiren flag’ler
    launchArgs.push('--enable-features=TouchpadAndTouchscreen');
    launchArgs.push('--disable-infobars');
  }

  const browser = await browserType.launch({
    headless,
    args: launchArgs
  });

  const context = await browser.newContext({
    ...device,                      // UA, DPR, touch, vb.
    viewport: viewport || device.viewport,
    locale: lang,
    timezoneId: tz,
    geolocation,
    permissions: ['geolocation'],
    // iOS'ta zoom davranışları için kesin viewport vermek istersen üst satırdaki viewport’u kullan
  });

  // Page
  const page = await context.newPage();

  // Ufak UX iyileştirmeleri
  await page.addInitScript(() => {
    try {
      document.addEventListener('touchstart', () => {}, { passive: true });
    } catch {}
    // iOS Safari “tap highlight” azaltma (uyumlu tarayıcılarda)
    const style = document.createElement('style');
    style.textContent = `
      * { -webkit-tap-highlight-color: transparent; }
      button, a, input, textarea, select { touch-action: manipulation; }
    `;
    document.head.appendChild(style);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  console.log(
    `${platform === 'ios' ? '📱 iOS' : '🤖 Android'} emülasyonu açıldı: ${deviceName}\n` +
    `URL: ${url}\n` +
    `Dil: ${lang}  Zaman Dilimi: ${tz}\n` +
    `Konum: ${geolocation.latitude.toFixed(4)}, ${geolocation.longitude.toFixed(4)}\n` +
    `Viewport: ${ (viewport && `${viewport.width}x${viewport.height}`) || (device.viewport && `${device.viewport.width}x${device.viewport.height}`) }\n` +
    `Headless: ${headless}\n` +
    `İpucu: Kodunu kaydedince (HMR varsa) pencere anında güncellenir.`
  );
})();
