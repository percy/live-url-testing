#!/usr/bin/env node
// Encrypt the config file for the given PROFILE using ENCRYPTION_PASSWORD.
// Usage: PROFILE=prod ENCRYPTION_PASSWORD=... node bin/encrypt-config.js

'use strict';

const path = require('node:path');
const { encryptFile } = require('./lib/encryption');

const profile = process.env.PROFILE || 'prod';
const password = process.env.ENCRYPTION_PASSWORD;
if (!password) {
  console.error('ERROR: ENCRYPTION_PASSWORD env var is required');
  process.exit(2);
}
const target = path.resolve(`./configs/${profile}.js`);
encryptFile(password, target);
