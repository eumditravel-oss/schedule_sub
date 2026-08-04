// tests/faviconAndOg.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Favicon, Manifest & Open Graph Metadata Verification', () => {
  const publicDir = path.join(process.cwd(), 'public');
  const indexHtmlPath = path.join(process.cwd(), 'index.html');

  it('1. Required favicon and icon files exist in public/', () => {
    const requiredFiles = [
      'favicon.ico',
      'favicon.svg',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'apple-touch-icon.png',
      'icon-192x192.png',
      'icon-512x512.png',
      'maskable-icon-512x512.png',
      'site.webmanifest',
      'og-preview-v1.png',
    ];

    for (const f of requiredFiles) {
      const filePath = path.join(publicDir, f);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('2. og-preview-v1.png file size is under 5MB', () => {
    const ogPath = path.join(publicDir, 'og-preview-v1.png');
    const stats = fs.statSync(ogPath);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.size).toBeLessThan(5 * 1024 * 1024);
  });

  it('3. index.html contains static OG metadata and favicon links', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');

    expect(html).toContain('<link rel="icon" href="/favicon.ico"');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest"');
    expect(html).toContain('og:title');
    expect(html).toContain('og:image');
    expect(html).toContain('https://concost-dev-scheduler.eumditravel.workers.dev/og-preview-v1.png');
    expect(html).toContain('twitter:card');
    expect(html).toContain('개발팀 프로젝트 스케쥴러');
  });

  it('4. site.webmanifest contains valid JSON structure and icons', () => {
    const manifestPath = path.join(publicDir, 'site.webmanifest');
    const jsonStr = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(jsonStr);

    expect(manifest.name).toBe('CON-COST × VIETQS 개발팀 프로젝트 스케쥴러');
    expect(manifest.start_url).toBe('/projects');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });
});
