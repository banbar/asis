// generate-2fa-secret.js
const speakeasy = require('speakeasy');

const secret = speakeasy.generateSecret({
  name: 'AfetYonetimi (supervisor1)',
  length: 20, // base32 uzunluğunu artırır
});

console.log('BASE32 manual key:', secret.base32);
console.log('otpauth URL (QR):', secret.otpauth_url);
