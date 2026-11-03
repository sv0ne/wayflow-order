import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { FilterDialog, type FilterKind } from './components/FilterDialog';
import { Countdown } from './components/Countdown/Countdown.tsx';
import deleteIcon from './assets/icons/delete.svg';
import {Notice} from "./components/Notice/Notice.tsx";
import helpIcon from "./assets/icons/help-icon.svg";

type AdOption = { id: string; name: string };
type AdGroup = { category: string; options: AdOption[] };
type Order = {
  id: string;
  expiresAt: string;
  stats: { tds: number; gsc: number; price: number };
  topPicks: Pick[];
  filters: { sites: string[]; countries: string[]; themes: string[]; adTypes: AdGroup[] };
};
type Stats = Order['stats'];
type Pick = { domain: string; theme: string; clicks: number };
type Alternative = { id: string; site: number; country: string | null; theme: string | null; adType: string };
type MetricsResponse = { stats: Stats; topPicks: Pick[]; alternatives: Alternative[]; needsAdsTypeChoice?: boolean };
type MetricFilters = { sites: string[]; countries: string[]; themes: string[]; adTypes: string[] };
type AdsChoice = 'asc' | 'desc' | 'match';

const settingKey = 'wayflow.adsTypeChoice';
const autoApplyKey = 'wayflow.adsTypeChoiceAutoApply';
const sitesNoticeKey = 'wayflow.sitesOnlyNoticeSeen';
const alternativesNoticeKey = 'wayflow.alternativesNoticeSeen';

function readAdsChoice(): AdsChoice | null {
  try {
    const value = localStorage.getItem(settingKey);
    return value === 'asc' || value === 'desc' || value === 'match' ? value : null;
  } catch {
    return null;
  }
}

function useOrderId() {
  const candidate = window.location.pathname.split('/').filter(Boolean)[0];
  return candidate && candidate !== 'index.html' ? candidate : '';
}

function MetricCard({ stats, updating }: { stats: Stats; updating: boolean }) {
  return <section className="stats-card gradient-border" aria-label="Order estimate">
    <div className="metrics-line">
      <div className="metric"><span className="metric-label">TDS</span><span className="metric-number">{stats.tds.toLocaleString('en-US')}</span><span className="metric-caption">clicks</span></div>
      <span className="metric-divider" />
      <div className="metric"><span className="metric-label">GSC</span><span className="metric-number">{stats.gsc.toLocaleString('en-US')}</span><span className="metric-caption">clicks</span></div>
    </div>
    <div className="price"><span>$</span>{stats.price.toLocaleString('en-US')}</div>
    {updating && <div className="stats-update-overlay" aria-hidden="true" />}
  </section>;
}

function RankingTable({ items, mode }: { items: Pick[]; mode: 'Sites' | 'Themes' }) {
  return <div className="ranking-table" role="table" aria-label={`Top ${mode.toLowerCase()}`}>
    <div className="ranking-row ranking-head" role="row"><span>#</span><span>{mode === 'Sites' ? 'Domain' : 'Theme'}</span><span>Clicks</span></div>
    {items.map((item, index) => <div className="ranking-row" role="row" key={item.domain}>
      <span className="rank">{index + 1}</span><span className="domain">{mode === 'Sites' ? item.domain : item.theme}</span><span className="clicks">{item.clicks.toLocaleString('en-US')}</span>
    </div>)}
  </div>;
}

