import { cors } from 'hono/cors';
import { Hono } from 'hono';

import { adTypes, countries, sites, themes, topPicks } from './data.ts';

type MetricFilters = {
  sites?: unknown;
  countries?: unknown;
  themes?: unknown;
  adTypes?: unknown;
  adsTypeChoice?: unknown;
};

const app = new Hono();

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.use('/api/*', async (c, next) => {
  // Добавляем искусственную задержку
  await new Promise((resolve) => setTimeout(resolve, 1500))

  await next()
});

app.get('/api/welcome', (context) => context.json({ message: 'Welcome to the server!' }));

app.get('/api/order', (context) => {
  const id = context.req.query('id') ?? '';
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(id)) return context.json({ error: 'A valid order id is required' }, 400);

  return context.json({
    id,
    expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    stats: { tds: 145100, gsc: 125200, price: 15000 },
    topPicks: topPicks.slice(0, 5),
    filters: { sites: sites.slice(0, 20), countries, themes, adTypes },
  });
});

app.get('/api/sites', (context) => {
  const search = (context.req.query('search') ?? '').toLowerCase();
  const offset = Math.max(0, Number(context.req.query('offset')) || 0);
  const limit = Math.min(20, Math.max(1, Number(context.req.query('limit')) || 20));
  const filtered = sites.filter((site) => site.toLowerCase().includes(search));
  return context.json({
    items: filtered.slice(offset, offset + limit),
    nextOffset: offset + limit < filtered.length ? offset + limit : null,
  });
});

app.post('/api/metrics', async (context) => {
  const payload = await context.req.json<MetricFilters>().catch(() => ({} as MetricFilters));
  const selectedSites = Array.isArray(payload.sites) ? payload.sites : [];
  const selectedCountries = Array.isArray(payload.countries) ? payload.countries : [];
  const selectedThemes = Array.isArray(payload.themes) ? payload.themes : [];
  const selectedAds = Array.isArray(payload.adTypes) ? payload.adTypes as string[] : [];
  const selectedSiteSet = new Set(selectedSites as string[]);
  const selectedThemeSet = new Set(selectedThemes as string[]);
  const filteredTopPicks = topPicks.filter((item) =>
    (selectedSiteSet.size === 0 || selectedSiteSet.has(item.domain)) &&
    (selectedThemeSet.size === 0 || selectedThemeSet.has(item.theme))
  ).slice(0, 5);
  const factor = Math.max(0.42, 1 - selectedSites.length * 0.035 - selectedCountries.length * 0.025 - selectedThemes.length * 0.02 + selectedAds.length * 0.015);
  const hasConflict = selectedAds.includes('flat-position-4-6') || selectedAds.includes('banner-fixed-bottom');
  const replacement = payload.adsTypeChoice === 'desc' ? 'Position 2-3' : payload.adsTypeChoice === 'asc' ? 'Position 7-10' : null;
  const alternatives = hasConflict && replacement ? sites.slice(20, 25).map((_, index) => ({
    id: `alternative-${index + 1}`,
    site: Math.floor(Math.random() * 6) + 1,
    country: selectedCountries.length ? selectedCountries[index % selectedCountries.length] : null,
    theme: selectedThemes.length ? selectedThemes[index % selectedThemes.length] : null,
    adType: replacement,
  })) : [];

  return context.json({
    stats: { tds: Math.round(145100 * factor), gsc: Math.round(125200 * factor), price: Math.round(15000 * factor) },
    topPicks: filteredTopPicks.map((item) => ({ ...item, clicks: Math.round(item.clicks * factor) })),
    alternatives,
  });
});

export default app;
