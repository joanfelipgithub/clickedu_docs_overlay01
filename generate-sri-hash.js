// generate-sri-hash.js
// Run this with: node generate-sri-hash.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Read your bookmarklet.js file
const filePath = path.join(__dirname, 'bookmarklet.js');
const fileContent = fs.readFileSync(filePath, 'utf8');

// Generate SHA-384 hash (recommended for SRI)
const hash384 = crypto.createHash('sha384').update(fileContent).digest('base64');
const hash512 = crypto.createHash('sha512').update(fileContent).digest('base64');

console.log('='.repeat(80));
console.log('SRI HASH GENERATION');
console.log('='.repeat(80));
console.log('\n📄 File:', filePath);
console.log('📊 Size:', fileContent.length, 'bytes\n');

console.log('🔐 SHA-384 (Recommended):');
console.log(`   sha384-${hash384}\n`);

console.log('🔐 SHA-512 (Most Secure):');
console.log(`   sha512-${hash512}\n`);

console.log('='.repeat(80));
console.log('USE THIS IN YOUR BOOKMARKLET:');
console.log('='.repeat(80));
console.log(`
s.integrity = 'sha384-${hash384}';
s.crossOrigin = 'anonymous';
`);

// Also save to a version file for tracking
const versionInfo = {
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  sha384: `sha384-${hash384}`,
  sha512: `sha512-${hash512}`,
  fileSize: fileContent.length
};

fs.writeFileSync('version.json', JSON.stringify(versionInfo, null, 2));
console.log('✅ Version info saved to version.json');
