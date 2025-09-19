#!/usr/bin/env node
// Simple sitemap generator for MeetchuThere
// Usage: SITE_URL=https://meetchuthere.com node scripts/generate-sitemap.js

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'https://meetchuthere.com').replace(/\/$/, '');
const now = new Date().toISOString();

// Only public, indexable URLs here. SPA uses hash routes but we still include them for discoverability.
const urls = [
  { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/about/`, changefreq: 'monthly', priority: '0.6' },
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
`\n</urlset>\n`;

const outPath = resolve('public', 'sitemap.xml');
writeFileSync(outPath, xml, 'utf8');
console.log(`✅ Generated sitemap at ${outPath} with ${urls.length} URLs`);
