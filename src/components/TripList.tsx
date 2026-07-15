import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { useProfile } from '../lib/useProfile';
import { withBase } from '../lib/url';
import { countryCodeToFlag, formatDateRange, formatMoney } from '../lib/format';
import type { Trip, TripTotal } from '../lib/types';

export default function TripList() {
  const session = useSession();
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [totals, setTotals] = useState<Record<string, TripTotal[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
      return;
    }
    if (!session) return;

    let cancelled = false;

    async function loadTrips() {
      const [{ data: tripsData, error: tripsError }, { data: totalsData }] = await Promise.all([
        supabase.from('trips').select('*').order('start_date', { ascending: false }),
        supabase.from('trip_totals').select('*'),
      ]);

      if (cancelled) return;

      if (tripsError) {
        setError('Nie udało się wczytać wyjazdów.');
        return;
      }

      const totalsMap: Record<string, TripTotal[]> = {};
      for (const row of (totalsData as TripTotal[] | null) ?? []) {
        (totalsMap[row.trip_id] ??= []).push(row);
      }

      setTrips(tripsData as Trip[]);
      setTotals(totalsMap);
    }

    loadTrips();

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleDelete(tripId: string) {
    if (!window.confirm('Usunąć ten wyjazd wraz ze wszystkimi wydatkami? Tej operacji nie można cofnąć.')) {
      return;
    }
    const { error: deleteError } = await supabase.from('trips').delete().eq('id', tripId);
    if (deleteError) {
      setError('Nie udało się usunąć wyjazdu.');
      return;
    }
    setTrips((prev) => prev?.filter((t) => t.id !== tripId) ?? null);
  }

  if (session === undefined || (session && trips === null && !error)) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div>
      {isAdmin && (
        <a className="btn-primary trip-list__add" href={withBase('/trips/nowy')}>
          + Dodaj wyjazd
        </a>
      )}

      {error && <p className="state-message">{error}</p>}

      {!error && trips && trips.length === 0 && (
        <p className="state-message">Brak wyjazdów do wyświetlenia.</p>
      )}

      {!error &&
        trips &&
        trips.map((trip) => (
          <div key={trip.id} className="trip-tile">
            <div className="trip-tile__row">
              <div className="trip-tile__photo">
                {trip.photo_url ? (
                  <img src={trip.photo_url} alt="" />
                ) : (
                  <span className="trip-tile__flag">{countryCodeToFlag(trip.country_code)}</span>
                )}
              </div>
              <div className="trip-tile__content">
                <a className="trip-tile__link" href={withBase(`/trips/?id=${trip.id}`)}>
                  <div className="trip-tile__name">{trip.name}</div>
                  <div className="trip-tile__total">
                    {totals[trip.id] && totals[trip.id].length > 0 ? (
                      totals[trip.id].map((t) => <span key={t.currency}>{formatMoney(t.total_spent, t.currency)}</span>)
                    ) : (
                      <span>{formatMoney(0)}</span>
                    )}
                  </div>
                  <div className="trip-tile__dates">{formatDateRange(trip.start_date, trip.end_date)}</div>
                </a>
                {isAdmin && (
                  <div className="trip-tile__actions">
                    <a href={withBase(`/trips/edytuj/?id=${trip.id}`)}>Edytuj</a>
                    <button type="button" onClick={() => handleDelete(trip.id)}>
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
