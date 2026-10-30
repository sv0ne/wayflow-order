import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api/client';
import { FilterDialog, type FilterKind } from './components/FilterDialog';
import { Countdown } from './components/Countdown';

type AdOption = { id: string; name: string; occupied: boolean };
type AdGroup = { category: string; options: AdOption[] };
type Order = {
  id: string;
  expiresAt: string;
  stats: { tds: number; gsc: number; price: number };
  topPicks: Pick[];
  filters: { sites: string[]; countries: string[]; themes: string[]; adTypes: AdGroup[] };
};
type Stats = Order['stats'];
type Pick = { domain: string; clicks: number };
type Alternative = { id: string; site: string; country: string; theme: string; adType: string };
type MetricsResponse = { stats: Stats; topPicks: Pick[]; alternatives: Alternative[]; applied: boolean };
type MetricFilters = { sites: string[]; countries: string[]; themes: string[]; adTypes: string[] };
type AdsChoice = 'ascending' | 'descending' | 'matching';
type SavedAdsSettings = { choice: AdsChoice; alwaysApply: boolean };

const settingKey = 'workingdrops.adsTypeSettings';
const sitesNoticeKey = 'workingdrops.sitesOnlyNoticeSeen';
const alternativesNoticeKey = 'workingdrops.alternativesNoticeSeen';

function readSettings(): SavedAdsSettings | null {
  try {
    const value = localStorage.getItem(settingKey);
    return value ? JSON.parse(value) as SavedAdsSettings : null;
  } catch {
    return null;
  }
}

function useOrderId() {
  const candidate = window.location.pathname.split('/').filter(Boolean)[0];
  return candidate && candidate !== 'index.html' ? candidate : 'dvvt23fdf3f';
}

function MetricCard({ stats }: { stats: Stats }) {
  return <section className="stats-card" aria-label="Order estimate">
    <div className="metrics-line">
      <div className="metric"><span className="metric-label">TDS</span><strong>{stats.tds.toLocaleString('en-US')}</strong><span className="metric-caption">clicks</span></div>
      <span className="metric-divider" />
      <div className="metric"><span className="metric-label">GSC</span><strong>{stats.gsc.toLocaleString('en-US')}</strong><span className="metric-caption">clicks</span></div>
    </div>
    <div className="price"><span>$</span>{stats.price.toLocaleString('en-US')}</div>
  </section>;
}

function RankingTable({ items, mode }: { items: Pick[]; mode: 'Sites' | 'Themes' }) {
  return <div className="ranking-table" role="table" aria-label={`Top ${mode.toLowerCase()}`}>
    <div className="ranking-row ranking-head" role="row"><span>#</span><span>{mode === 'Sites' ? 'Domain' : 'Theme'}</span><span>Clicks</span></div>
    {items.map((item, index) => <div className="ranking-row" role="row" key={item.domain}>
      <span className="rank">{index + 1}</span><span className="domain">{mode === 'Sites' ? item.domain : ['Big Bass Splash', 'Aviator', 'Pin-UP', 'Book of Dead', 'Sweet Bonanza'][index]}</span><span className="clicks">{item.clicks.toLocaleString('en-US')}</span>
    </div>)}
  </div>;
}

function InfoIcon() {
  return <img src="/assets/help-icon.svg" alt="" aria-hidden="true"/>;
}

