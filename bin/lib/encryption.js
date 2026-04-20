// AES-256-CBC file encryption/decryption — matches the format used by
// bstackautomation-helpers (<iv_hex>.<ciphertext_hex>, sha256(password) as key).
// Standalone: no dependency on bstackautomation-helpers.

'use strict';

const fs = require('node:fs');
const crypt = require('node:crypto');

const ALG = 'AES-256-CBC';

function getCipherKey(password) {
  return crypt.createHash('sha256').update(password).digest();
}

function encryptFile(password, filePath) {
  const content = fs.readFileSync(filePath).toString();
  if (!content.includes('exports')) {
    // heuristic from bstackautomation-helpers — encrypted files have no module.exports
    console.error(`[encrypt] ${filePath}: already encrypted`);
    return true;
  }
  const iv = crypt.randomBytes(16);
  const cipher = crypt.createCipheriv(ALG, getCipherKey(password), iv);
  let cipherHex = cipher.update(content, 'utf8', 'hex');
  cipherHex += cipher.final('hex');
  fs.writeFileSync(filePath, `${iv.toString('hex')}.${cipherHex}`);
  console.error(`[encrypt] ${filePath}: OK`);
  return true;
}

function decryptFile(password, filePath) {
  const content = fs.readFileSync(filePath).toString();
  if (content.includes('exports')) {
    console.error(`[decrypt] ${filePath}: already decrypted`);
    return true;
  }
  const [ivHex, ctHex] = content.split('.');
  if (!ivHex || !ctHex) throw new Error(`${filePath}: not encrypted format (expected <iv>.<cipher>)`);
  const decipher = crypt.createDecipheriv(ALG, getCipherKey(password), Buffer.from(ivHex, 'hex'));
  let plain = decipher.update(Buffer.from(ctHex, 'hex'));
  plain = Buffer.concat([plain, decipher.final()]);
  fs.writeFileSync(filePath, plain);
  console.error(`[decrypt] ${filePath}: OK`);
  return true;
}

module.exports = { encryptFile, decryptFile };
