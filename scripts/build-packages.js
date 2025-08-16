#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packages = ['core', 'react', 'react-ui'];

console.log('🧹 Cleaning all packages...');
packages.forEach(pkg => {
  const pkgPath = path.join(__dirname, '..', 'packages', pkg);
  if (fs.existsSync(path.join(pkgPath, 'dist'))) {
    fs.rmSync(path.join(pkgPath, 'dist'), { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(pkgPath, '.turbo'))) {
    fs.rmSync(path.join(pkgPath, '.turbo'), { recursive: true, force: true });
  }
});

console.log('🔨 Building packages in order...');
packages.forEach(pkg => {
  console.log(`Building ${pkg}...`);
  const pkgPath = path.join(__dirname, '..', 'packages', pkg);
  execSync('pnpm build', { cwd: pkgPath, stdio: 'inherit' });
});

console.log('✅ All packages built successfully!');
console.log('📦 You can now use workspace:* dependencies in your apps.');