function App() {
  const orderId = useOrderId();
  const [order, setOrder] = useState<Order | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPicks, setTopPicks] = useState<Pick[]>([]);
  const [loadedSites, setLoadedSites] = useState<string[]>([]);
  const [sitesNextOffset, setSitesNextOffset] = useState<number | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [filters, setFilters] = useState<MetricFilters>({ sites: [], countries: [], themes: [], adTypes: [] });
  const [activeDialog, setActiveDialog] = useState<FilterKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [topMode, setTopMode] = useState<'Sites' | 'Themes'>('Sites');
  const [settings, setSettings] = useState<AdsChoice | null>(() => readAdsChoice());
  const [draftChoice, setDraftChoice] = useState<AdsChoice | null>(() => readAdsChoice());
  const [settingsForced, setSettingsForced] = useState(false);
  const [settingsRequired, setSettingsRequired] = useState(false);
  const [autoApplyChoice, setAutoApplyChoice] = useState(() => localStorage.getItem(autoApplyKey) !== '0');
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
        setLoadedSites(data.filters.sites);
        setSitesNextOffset(data.filters.sites.length >= 20 ? 20 : null);
        setStats(data.stats);
        setTopPicks(data.topPicks);
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load this order.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const updateMetrics = useCallback(async (next: MetricFilters, adsTypeChoice?: AdsChoice | null) => {
    const requestId = ++requestCounter.current;
    setUpdating(true);
    setError('');
    try {
      const result = await api<MetricsResponse>('/api/metrics', { method: 'POST', body: JSON.stringify({ ...next, orderId, adsTypeChoice: adsTypeChoice === undefined ? settings : adsTypeChoice }) });
      if (requestId !== requestCounter.current) return;
      if (result.needsAdsTypeChoice) {
        setSettingsForced(true);
        setSettingsRequired(true);
        setDraftChoice(null);
        setAlternatives([]);
        return;
      }
      setSettingsForced(false);
      setSettingsRequired(false);
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
    if (kind === 'sites' && values.length > 0) {
      next.countries = [];
      next.themes = [];
    }
    setFilters(next);
    setActiveDialog(null);
    void updateMetrics(next);
  };

  const resetFilter = (kind: FilterKind) => {
    const key = kind === 'adsType' ? 'adTypes' : kind;
    const next = { ...filters, [key]: [] };
    setFilters(next);
    setActiveDialog(null);
    setSettingsForced(false);
    void updateMetrics(next);
  };

  const cacheLoadedSites = useCallback((items: string[], nextOffset: number | null) => {
    setLoadedSites(items);
    setSitesNextOffset(nextOffset);
  }, []);

  const saveAdsSettings = async () => {
    if (!draftChoice) return;
    if (autoApplyChoice) {
      localStorage.setItem(settingKey, draftChoice);
      setSettings(draftChoice);
    } else {
      localStorage.removeItem(settingKey);
      setSettings(null);
    }
    setSettingsForced(false);
    setSettingsRequired(false);
    setSettingsApplied(true);
    window.setTimeout(() => setSettingsApplied(false), 520);
    void updateMetrics(filters, draftChoice);
  };

  const dismissSitesNotice = () => {
    setSitesNotice(false);
    localStorage.setItem(sitesNoticeKey, '1');
  };

  const dismissAlternativesNotice = () => {
    setAlternativesNotice(false);
    localStorage.setItem(alternativesNoticeKey, '1');
  }

  const showAdsSettings = () => {
    setSettingsForced(true);
    setSettingsRequired(false);
    window.requestAnimationFrame(() => document.getElementById('ads-settings')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    }));
  }

  const sitesOnly = filters.sites.length > 0;

  if (loading) return <main className="page-shell"><div className="loading-state"><img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops"/><span className="spinner"/><span>Preparing your order…</span></div></main>;
  if (error && !order) return <main className="page-shell"><div className="error-state"><img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops"/><h1 className="error-state-title">We couldn’t load this order</h1><p>{error}</p><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button></div></main>;
  if (!order || !stats) return null;

  return <main className="page-shell v3">
    <img className="brand" src="/assets/workingdrops-logo.svg" alt="Workingdrops" />
    <header className="order-header">
      <div className="order-id gradient-border">#{order.id}</div>
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
          return <div className={`filter-control ${disabled ? 'is-disabled' : ''} ${kind === 'adsType' ? 'filter-adsType' : ''}`} key={kind}>
            <p>{label}</p>
            <button className="filter-trigger" disabled={disabled} onClick={() => setActiveDialog(kind)} aria-haspopup="dialog">
              <span>{display}</span>
            </button>
            {kind === 'adsType' &&
              <button className={`info-trigger ${settingsApplied ? 'is-applied' : ''}`} aria-label="Ads type settings information" onClick={() => {
                setSettingsRequired(false);
                setSettingsForced(true);
                window.requestAnimationFrame(() => document.getElementById('ads-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
              }}><img src={helpIcon} alt="helpIcon"/></button>
            }
          </div>;
        })}
      </div>

      {/* Плашка предупреждение: Во время фильтрации по сайтам, фильтры по Countries и Themes не работают */}
      {sitesOnly && sitesNotice && (
        <Notice onClick={dismissSitesNotice}>
          <span>Country and Theme selection is disabled when specific sites are selected (sites-only mode).</span>
        </Notice>
      )}

      {settingsForced &&
        <section className="settings-card" id="ads-settings">
          <p className="settings-copy">You can choose how the system should handle sites that match your country/themes but have all slots taken in the selected Ads Type</p>
          <div className="choice-list">
            {([
              ['asc', 'Add remaining types (ascending)'], ['desc', 'Add remaining types (descending)'], ['match', 'Keep only the items that match the filter'],
            ] as [AdsChoice, string][]).map(([value, label]) =>
              <label className={`choice-row ${draftChoice === value ? 'selected' : ''}`} key={value}>
                <input type="radio" name="ads-setting" checked={draftChoice === value} onChange={() => setDraftChoice(value)}/>
                <span className="custom-radio"/><span>{label}</span>
              </label>
            )}
          </div>
          <div className="settings-footer">
            {!settingsRequired && <button className="button button-quiet" onClick={() => setSettingsForced(false)}>Cancel</button>}
            <button className="button button-primary" disabled={!draftChoice} onClick={() => void saveAdsSettings()}>Apply</button>
          </div>
          <label className="auto-choice">
            <input type="checkbox" checked={autoApplyChoice} onChange={(event) => {
              const checked = event.target.checked;
              setAutoApplyChoice(checked);
              if (checked) localStorage.setItem(autoApplyKey, '1');
              else {
                localStorage.setItem(autoApplyKey, '0');
                localStorage.removeItem(settingKey);
                setSettings(null);
              }
            }}/>
            <span className="custom-checkbox"/><span>Always apply this choice automatically</span>
          </label>
        </section>
      }

      {/*Сайты недоступны для выбранной рекламы, предоставляем альтернативные варианты */}
      {(alternatives.length > 0 && alternativesNotice) && (
        <Notice onClick={dismissAlternativesNotice}>
          <span>{alternatives.length} sites have no available slots, so we added replacements below based on your <button
              onClick={showAdsSettings}>settings</button></span>
        </Notice>
      )}
      {alternatives.length > 0 && (
        <div className="alternative-list">
          {alternatives.map((item) =>
            <div className="alternative-row" key={item.id}>
              <p><span className="alternative-desktop-value">{item.site}</span><span className="alternative-mobile-value">{item.site} sites</span></p>
              <p><span className="alternative-desktop-value">{item.country ?? '—'}</span><span className="alternative-mobile-value">{item.country ?? 'Any countries'}</span></p>
              <p><span className="alternative-desktop-value">{item.theme ?? 'All'}</span><span className="alternative-mobile-value">{item.theme ?? 'All themes'}</span></p>
              <div>
                <p>{item.adType}</p>
                <button aria-label={`Remove replacement for ${item.site}`} onClick={() => setAlternatives((current) => current.filter((row) => row.id !== item.id))}>
                  <img src={deleteIcon} alt="deleteIcon" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      <section className={`content-section estimate-section ${updating ? 'is-updating' : ''}`} aria-label="Estimated campaign results">
        <MetricCard stats={stats} updating={updating}/>
        {error && <p className="inline-error" role="status">{error}</p>}
      </section>
    </section>
    <section className="content-section top-picks-section">
      <div className="section-heading">
        <p className="section-heading-label">Top Picks</p>
        <div className="tabs" role="tablist" aria-label="Top picks category">
          {(['Sites', 'Themes'] as const).map((mode) => <button key={mode} role="tab" aria-selected={topMode === mode}
                                                                className={topMode === mode ? 'active' : ''}
                                                                onClick={() => setTopMode(mode)}>{mode}</button>)}
        </div>
      </div>
      <RankingTable items={topPicks} mode={topMode}/>
    </section>

    {activeDialog && <FilterDialog
      kind={activeDialog}
      initialValues={filters[activeDialog === 'adsType' ? 'adTypes' : activeDialog]}
      initialSites={loadedSites}
      initialSitesNextOffset={sitesNextOffset}
      onSitesLoaded={cacheLoadedSites}
      countries={order.filters.countries}
      themes={order.filters.themes}
      adTypes={order.filters.adTypes}
      onClose={() => setActiveDialog(null)}
      onApply={(values) => applyFilter(activeDialog, values)}
      onReset={() => resetFilter(activeDialog)}
    />}
  </main>;
}

export default App;
