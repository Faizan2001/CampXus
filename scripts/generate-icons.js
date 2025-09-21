import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function generateIcons() {
  const svgPath = resolve(process.cwd(), 'public/icons/icon.svg');
  const svgContent = await readFile(svgPath, 'utf8');

  const targets = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
  { name: 'icon-48x48.png', size: 48 },
    { name: 'icon-16x16.png', size: 16 },
    { name: 'icon-32x32.png', size: 32 },
    { name: 'icon-72x72.png', size: 72 },
    { name: 'icon-96x96.png', size: 96 },
    { name: 'icon-128x128.png', size: 128 },
    { name: 'icon-144x144.png', size: 144 },
    { name: 'icon-152x152.png', size: 152 },
    { name: 'icon-192x192.png', size: 192 },
    { name: 'icon-384x384.png', size: 384 },
    { name: 'icon-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 }
  ];

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--no-zygote'
    ],
    chromiumSandbox: false
  });
  const page = await browser.newPage();

  for (const { name, size } of targets) {
    const outputPath = resolve(process.cwd(), 'public/icons', name);

    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                margin: 0;
                width: 100vw;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                background: transparent;
              }
              svg {
                width: ${size}px;
                height: ${size}px;
              }
            </style>
          </head>
          <body>
            ${svgContent}
          </body>
        </html>`,
      { waitUntil: 'load' }
    );

    await page.waitForTimeout(50);
    await page.screenshot({ path: outputPath, omitBackground: true });
    console.log(`Generated ${name}`);
  }

  await browser.close();
}

generateIcons().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
