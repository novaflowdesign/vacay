import { useEffect, useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
// Named-export interop for this CJS module works in dev but not in Astro's
// build-time Node ESM loader — import the default and destructure instead.
import isoCountries from 'i18n-iso-countries';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { useProfile } from '../lib/useProfile';
import { withBase } from '../lib/url';
import { countryCodeToFlag } from '../lib/format';
import worldTopology from 'world-atlas/countries-110m.json';

const { numericToAlpha2 } = isoCountries;

const WIDTH = 960;
const HEIGHT = 500;

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

export default function WorldMap() {
  const session = useSession();
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [visited, setVisited] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
      return;
    }
    if (!session) return;

    let cancelled = false;

    async function load() {
      const { data, error: fetchError } = await supabase.from('visited_countries').select('country_code');
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

  async function toggleCountry(alpha2: string) {
    if (!isAdmin || !visited) return;
    setError(null);

    if (visited.has(alpha2)) {
      const { error: deleteError } = await supabase.from('visited_countries').delete().eq('country_code', alpha2);
      if (deleteError) {
        setError('Nie udało się zaktualizować mapy.');
        return;
      }
      setVisited((prev) => {
        const next = new Set(prev);
        next.delete(alpha2);
        return next;
      });
    } else {
      const { error: insertError } = await supabase.from('visited_countries').insert({ country_code: alpha2 });
      if (insertError) {
        setError('Nie udało się zaktualizować mapy.');
        return;
      }
      setVisited((prev) => new Set(prev).add(alpha2));
    }
  }

  if (session === undefined || visited === null) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  const visitedList = countries.filter((c) => visited.has(c.alpha2));

  return (
    <div>
      <div className="card map-card">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="world-map">
          {countries.map((c) => (
            <path
              key={c.alpha2}
              d={c.path}
              className={`world-map__country ${visited.has(c.alpha2) ? 'world-map__country--visited' : ''} ${
                isAdmin ? 'world-map__country--clickable' : ''
              }`}
              onClick={() => toggleCountry(c.alpha2)}
            >
              <title>{c.name}</title>
            </path>
          ))}
        </svg>
      </div>

      {error && <p className="state-message">{error}</p>}

      <p className="form-hint map-count">Odwiedzone kraje: {visitedList.length}</p>
      {isAdmin && <p className="form-hint">Stuknij kraj na mapie, żeby zaznaczyć go jako odwiedzony.</p>}

      {visitedList.length > 0 && (
        <div className="card settings-list visited-list">
          {visitedList.map((c) => (
            <div key={c.alpha2} className="settings-row">
              <span className="settings-row__label">
                {countryCodeToFlag(c.alpha2)} {c.name}
              </span>
              {isAdmin && (
                <button type="button" onClick={() => toggleCountry(c.alpha2)}>
                  Usuń
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
