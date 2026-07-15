import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
// Named-export interop for this CJS module works in dev but not in Astro's
// build-time Node ESM loader — import the default and destructure instead.
import isoCountries from 'i18n-iso-countries';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { withBase } from '../lib/url';
import { countryCodeToFlag } from '../lib/format';
import type { VisitedLocality } from '../lib/types';
import worldTopology from 'world-atlas/countries-110m.json';

const { numericToAlpha2 } = isoCountries;

const WIDTH = 960;
const HEIGHT = 500;
const HOME_COUNTRY = 'PL';

interface CountryFeature {
  alpha2: string;
  name: string;
  path: string;
}

function polishCountryName(alpha2: string, fallback: string): string {
  try {
    return new Intl.DisplayNames(['pl'], { type: 'region' }).of(alpha2) ?? fallback;
  } catch {
    return fallback;
  }
}

function countryClassName(alpha2: string, visited: Set<string>, clickable: boolean): string {
  const classes = ['world-map__country'];
  if (visited.has(alpha2)) classes.push('world-map__country--visited');
  if (alpha2 === HOME_COUNTRY) classes.push('world-map__country--home');
  if (clickable) classes.push('world-map__country--clickable');
  return classes.join(' ');
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

function ZoomControls() {
  const { zoomIn, zoomOut } = useControls();
  return (
    <div className="map-fullscreen__zoom">
      <button type="button" onClick={() => zoomIn()} aria-label="Przybliż">
        <IconPlus />
      </button>
      <button type="button" onClick={() => zoomOut()} aria-label="Oddal">
        <IconMinus />
      </button>
    </div>
  );
}

interface FullscreenMapProps {
  countries: CountryFeature[];
  visited: Set<string>;
  onCountryClick: (alpha2: string) => void;
  onClose: () => void;
}

function FullscreenMap({ countries, visited, onCountryClick, onClose }: FullscreenMapProps) {
  return (
    <div className="map-fullscreen">
      <button type="button" className="map-fullscreen__close" onClick={onClose} aria-label="Zamknij mapę">
        <IconClose />
      </button>
      <TransformWrapper initialScale={1} minScale={1} maxScale={8} centerOnInit doubleClick={{ mode: 'zoomIn' }}>
        <ZoomControls />
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="world-map world-map--fullscreen">
            {countries.map((c) => {
              const isHome = c.alpha2 === HOME_COUNTRY;
              return (
                <path
                  key={c.alpha2}
                  d={c.path}
                  className={countryClassName(c.alpha2, visited, !isHome)}
                  onClick={isHome ? undefined : () => onCountryClick(c.alpha2)}
                >
                  <title>{c.name}</title>
                </path>
              );
            })}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

interface AddCountryDialogProps {
  country: CountryFeature;
  userId: string;
  onClose: () => void;
  onAdded: (alpha2: string) => void;
}

function AddCountryDialog({ country, userId, onClose, onAdded }: AddCountryDialogProps) {
  const [locality, setLocality] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase
      .from('visited_countries')
      .insert({ country_code: country.alpha2, profile_id: userId });
    if (insertError) {
      setSaving(false);
      setError('Nie udało się dodać kraju.');
      return;
    }

    const name = locality.trim();
    if (name) {
      const { error: localityError } = await supabase
        .from('visited_localities')
        .insert({ country_code: country.alpha2, profile_id: userId, name });
      if (localityError) {
        setSaving(false);
        setError('Kraj dodany, ale nie udało się zapisać miejscowości.');
        return;
      }
    }

    setSaving(false);
    onAdded(country.alpha2);
  }

  return (
    <div
      className="country-card-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card country-card">
        <div className="country-card__header">
          <h2 className="country-card__title">
            {countryCodeToFlag(country.alpha2)} {country.name}
          </h2>
          <button type="button" className="country-card__close" onClick={onClose} aria-label="Zamknij">
            <IconClose />
          </button>
        </div>

        <p className="form-hint">Dodać ten kraj do odwiedzonych?</p>

        <form className="form" onSubmit={handleConfirm}>
          <label>
            Miejscowość (opcjonalnie)
            <input
              type="text"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="np. Barcelona"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Anuluj
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              Dodaj do odwiedzonych
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CountryLocalitiesPanelProps {
  country: CountryFeature;
  userId: string;
  onRemoved: (alpha2: string) => void;
}

function CountryLocalitiesPanel({ country, userId, onRemoved }: CountryLocalitiesPanelProps) {
  const [localities, setLocalities] = useState<VisitedLocality[] | null>(null);
  const [newLocality, setNewLocality] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  async function loadLocalities() {
    const { data, error: fetchError } = await supabase
      .from('visited_localities')
      .select('*')
      .eq('country_code', country.alpha2)
      .eq('profile_id', userId)
      .order('name');
    if (fetchError) {
      setError('Nie udało się wczytać miejscowości.');
      return;
    }
    setLocalities((data as VisitedLocality[]) ?? []);
  }

  useEffect(() => {
    setLocalities(null);
    loadLocalities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country.alpha2]);

  async function handleAddLocality(e: React.FormEvent) {
    e.preventDefault();
    const name = newLocality.trim();
    if (!name) return;
    setError(null);

    const { error: insertError } = await supabase
      .from('visited_localities')
      .insert({ country_code: country.alpha2, profile_id: userId, name });

    if (insertError) {
      setError('Nie udało się dodać miejscowości.');
      return;
    }

    setNewLocality('');
    loadLocalities();
  }

  async function handleDeleteLocality(id: string) {
    const { error: deleteError } = await supabase
      .from('visited_localities')
      .delete()
      .eq('id', id)
      .eq('profile_id', userId);
    if (deleteError) {
      setError('Nie udało się usunąć miejscowości.');
      return;
    }
    setLocalities((prev) => (prev ?? []).filter((l) => l.id !== id));
  }

  async function handleRemoveCountry() {
    if (!window.confirm(`Usunąć ${country.name} z odwiedzonych krajów?`)) return;
    setRemoving(true);
    const { error: deleteError } = await supabase
      .from('visited_countries')
      .delete()
      .eq('country_code', country.alpha2)
      .eq('profile_id', userId);
    setRemoving(false);

    if (deleteError) {
      setError('Nie udało się usunąć kraju.');
      return;
    }
    onRemoved(country.alpha2);
  }

  return (
    <div>
      <p className="country-card__section-title">Miejscowości</p>

      {localities === null && <p className="state-message">Wczytywanie…</p>}

      {localities !== null && !isEditing && (
        <>
          {localities.length === 0 ? (
            <p className="form-hint">Brak zapisanych miejscowości.</p>
          ) : (
            <div className="locality-chips">
              {localities.map((l) => (
                <span key={l.id} className="locality-chip">
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {localities !== null && isEditing && (
        <>
          {localities.length > 0 && (
            <div className="settings-list">
              {localities.map((l) => (
                <div key={l.id} className="settings-row">
                  <span className="settings-row__label">{l.name}</span>
                  <button type="button" onClick={() => handleDeleteLocality(l.id)}>
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          )}

          <form className="form settings-add-form settings-add-form--inline" onSubmit={handleAddLocality}>
            <input
              type="text"
              className="settings-row__name-input"
              placeholder="Nazwa miejscowości"
              value={newLocality}
              onChange={(e) => setNewLocality(e.target.value)}
            />
            <button className="btn-primary" type="submit">
              + Dodaj
            </button>
          </form>

          {error && <p className="form-error">{error}</p>}

          <button
            type="button"
            className="btn-danger country-card__remove"
            onClick={handleRemoveCountry}
            disabled={removing}
          >
            Usuń kraj z mapy
          </button>
        </>
      )}

      {localities !== null && (
        <button type="button" className="locality-edit-toggle" onClick={() => setIsEditing((v) => !v)}>
          {isEditing ? 'Gotowe' : 'Edytuj'}
        </button>
      )}
    </div>
  );
}

interface CountryDetailCardProps {
  country: CountryFeature;
  userId: string;
  onClose: () => void;
  onRemoved: (alpha2: string) => void;
}

function CountryDetailCard({ country, userId, onClose, onRemoved }: CountryDetailCardProps) {
  return (
    <div
      className="country-card-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card country-card">
        <div className="country-card__header">
          <h2 className="country-card__title">
            {countryCodeToFlag(country.alpha2)} {country.name}
          </h2>
          <button type="button" className="country-card__close" onClick={onClose} aria-label="Zamknij">
            <IconClose />
          </button>
        </div>

        <CountryLocalitiesPanel country={country} userId={userId} onRemoved={onRemoved} />
      </div>
    </div>
  );
}

export default function WorldMap() {
  const session = useSession();

  const [visited, setVisited] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryFeature | null>(null);
  const [addingCountry, setAddingCountry] = useState<CountryFeature | null>(null);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
      return;
    }
    if (!session) return;

    let cancelled = false;

    async function load() {
      const { data, error: fetchError } = await supabase
        .from('visited_countries')
        .select('country_code')
        .eq('profile_id', session.user.id);
      if (cancelled) return;
      if (fetchError) {
        setError('Nie udało się wczytać odwiedzonych krajów.');
        return;
      }
      setVisited(new Set((data ?? []).map((r: { country_code: string }) => r.country_code)));
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const countries = useMemo<CountryFeature[]>(() => {
    const topology = worldTopology as unknown as Topology;
    const collection = feature(
      topology,
      topology.objects.countries as never
    ) as unknown as FeatureCollection<Geometry, { name: string }>;

    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], collection);
    const pathGenerator = geoPath(projection);

    const result: CountryFeature[] = [];
    for (const f of collection.features as Feature<Geometry, { name: string }>[]) {
      if (f.id === undefined) continue;
      const alpha2 = numericToAlpha2(String(f.id));
      if (!alpha2) continue;
      const d = pathGenerator(f);
      if (!d) continue;
      result.push({ alpha2, name: polishCountryName(alpha2, f.properties?.name ?? alpha2), path: d });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, []);

  function handleCountryClick(alpha2: string) {
    if (!visited || alpha2 === HOME_COUNTRY) return;
    const country = countries.find((c) => c.alpha2 === alpha2);
    if (!country) return;

    setIsFullscreen(false);

    if (!visited.has(alpha2)) {
      setAddingCountry(country);
      return;
    }

    setSelectedCountry(country);
  }

  function handleCountryAdded(alpha2: string) {
    setVisited((prev) => new Set(prev).add(alpha2));
    setAddingCountry(null);
  }

  function handleCountryRemoved(alpha2: string) {
    setVisited((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      next.delete(alpha2);
      return next;
    });
    setSelectedCountry(null);
    setExpandedCountry((prev) => (prev === alpha2 ? null : prev));
  }

  if (session === undefined || visited === null) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  const userId = session.user.id;
  const visitedList = countries.filter((c) => visited.has(c.alpha2));

  return (
    <div>
      <div
        className="card map-card"
        onClick={() => setIsFullscreen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setIsFullscreen(true);
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="world-map">
          {countries.map((c) => (
            <path key={c.alpha2} d={c.path} className={countryClassName(c.alpha2, visited, false)}>
              <title>{c.name}</title>
            </path>
          ))}
        </svg>
        <p className="map-card__expand-hint">
          <IconExpand /> Powiększ mapę
        </p>
      </div>

      {error && <p className="state-message">{error}</p>}

      <p className="form-hint map-count">Odwiedzone kraje: {visitedList.length}</p>

      {visitedList.length > 0 && (
        <div className="card visited-list">
          {visitedList.map((c) => {
            const isExpanded = expandedCountry === c.alpha2;
            return (
              <div key={c.alpha2} className="visited-list__item">
                <div
                  className="settings-row visited-list__row"
                  onClick={() => setExpandedCountry((prev) => (prev === c.alpha2 ? null : c.alpha2))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setExpandedCountry((prev) => (prev === c.alpha2 ? null : c.alpha2));
                    }
                  }}
                >
                  <span className="settings-row__label">
                    {countryCodeToFlag(c.alpha2)} {c.name}
                  </span>
                  <span className={`settings-row__chevron ${isExpanded ? 'settings-row__chevron--open' : ''}`}>
                    ›
                  </span>
                </div>
                {isExpanded && (
                  <div className="visited-list__panel">
                    <CountryLocalitiesPanel country={c} userId={userId} onRemoved={handleCountryRemoved} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isFullscreen &&
        createPortal(
          <FullscreenMap
            countries={countries}
            visited={visited}
            onCountryClick={handleCountryClick}
            onClose={() => setIsFullscreen(false)}
          />,
          document.body
        )}

      {addingCountry &&
        createPortal(
          <AddCountryDialog
            country={addingCountry}
            userId={userId}
            onClose={() => setAddingCountry(null)}
            onAdded={handleCountryAdded}
          />,
          document.body
        )}

      {selectedCountry &&
        createPortal(
          <CountryDetailCard
            country={selectedCountry}
            userId={userId}
            onClose={() => setSelectedCountry(null)}
            onRemoved={handleCountryRemoved}
          />,
          document.body
        )}
    </div>
  );
}
