import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { withBase } from '../lib/url';
import { countryCodeToFlag, formatDateRange } from '../lib/format';
import type { Trip } from '../lib/types';

export default function PlanTripList() {
  const session = useSession();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
      return;
    }
    if (!session) return;

    let cancelled = false;

    async function loadTrips() {
      const { data, error: tripsError } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: false });

      if (cancelled) return;

      if (tripsError) {
        setError('Nie udało się wczytać wyjazdów.');
        return;
      }

      setTrips(data as Trip[]);
    }

    loadTrips();

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (session === undefined || (session && trips === null && !error)) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div>
      {error && <p className="state-message">{error}</p>}

      {!error && trips && trips.length === 0 && (
        <p className="state-message">Brak wyjazdów do wyświetlenia.</p>
      )}

      {!error &&
        trips &&
        trips.map((trip) => (
          <a key={trip.id} className="trip-tile" href={withBase(`/plan/wyjazd/?id=${trip.id}`)}>
            <div className="trip-tile__row">
              <div className="trip-tile__photo">
                {trip.photo_url ? (
                  <img src={trip.photo_url} alt="" />
                ) : (
                  <span className="trip-tile__flag">{countryCodeToFlag(trip.country_code)}</span>
                )}
              </div>
              <div className="trip-tile__content">
                <div className="trip-tile__name">{trip.name}</div>
                <div className="trip-tile__dates">{formatDateRange(trip.start_date, trip.end_date)}</div>
              </div>
            </div>
          </a>
        ))}
    </div>
  );
}
