#!/usr/bin/env node

/**
 * Validate PWA configuration
 * Checks manifest.json, service-worker.js, icons, and HTML meta tags
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const errors = [];
const warnings = [];
const success = [];

console.log('🔍 Validating PWA Configuration\n');
console.log('='.repeat(50));

// Check manifest.json
console.log('\n📄 Checking manifest.json...');
const manifestPath = path.join(publicDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Check required fields
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
    requiredFields.forEach(field => {
      if (manifest[field]) {
        success.push(`✓ Manifest has ${field}`);
      } else {
        errors.push(`✗ Manifest missing ${field}`);
      }
    });
    
    // Check display mode
    if (manifest.display === 'standalone' || manifest.display === 'fullscreen') {
      success.push(`✓ Display mode: ${manifest.display}`);
    } else {
      warnings.push(`⚠ Display mode is ${manifest.display}, consider 'standalone' or 'fullscreen'`);
    }
    
    // Check icons
    if (manifest.icons && manifest.icons.length > 0) {
      success.push(`✓ Manifest has ${manifest.icons.length} icons`);
      
      // Check for recommended sizes
      const sizes = manifest.icons.map(icon => icon.sizes).flat();
      const recommendedSizes = ['192x192', '512x512'];
      recommendedSizes.forEach(size => {
        if (sizes.includes(size)) {
          success.push(`✓ Icon size ${size} present`);
        } else {
          warnings.push(`⚠ Missing recommended icon size: ${size}`);
        }
      });
    } else {
      errors.push('✗ No icons defined in manifest');
    }
    
  } catch (error) {
    errors.push(`✗ Error parsing manifest.json: ${error.message}`);
  }
} else {
  errors.push('✗ manifest.json not found');
}

// Check service worker
console.log('\n🔧 Checking service-worker.js...');
const swPath = path.join(publicDir, 'service-worker.js');
if (fs.existsSync(swPath)) {
  success.push('✓ service-worker.js exists');
  
  const swContent = fs.readFileSync(swPath, 'utf8');
  
  // Check for essential service worker features
  if (swContent.includes('install')) {
    success.push('✓ Service worker has install event');
  } else {
    errors.push('✗ Service worker missing install event');
  }
  
  if (swContent.includes('fetch')) {
    success.push('✓ Service worker has fetch event');
  } else {
    warnings.push('⚠ Service worker missing fetch event (no offline support)');
  }
  
  if (swContent.includes('activate')) {
    success.push('✓ Service worker has activate event');
  } else {
    warnings.push('⚠ Service worker missing activate event');
  }
} else {
  errors.push('✗ service-worker.js not found');
}

// Check icons
console.log('\n🎨 Checking PWA icons...');
const requiredIcons = [
  'icon-192x192.png',
  'icon-512x512.png',
  'apple-touch-icon.png'
];

requiredIcons.forEach(icon => {
  const iconPath = path.join(publicDir, icon);
  if (fs.existsSync(iconPath)) {
    const stats = fs.statSync(iconPath);
    success.push(`✓ ${icon} exists (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    errors.push(`✗ Missing icon: ${icon}`);
  }
});

// Check index.html
console.log('\n📱 Checking index.html...');
const indexPath = path.join(publicDir, 'index.html');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Check for PWA meta tags
  const metaTags = [
    { tag: 'manifest', desc: 'Manifest link' },
    { tag: 'theme-color', desc: 'Theme color' },
    { tag: 'apple-mobile-web-app-capable', desc: 'iOS app capable' },
    { tag: 'apple-mobile-web-app-status-bar-style', desc: 'iOS status bar' },
    { tag: 'apple-touch-icon', desc: 'Apple touch icon' },
  ];
  
  metaTags.forEach(({ tag, desc }) => {
    if (indexContent.includes(tag)) {
      success.push(`✓ ${desc} present`);
    } else {
      warnings.push(`⚠ Missing ${desc}`);
    }
  });
} else {
  errors.push('✗ index.html not found');
}

// Print results
console.log('\n' + '='.repeat(50));
console.log('\n📊 Results:\n');

if (success.length > 0) {
  console.log('✅ Success (' + success.length + '):');
  success.forEach(msg => console.log('   ' + msg));
}

if (warnings.length > 0) {
  console.log('\n⚠️  Warnings (' + warnings.length + '):');
  warnings.forEach(msg => console.log('   ' + msg));
}

if (errors.length > 0) {
  console.log('\n❌ Errors (' + errors.length + '):');
  errors.forEach(msg => console.log('   ' + msg));
}

console.log('\n' + '='.repeat(50));

if (errors.length === 0) {
  console.log('\n✨ PWA configuration looks good!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  PWA configuration has issues that need to be fixed.\n');
  process.exit(1);
}
