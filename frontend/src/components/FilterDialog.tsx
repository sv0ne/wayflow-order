import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import checkboxCheckedIcon from "./../assets/icons/checkbox-checked.svg";
import checkboxUncheckedIcon from "./../assets/icons/checkbox-unchecked.svg";
import closeIcon from "./../assets/icons/close-filter.svg";

export type FilterKind = 'sites' | 'countries' | 'themes' | 'adsType';
type AdGroup = { category: string; options: { id: string; name: string }[] };
type Props = {
  kind: FilterKind;
  initialValues: string[];
  initialSites: string[];
  initialSitesNextOffset: number | null;
  onSitesLoaded: (items: string[], nextOffset: number | null) => void;
  countries: string[];
  themes: string[];
  adTypes: AdGroup[];
  onClose: () => void;
  onApply: (values: string[]) => void;
  onReset: () => void;
};
type SitePage = { items: string[]; nextOffset: number | null };

const titles: Record<FilterKind, string> = { sites: 'Sites', countries: 'Countries', themes: 'Themes', adsType: 'Ads Type' };
const resetLabels: Record<FilterKind, string> = { sites: 'Reset to All sites', countries: 'Reset to All countries', themes: 'Reset to All themes', adsType: 'Reset Ads type' };

export function FilterDialog({ kind, initialValues, initialSites, initialSitesNextOffset, onSitesLoaded, countries, themes, adTypes, onClose, onApply, onReset }: Props) {
  const [selected, setSelected] = useState<string[]>(initialValues);
  const [search, setSearch] = useState('');
  const [siteItems, setSiteItems] = useState<string[]>(initialSites);
  const siteItemsRef = useRef(initialSites);
  const initialSitesRef = useRef(initialSites);
  const initialSitesNextOffsetRef = useRef(initialSitesNextOffset);
  const [nextOffset, setNextOffset] = useState<number | null>(initialSitesNextOffset);
  const [loadingSites, setLoadingSites] = useState(false);
  const [siteError, setSiteError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<number | null>(null);
  const siteRequest = useRef(0);
  const hasSearchedSites = useRef(false);

  useEffect(() => {
    initialSitesRef.current = initialSites;
    initialSitesNextOffsetRef.current = initialSitesNextOffset;
  }, [initialSites, initialSitesNextOffset]);

  const loadSites = useCallback(async (query: string, offset: number, replace: boolean) => {
    const requestId = ++siteRequest.current;
    setLoadingSites(true);
    setSiteError('');
    try {
      const page = await api<SitePage>(`/api/sites?search=${encodeURIComponent(query)}&offset=${offset}&limit=20`);
      if (requestId !== siteRequest.current) return;
      const currentItems = siteItemsRef.current;
      const updatedItems = replace ? page.items : [...currentItems, ...page.items.filter((item) => !currentItems.includes(item))];
      siteItemsRef.current = updatedItems;
      setSiteItems(updatedItems);
      setNextOffset(page.nextOffset);
      if (query === '') onSitesLoaded(updatedItems, page.nextOffset);
    } catch (error) {
      if (requestId === siteRequest.current) setSiteError(error instanceof Error ? error.message : 'Could not load sites.');
    } finally {
      if (requestId === siteRequest.current) setLoadingSites(false);
    }
  }, [onSitesLoaded]);

  useEffect(() => {
    if (kind !== 'sites') return;
    if (search === '' && !hasSearchedSites.current) return;
    siteRequest.current += 1;
    if (search === '') {
      hasSearchedSites.current = false;
      siteItemsRef.current = initialSitesRef.current;
      setSiteItems(initialSitesRef.current);
      setNextOffset(initialSitesNextOffsetRef.current);
      setLoadingSites(false);
      return;
    }
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

  const toggle = (value: string) => {
    const isSelected = selected.includes(value);
    if (kind === 'sites' && search !== '' && !isSelected && !initialSitesRef.current.includes(value)) {
      onSitesLoaded([...initialSitesRef.current, value], initialSitesNextOffsetRef.current);
    }
    setSelected((current) => isSelected ? current.filter((item) => item !== value) : [...current, value]);
  };

  const onScroll = () => {
    const element = scrollRef.current;
    if (kind === 'sites' && element && nextOffset !== null && !loadingSites && element.scrollTop + element.clientHeight >= element.scrollHeight - 80) {
      void loadSites(search, nextOffset, false);
    }
  };

  let content;
  if (kind === 'sites') {
    content = <>
      <label className="modal-search"><input autoFocus value={search} onChange={(event) => { hasSearchedSites.current = true; setSearch(event.target.value); }} placeholder="Search"/></label>
      <div className="modal-list" ref={scrollRef} onScroll={onScroll}>
        {siteItems.map((site) => <OptionRow key={site} label={site} checked={selected.includes(site)} onChange={() => toggle(site)}/>)}
        {loadingSites && <div className="list-status"><span className="mini-spinner"/> Loading sites…</div>}
        {siteError && <div className="list-status error-text">{siteError}</div>}
        {!loadingSites && !siteError && siteItems.length === 0 && <div className="list-status">No sites found.</div>}
      </div>
    </>;
  } else if (kind === 'countries' || kind === 'themes') {
    const values = kind === 'countries' ? countries : themes;
    content = <>
      <div className="modal-list" ref={scrollRef}>
        {values.map((value) => <OptionRow key={value} label={value} checked={selected.includes(value)} onChange={() => toggle(value)}/>)}
      </div>
    </>;
  } else {
    content = <>
      <div className="modal-list ad-list">
        {adTypes.map((group) => {
          return <div className="modal-group" key={group.category || 'standard'}>{group.category && <h3>{group.category}</h3>}{group.options.map((option) => <OptionRow key={option.id} label={option.name} checked={selected.includes(option.id)} onChange={() => toggle(option.id)}/>)}</div>;
        })}
      </div>
    </>;
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="filter-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-heading"><h2 id="dialog-title">{titles[kind]}</h2><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><img src={closeIcon} alt=""/></button></div>
      {content}
      <footer className="modal-footer">
        <button className="button filter-reset" onClick={onReset}>{resetLabels[kind]}</button>
        <button className="button button-primary" onClick={() => onApply(selected)}>Apply</button>
      </footer>
    </section>
  </div>;
}

function OptionRow({ label, checked, onChange }: { label: import('react').ReactNode; checked: boolean; onChange: () => void }) {
  return <label className="option-row"><input type="checkbox" checked={checked} onChange={onChange}/><span className="option-checkbox"><img src={checked ? checkboxCheckedIcon : checkboxUncheckedIcon} alt=""/></span><span className="option-label">{label}</span></label>;
}

