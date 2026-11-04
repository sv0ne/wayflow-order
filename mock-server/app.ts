import { cors } from 'hono/cors';
import { Hono } from 'hono';

import { adTypes, countries, sites, themes, topPicks } from './data.ts';

type MetricFilters = {
  sites?: unknown;
  countries?: unknown;
  themes?: unknown;
  adTypes?: unknown;
  adsTypeChoice?: unknown;
  orderId?: unknown;
};

const app = new Hono();
const orderVersions = new Map<string, number>();
const orderAlternatives = new Map<string, Array<{ id: string; site: number; country: string | null; theme: string | null; adType: string }>>();

// Mock data has no real site-country relationships, so assign countries deterministically by site position.
function sitesForCountries(selectedCountries: string[]) {
  if (selectedCountries.length === 0) return sites;
  return sites.filter((_, index) => selectedCountries.includes(countries[index % countries.length]));
}

function themesForCountries(selectedCountries: string[]) {
  if (selectedCountries.length === 0) return themes;
  const selectedSites = new Set(sitesForCountries(selectedCountries));
  const themeBySite = new Map(topPicks.map((item) => [item.domain, item.theme]));
  const availableThemes = new Set<string>();

  sites.forEach((site, index) => {
    if (!selectedSites.has(site)) return;
    availableThemes.add(themeBySite.get(site) ?? themes[index % themes.length]);
  });

  return themes.filter((theme) => availableThemes.has(theme));
}

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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
    version: orderVersions.get(id) ?? 1,
    expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    stats: { tds: 145100, gsc: 125200, price: 15000 },
    topPicks: topPicks.slice(0, 5),
    filters: { sites: sites.slice(0, 20), countries, themes, adTypes },
  });
});

app.get('/api/filter-options', (context) => {
  const selected = context.req.queries('country') ?? [];
  const filteredSites = sitesForCountries(selected);
  return context.json({
    themes: themesForCountries(selected),
    sites: filteredSites.slice(0, 20),
    nextOffset: filteredSites.length > 20 ? 20 : null,
  });
});

app.get('/api/sites', (context) => {
  const search = (context.req.query('search') ?? '').toLowerCase();
  const selectedCountries = context.req.queries('country') ?? [];
  const offset = Math.max(0, Number(context.req.query('offset')) || 0);
  const limit = Math.min(20, Math.max(1, Number(context.req.query('limit')) || 20));
  const countrySites = sitesForCountries(selectedCountries);
  const filtered = countrySites.filter((site) => site.toLowerCase().includes(search));
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
  const hasConflict = selectedAds.includes('flat-position-4-6');
  const needsAdsTypeChoice = hasConflict && !['asc', 'desc', 'match'].includes(String(payload.adsTypeChoice));
  const replacement = payload.adsTypeChoice === 'desc' ? 'Position 2-3' : payload.adsTypeChoice === 'asc' ? 'Position 7-10' : null;
  const orderId = String(payload.orderId ?? '');
  const alternatives = hasConflict && replacement ? sites.slice(20, 25).map((_, index) => ({
    id: `alternative-${index + 1}`,
    site: Math.floor(Math.random() * 6) + 1,
    country: selectedCountries.length ? selectedCountries[index % selectedCountries.length] : null,
    theme: selectedThemes.length ? selectedThemes[index % selectedThemes.length] : null,
    adType: replacement,
  })) : [];

  const version = (orderVersions.get(orderId) ?? 1) + 1;
  orderVersions.set(orderId, version);
  orderAlternatives.set(orderId, alternatives);

  return context.json({
    needsAdsTypeChoice,
    stats: { tds: Math.round(145100 * factor), gsc: Math.round(125200 * factor), price: Math.round(15000 * factor) },
    topPicks: filteredTopPicks.map((item) => ({ ...item, clicks: Math.round(item.clicks * factor) })),
    alternatives,
    version,
  });
});

app.delete('/api/alternatives/:alternativeId', (context) => {
  const orderId = context.req.query('orderId') ?? '';
  const alternativeId = context.req.param('alternativeId');
  const requestedVersion = context.req.query('version');
  const version = orderVersions.get(orderId) ?? 1;
  if (Number(requestedVersion) !== version) return context.json({ error: 'Order changed. Refresh the estimate and try again.' }, 409);
  const current = orderAlternatives.get(orderId) ?? [];
  if (!current.some((item) => item.id === alternativeId)) return context.json({ error: 'Alternative not found' }, 404);
  const alternatives = current.filter((item) => item.id !== alternativeId);
  orderAlternatives.set(orderId, alternatives);
  const nextVersion = version + 1;
  orderVersions.set(orderId, nextVersion);
  const remaining = alternatives.reduce((sum, item) => sum + item.site, 0);
  const factor = Math.max(0.42, 1 - remaining * 0.035);
  return context.json({
    stats: { tds: Math.round(145100 * factor), gsc: Math.round(125200 * factor), price: Math.round(15000 * factor) },
    topPicks: topPicks.slice(0, 5).map((item) => ({ ...item, clicks: Math.round(item.clicks * factor) })),
    alternatives,
    version: nextVersion,
  });
});

export default app;
