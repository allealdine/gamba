#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packages = [
  {
    name: 'core',
    workspace: 'packages/core',
    published: 'apps/play/node_modules/gamba-core-v2',
  },
  {
    name: 'react',
    workspace: 'packages/react',
    published: 'apps/play/node_modules/gamba-react-v2',
  },
  {
    name: 'react-ui',
    workspace: 'packages/react-ui',
    published: 'apps/play/node_modules/gamba-react-ui-v2',
  },
];

console.log('🔍 Verifying workspace packages match published packages...\n');

let allMatch = true;

packages.forEach(pkg => {
  console.log(`Checking ${pkg.name}...`);

  // Check package.json
  try {
    execSync(
      `diff ${pkg.workspace}/package.json ${pkg.published}/package.json`,
      { stdio: 'pipe' }
    );
    console.log(`  ✅ package.json matches`);
  } catch (error) {
    console.log(`  ❌ package.json differs`);
    allMatch = false;
  }

  // Check dist files
  const workspaceDist = path.join(pkg.workspace, 'dist');
  const publishedDist = path.join(pkg.published, 'dist');

  if (fs.existsSync(workspaceDist) && fs.existsSync(publishedDist)) {
    try {
      execSync(`diff -r ${workspaceDist} ${publishedDist}`, { stdio: 'pipe' });
      console.log(`  ✅ dist/ files match`);
    } catch (error) {
      console.log(`  ❌ dist/ files differ`);
      allMatch = false;
    }
  } else {
    console.log(`  ⚠️  dist/ directory missing in one or both locations`);
    allMatch = false;
  }

  console.log('');
});

if (allMatch) {
  console.log('🎉 All packages match perfectly!');
  console.log(
    '📦 You can now safely use workspace:* dependencies in your apps.'
  );
} else {
  console.log(
    '❌ Some packages do not match. Please rebuild with: pnpm build:packages:clean'
  );
  process.exit(1);
}
