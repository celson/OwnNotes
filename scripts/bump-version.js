#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const targetVersion = process.argv[2];
if (!targetVersion || !/^\d+\.\d+\.\d+/.test(targetVersion)) {
  console.error('Usage: node scripts/bump-version.js <version>');
  process.exit(1);
}

console.log(`Bumping all project versions to ${targetVersion}...`);

// 1. package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ package.json');

// 2. package-lock.json
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = targetVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = targetVersion;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log('✓ package-lock.json');
}

// 3. src-tauri/tauri.conf.json
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriPath)) {
  const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
  tauri.version = targetVersion;
  fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
  console.log('✓ src-tauri/tauri.conf.json');
}

// 4. src-tauri/Cargo.toml
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${targetVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
  console.log('✓ src-tauri/Cargo.toml');
}

// 5. src/services/updateService.ts
const updateServicePath = path.join(root, 'src', 'services', 'updateService.ts');
if (fs.existsSync(updateServicePath)) {
  let code = fs.readFileSync(updateServicePath, 'utf8');
  code = code.replace(/export const APP_VERSION = '[^']+';/, `export const APP_VERSION = '${targetVersion}';`);
  fs.writeFileSync(updateServicePath, code);
  console.log('✓ src/services/updateService.ts');
}

// 6. android/app/build.gradle
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const [major, minor, patch] = targetVersion.split('.').map((x) => parseInt(x, 10) || 0);
  const code = Math.max(major * 10000 + minor * 100 + patch, 21);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${targetVersion}"`);
  fs.writeFileSync(gradlePath, gradle);
  console.log(`✓ android/app/build.gradle (versionName: ${targetVersion}, versionCode: ${code})`);
}

console.log(`All files successfully synchronized to v${targetVersion}!`);