function App() {
  const orderId = useOrderId();
  const [order, setOrder] = useState<Order | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPicks, setTopPicks] = useState<Pick[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [filters, setFilters] = useState<MetricFilters>({ sites: [], countries: [], themes: [], adTypes: [] });
  const [activeDialog, setActiveDialog] = useState<FilterKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [topMode, setTopMode] = useState<'Sites' | 'Themes'>('Sites');
  const [settings, setSettings] = useState<SavedAdsSettings | null>(() => readSettings());
  const [draftChoice, setDraftChoice] = useState<AdsChoice | null>(() => readSettings()?.choice ?? null);
  const [alwaysApply, setAlwaysApply] = useState(() => readSettings()?.alwaysApply ?? false);
  const [settingsForced, setSettingsForced] = useState(false);
  const [settingsApplied, setSettingsApplied] = useState(false);
  const [sitesNotice, setSitesNotice] = useState(() => !localStorage.getItem(sitesNoticeKey));
  const [alternativesNotice, setAlternativesNotice] = useState(() => !localStorage.getItem(alternativesNoticeKey));
  const requestCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Order>(`/api/order?id=${encodeURIComponent(orderId)}`)
      .then((data) => {
        if (cancelled) return;
        setOrder(data);
        setStats(data.stats);
        setTopPicks(data.topPicks);
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load this order.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const hasOccupiedSelection = useMemo(() => {
    if (!order) return false;
    const selected = new Set(filters.adTypes);
    return order.filters.adTypes.some((group) => group.options.some((option) => selected.has(option.id) && option.occupied));
  }, [filters.adTypes, order]);

  const updateMetrics = useCallback(async (next: MetricFilters, adsTypeChoice?: AdsChoice | null) => {
    const requestId = ++requestCounter.current;
    setUpdating(true);
    setError('');
    try {
      const result = await api<MetricsResponse>('/api/metrics', { method: 'POST', body: JSON.stringify({ ...next, orderId, adsTypeChoice: adsTypeChoice ?? settings?.choice }) });
      if (requestId !== requestCounter.current) return;
      setStats(result.stats);
      setTopPicks(result.topPicks);
      setAlternatives(result.alternatives ?? []);
    } catch (reason) {
      if (requestId === requestCounter.current) setError(reason instanceof Error ? reason.message : 'Could not update the estimate.');
    } finally {
      if (requestId === requestCounter.current) setUpdating(false);
    }
  }, [orderId, settings]);

  const applyFilter = (kind: FilterKind, values: string[]) => {
    const key = kind === 'adsType' ? 'adTypes' : kind;
    const next = { ...filters, [key]: values };
    if (kind === 'sites' && values.length > 1) {
      next.countries = [];
      next.themes = [];
    }
    setFilters(next);
    setActiveDialog(null);
    const selectedOccupied = kind === 'adsType' && order?.filters.adTypes.some((group) => group.options.some((option) => option.occupied && values.includes(option.id)));
    if (selectedOccupied && !settings) {
      setSettingsForced(true);
      setDraftChoice(null);
    } else {
      setSettingsForced(false);
      void updateMetrics(next);
    }
  };

  const resetSites = () => {
    const next = { ...filters, sites: [] };
    setFilters(next);
    setActiveDialog(null);
    void updateMetrics(next);
  };

  const saveAdsSettings = async () => {
    if (!draftChoice) return;
    const result = await api<{ choice: AdsChoice; alwaysApply: boolean }>('/api/ads-settings', {
      method: 'POST', body: JSON.stringify({ choice: draftChoice, alwaysApply }),
    });
    const saved = { choice: result.choice, alwaysApply: result.alwaysApply };
    setSettings(saved);
    if (alwaysApply) localStorage.setItem(settingKey, JSON.stringify(saved));
    else localStorage.removeItem(settingKey);
    setSettingsForced(false);
    setSettingsApplied(true);
    window.setTimeout(() => setSettingsApplied(false), 520);
    void updateMetrics(filters, saved.choice);
  };

  const dismissSitesNotice = () => {
    setSitesNotice(false);
    localStorage.setItem(sitesNoticeKey, '1');
  };

  const selectedCount = (kind: FilterKind) => filters[kind === 'adsType' ? 'adTypes' : kind].length;
  const sitesOnly = filters.sites.length > 1;

  if (loading) return <main className="page-shell"><div className="loading-state"><img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops"/><span className="spinner"/><span>Preparing your order…</span></div></main>;
  if (error && !order) return <main className="page-shell"><div className="error-state"><img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops"/><h1>We couldn’t load this order</h1><p>{error}</p><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button></div></main>;
  if (!order || !stats) return null;

  return <main className="page-shell v3">
    <img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops" />
    <header className="order-header">
      <div className="order-id">#{order.id}</div>
      <Countdown expiresAt={order.expiresAt}/>
    </header>

    <section className="content-section filter-section" aria-label="Campaign filters">
      <div className="filter-grid">
        {([
          ['sites', 'Sites'], ['countries', 'Countries'], ['themes', 'Themes'], ['adsType', 'Ads type'],
        ] as [FilterKind, string][]).map(([kind, label]) => {
          const disabled = sitesOnly && (kind === 'countries' || kind === 'themes');
          const values = filters[kind === 'adsType' ? 'adTypes' : kind];
          const labels = kind === 'adsType' ? order.filters.adTypes.flatMap((group) => group.options).filter((option) => values.includes(option.id)).map((option) => option.name) : values;
          const display = values.length === 0 ? (kind === 'countries' || kind === 'adsType' ? '—' : 'All') : labels.length === 1 ? labels[0] : `${values.length} selected`;
          return <div className={`filter-control ${disabled ? 'is-disabled' : ''}`} key={kind}>
            <label>{label}</label>
            <button className="filter-trigger" disabled={disabled} onClick={() => setActiveDialog(kind)} aria-haspopup="dialog">
              <span>{display}</span>
              {selectedCount(kind) > 0 && <span className="selection-count">{selectedCount(kind)}</span>}
            </button>
          </div>;
        })}
        <button className={`info-trigger ${settingsApplied ? 'is-applied' : ''}`} aria-label="Ads type settings information" onClick={() => {
          setSettingsForced(true);
          window.requestAnimationFrame(() => document.getElementById('ads-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }}><InfoIcon/></button>
      </div>

      {sitesOnly && sitesNotice && <div className="notice notice-inline"><span><strong>Country and Theme selection is disabled when specific sites are selected (sites-only mode).</strong></span><button onClick={dismissSitesNotice}>Got it</button></div>}
      {(settingsForced || (hasOccupiedSelection && !settings)) && <section className="settings-card" id="ads-settings">
        <p className="settings-copy">You can choose how the system should handle sites that match your country/themes but have all slots taken in the selected Ads Type</p>
        <div className="choice-list">
          {([
            ['ascending', 'Add remaining types (ascending)'], ['descending', 'Add remaining types (descending)'], ['matching', 'Keep only the items that match the filter'],
          ] as [AdsChoice, string][]).map(([value, label]) => <label className={`choice-row ${draftChoice === value ? 'selected' : ''}`} key={value}>
            <input type="radio" name="ads-setting" checked={draftChoice === value} onChange={() => setDraftChoice(value)}/><span className="custom-radio"/><span>{label}</span>
          </label>)}
        </div>
        <div className="settings-footer"><button className="button button-primary" disabled={!draftChoice} onClick={() => void saveAdsSettings()}>Apply</button></div>
        <label className="auto-choice"><input type="checkbox" checked={alwaysApply} onChange={(event) => setAlwaysApply(event.target.checked)}/><span className="custom-checkbox"/><span>Always apply this choice automatically</span></label>
      </section>}
      {alternatives.length > 0 && alternativesNotice && <>
        <div className="notice alternatives-notice"><span className="notice-info"><InfoIcon/><span>{alternatives.length} sites have no available slots in {order.filters.adTypes.flatMap((group) => group.options).find((option) => filters.adTypes.includes(option.id))?.name ?? 'the selected Ads Type'}, so we added replacements below based on your <button onClick={() => {
          setSettingsForced(true);
          window.requestAnimationFrame(() => document.getElementById('ads-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }}>settings</button></span></span><button onClick={() => { setAlternativesNotice(false); localStorage.setItem(alternativesNoticeKey, '1'); }}>Got it</button></div>
      </>}
      {alternatives.length > 0 && <div className="alternative-list">{alternatives.map((item, index) => <div className="alternative-row" key={item.id}>
          <span className="alternative-index">{index + 1}</span><span>{item.site}</span><span>{item.country}</span><span>{item.theme}</span><span>{item.adType}</span><button aria-label={`Remove replacement for ${item.site}`} onClick={() => setAlternatives((current) => current.filter((row) => row.id !== item.id))}>×</button>
        </div>)}</div>}
    </section>

    <section className={`content-section estimate-section ${updating ? 'is-updating' : ''}`} aria-label="Estimated campaign results">
      <MetricCard stats={stats}/>
      {updating && <span className="update-indicator"><span className="mini-spinner"/> Updating estimate</span>}
      {error && <p className="inline-error" role="status">{error}</p>}
    </section>

    <section className="content-section top-picks-section">
      <div className="section-heading"><h1>Top Picks</h1><div className="tabs" role="tablist" aria-label="Top picks category">
        {(['Sites', 'Themes'] as const).map((mode) => <button key={mode} role="tab" aria-selected={topMode === mode} className={topMode === mode ? 'active' : ''} onClick={() => setTopMode(mode)}>{mode}</button>)}
      </div></div>
      <RankingTable items={topPicks} mode={topMode}/>
    </section>

    {activeDialog && <FilterDialog
      kind={activeDialog}
      initialValues={filters[activeDialog === 'adsType' ? 'adTypes' : activeDialog]}
      initialSites={order.filters.sites}
      countries={order.filters.countries}
      themes={order.filters.themes}
      adTypes={order.filters.adTypes}
      onClose={() => setActiveDialog(null)}
      onApply={(values) => applyFilter(activeDialog, values)}
      onResetSites={resetSites}
    />}
  </main>;
}

export default App;
