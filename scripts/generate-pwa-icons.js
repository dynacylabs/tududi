#!/usr/bin/env node

/**
 * Script to generate PWA icons from favicon.svg
 * This script will attempt to use sharp if available, or create an HTML generator
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const svgPath = path.join(publicDir, 'favicon.svg');

const icons = [
  { size: 192, name: 'icon-192x192.png', purpose: 'Android standard icon' },
  { size: 512, name: 'icon-512x512.png', purpose: 'Android high-res icon' },
  { size: 180, name: 'apple-touch-icon.png', purpose: 'iOS home screen icon' },
  { size: 152, name: 'apple-touch-icon-152x152.png', purpose: 'iOS iPad icon' },
  { size: 167, name: 'apple-touch-icon-167x167.png', purpose: 'iOS iPad Pro icon' },
];

console.log('PWA Icon Generator');
console.log('==================\n');

// Check if SVG exists
if (!fs.existsSync(svgPath)) {
  console.error('Error: favicon.svg not found at', svgPath);
  process.exit(1);
}

console.log('Source:', svgPath);

// Try to use sharp
let sharp;
try {
  sharp = require('sharp');
  console.log('✓ Sharp is available, generating icons...\n');
  
  async function generateIcons() {
    for (const icon of icons) {
      const outputPath = path.join(publicDir, icon.name);
      try {
        await sharp(svgPath)
          .resize(icon.size, icon.size)
          .png()
          .toFile(outputPath);
        console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size})`);
      } catch (error) {
        console.error(`✗ Failed to generate ${icon.name}:`, error.message);
      }
    }
    console.log('\n✓ All icons generated successfully!');
  }
  
  generateIcons().catch(error => {
    console.error('Error generating icons:', error);
    process.exit(1);
  });
  
} catch (error) {
  console.log('Sharp not available, creating HTML generator...\n');
  
  // Read the SVG to create a data URL we can reference
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const svgBase64 = Buffer.from(svgContent).toString('base64');
  const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

  // Create an HTML file that can be opened in a browser to generate icons
  const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Generate PWA Icons</title>
  <style>
    body { font-family: system-ui; padding: 20px; }
    canvas { border: 1px solid #ccc; margin: 10px; }
    .icon-set { margin: 20px 0; }
    button { padding: 10px 20px; font-size: 16px; margin: 10px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>PWA Icon Generator</h1>
  <p>Click the buttons below to download each icon:</p>
  <div id="icons"></div>
  
  <script>
    const icons = ${JSON.stringify(icons)};
    const svgDataUrl = ${JSON.stringify(svgDataUrl)};
    
    const container = document.getElementById('icons');
    
    icons.forEach(icon => {
      const div = document.createElement('div');
      div.className = 'icon-set';
      
      const canvas = document.createElement('canvas');
      canvas.width = icon.size;
      canvas.height = icon.size;
      
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0, icon.size, icon.size);
        
        const button = document.createElement('button');
        button.textContent = \`Download \${icon.name}\`;
        button.onclick = () => {
          canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = icon.name;
            a.click();
            URL.revokeObjectURL(url);
          });
        };
        
        const label = document.createElement('p');
        label.textContent = \`\${icon.name} (\${icon.size}x\${icon.size}) - \${icon.purpose}\`;
        
        div.appendChild(label);
        div.appendChild(canvas);
        div.appendChild(button);
      };
      
      img.src = svgDataUrl;
      container.appendChild(div);
    });
  </script>
</body>
</html>`;

  const htmlPath = path.join(publicDir, 'generate-pwa-icons.html');
  fs.writeFileSync(htmlPath, htmlTemplate);

  console.log('✓ Created HTML icon generator:', htmlPath);
  console.log('\nTo generate icons:');
  console.log('1. Open', htmlPath, 'in a browser');
  console.log('2. Click each download button');
  console.log('3. Save the files to the public directory');
  console.log('\n--- OR ---\n');
  console.log('Install sharp for automatic generation:');
  console.log('  npm install --save-dev sharp');
  console.log('  Then run this script again.\n');
}
