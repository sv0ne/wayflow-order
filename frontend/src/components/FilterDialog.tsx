import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export type FilterKind = 'sites' | 'countries' | 'themes' | 'adsType';
type AdGroup = { category: string; options: { id: string; name: string; occupied: boolean }[] };
type Props = {
  kind: FilterKind;
  initialValues: string[];
  initialSites: string[];
  countries: string[];
  themes: string[];
  adTypes: AdGroup[];
  onClose: () => void;
  onApply: (values: string[]) => void;
  onResetSites: () => void;
};
type SitePage = { items: string[]; nextOffset: number | null };

const titles: Record<FilterKind, string> = { sites: 'Sites', countries: 'Countries', themes: 'Themes', adsType: 'Ads Type' };

export function FilterDialog({ kind, initialValues, initialSites, countries, themes, adTypes, onClose, onApply, onResetSites }: Props) {
  const [selected, setSelected] = useState<string[]>(initialValues);
  const [search, setSearch] = useState('');
  const [siteItems, setSiteItems] = useState<string[]>(initialSites);
  const [nextOffset, setNextOffset] = useState<number | null>(initialSites.length >= 20 ? 20 : null);
  const [loadingSites, setLoadingSites] = useState(false);
  const [siteError, setSiteError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<number | null>(null);
  const siteRequest = useRef(0);
  const hasSearchedSites = useRef(false);

  const loadSites = useCallback(async (query: string, offset: number, replace: boolean) => {
    const requestId = ++siteRequest.current;
    setLoadingSites(true);
    setSiteError('');
    try {
      const page = await api<SitePage>(`/api/sites?search=${encodeURIComponent(query)}&offset=${offset}&limit=20`);
      if (requestId !== siteRequest.current) return;
      setSiteItems((current) => replace ? page.items : [...current, ...page.items.filter((item) => !current.includes(item))]);
      setNextOffset(page.nextOffset);
    } catch (error) {
      if (requestId === siteRequest.current) setSiteError(error instanceof Error ? error.message : 'Could not load sites.');
    } finally {
      if (requestId === siteRequest.current) setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    if (kind !== 'sites') return;
    if (search === '' && !hasSearchedSites.current) return;
    siteRequest.current += 1;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void loadSites(search, 0, true), 300);
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
  }, [kind, loadSites, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('dialog-open');
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('dialog-open'); };
  }, [onClose]);

  const toggle = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const toggleAll = (values: string[]) => {
    const visibleSelected = values.every((value) => selected.includes(value));
    setSelected((current) => visibleSelected ? current.filter((item) => !values.includes(item)) : [...new Set([...current, ...values])]);
  };
  const onScroll = () => {
    const element = scrollRef.current;
    if (kind === 'sites' && element && nextOffset !== null && !loadingSites && element.scrollTop + element.clientHeight >= element.scrollHeight - 80) {
      void loadSites(search, nextOffset, false);
    }
  };

  let content;
  if (kind === 'sites') {
    const remainingSites = siteItems.filter((site) => !selected.includes(site));
    content = <>
      <label className="modal-search"><input autoFocus value={search} onChange={(event) => { hasSearchedSites.current = true; setSearch(event.target.value); }} placeholder="Search"/></label>
      <div className="modal-list" ref={scrollRef} onScroll={onScroll}>
        {selected.map((site) => <OptionRow key={`selected-${site}`} label={site} checked onChange={() => toggle(site)}/>)}
        {selected.length > 0 && <SelectionDivider/>}
        {remainingSites.map((site) => <OptionRow key={site} label={site} checked={false} onChange={() => toggle(site)}/>)}
        {loadingSites && <div className="list-status"><span className="mini-spinner"/> Loading sites…</div>}
        {siteError && <div className="list-status error-text">{siteError}</div>}
        {!loadingSites && !siteError && remainingSites.length === 0 && selected.length === 0 && <div className="list-status">No sites found.</div>}
      </div>
    </>;
  } else if (kind === 'countries' || kind === 'themes') {
    const values = kind === 'countries' ? countries : themes;
    const selectedValues = values.filter((value) => selected.includes(value));
    const remainingValues = values.filter((value) => !selected.includes(value));
    content = <>
      <button className="select-all" onClick={() => toggleAll(values)}>{values.every((value) => selected.includes(value)) ? 'Clear selection' : 'Select all'}</button>
      <div className="modal-list" ref={scrollRef}>
        {selectedValues.map((value) => <OptionRow key={`selected-${value}`} label={value} checked onChange={() => toggle(value)}/>)}
        {selectedValues.length > 0 && <SelectionDivider/>}
        {remainingValues.map((value) => <OptionRow key={value} label={value} checked={false} onChange={() => toggle(value)}/>)}
      </div>
    </>;
  } else {
    const selectedOptions = adTypes.flatMap((group) => group.options).filter((option) => selected.includes(option.id));
    content = <>
      <div className="modal-search search-placeholder">Search</div>
      <div className="modal-list ad-list">
        {selectedOptions.map((option) => <OptionRow key={`selected-${option.id}`} label={option.name} checked onChange={() => toggle(option.id)}/>)}
        {selectedOptions.length > 0 && <SelectionDivider/>}
        {adTypes.map((group) => {
          const remaining = group.options.filter((option) => !selected.includes(option.id));
          return remaining.length > 0 && <div className="ad-group" key={group.category || 'standard'}>{group.category && <h3>{group.category}</h3>}{remaining.map((option) => <OptionRow key={option.id} label={option.name} checked={false} onChange={() => toggle(option.id)}/>)}</div>;
        })}
      </div>
    </>;
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="filter-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-heading"><h2 id="dialog-title">{titles[kind]}</h2><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><img src="/assets/close-filter.svg" alt=""/></button></div>
      {content}
      <footer className="modal-footer">
        {kind === 'sites' ? <button className="button filter-reset" onClick={onResetSites}>Reset to All sites</button> : <button className="button filter-reset" onClick={() => setSelected([])}>Clear</button>}
        <button className="button button-primary" onClick={() => onApply(selected)}>Apply</button>
      </footer>
    </section>
  </div>;
}

function OptionRow({ label, checked, onChange }: { label: import('react').ReactNode; checked: boolean; onChange: () => void }) {
  return <label className="option-row"><input type="checkbox" checked={checked} onChange={onChange}/><span className="option-checkbox"><img src={checked ? '/assets/checkbox-checked.svg' : '/assets/checkbox-unchecked.svg'} alt=""/></span><span className="option-label">{label}</span></label>;
}

function SelectionDivider() {
  return <div className="selection-divider" role="separator"/>;
}
