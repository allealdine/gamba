#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Comparing Local Workspace vs Published Packages\n');

// Test configurations
const configs = [
  { name: 'Published Packages', file: 'package_published.json' },
  { name: 'Local Workspace', file: 'package_local.json' },
];

const results = [];

for (const config of configs) {
  console.log(`\n📦 Testing: ${config.name}`);
  console.log('='.repeat(50));

  try {
    // Copy configuration
    execSync(`cp ${config.file} package.json`, { stdio: 'pipe' });
    console.log('✅ Configuration copied');

    // Install dependencies
    console.log('📥 Installing dependencies...');
    execSync('pnpm install', { stdio: 'pipe' });
    console.log('✅ Dependencies installed');

    // Start server and test
    console.log('🚀 Starting development server...');
    const server = execSync('pnpm dev', {
      stdio: 'pipe',
      timeout: 30000, // 30 seconds timeout
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Test server response
    try {
      const response = execSync(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000',
        {
          stdio: 'pipe',
          timeout: 5000,
        }
      );
      const statusCode = response.toString().trim();
      console.log(`🌐 Server response: ${statusCode}`);

      results.push({
        config: config.name,
        status: statusCode,
        success: statusCode === '200',
      });
    } catch (error) {
      console.log('❌ Server not responding');
      results.push({
        config: config.name,
        status: 'ERROR',
        success: false,
        error: error.message,
      });
    }

    // Stop server
    try {
      execSync('pkill -f "next dev"', { stdio: 'pipe' });
      console.log('🛑 Server stopped');
    } catch (e) {
      // Server might already be stopped
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    results.push({
      config: config.name,
      status: 'ERROR',
      success: false,
      error: error.message,
    });
  }
}

// Summary
console.log('\n📊 SUMMARY');
console.log('='.repeat(50));

results.forEach(result => {
  const status = result.success ? '✅' : '❌';
  console.log(`${status} ${result.config}: ${result.status}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
});

// Analysis
console.log('\n🔍 ANALYSIS');
console.log('='.repeat(50));

const published = results.find(r => r.config.includes('Published'));
const local = results.find(r => r.config.includes('Local'));

if (published && local) {
  if (published.success && !local.success) {
    console.log(
      '❌ ISSUE DETECTED: Local workspace packages are failing while published packages work.'
    );
    console.log('   This indicates a workspace module resolution issue.');
  } else if (!published.success && local.success) {
    console.log(
      '⚠️  UNEXPECTED: Local workspace packages work but published packages fail.'
    );
  } else if (published.success && local.success) {
    console.log('✅ BOTH CONFIGURATIONS WORK: No issues detected.');
  } else {
    console.log('❌ BOTH CONFIGURATIONS FAIL: There may be a broader issue.');
  }
}

console.log('\n💡 RECOMMENDATIONS:');
if (published && local && published.success && !local.success) {
  console.log('1. Check workspace module resolution in Next.js configuration');
  console.log('2. Verify that workspace packages are built correctly');
  console.log('3. Check for ESM/CommonJS compatibility issues');
  console.log(
    '4. Consider using published packages until workspace issues are resolved'
  );
}

