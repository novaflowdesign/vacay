import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useProfile } from '../../lib/useProfile';
import { withBase } from '../../lib/url';
import { countryCodeToFlag, formatDateRange } from '../../lib/format';
import type { Trip, TripParticipant } from '../../lib/types';
import ExpensesTab from './ExpensesTab';
import SummaryTab from './SummaryTab';
import InfoTab from './InfoTab';

type TabKey = 'wydatki' | 'podsumowanie' | 'info';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'wydatki', label: 'Wydatki' },
  { key: 'podsumowanie', label: 'Podsumowanie' },
  { key: 'info', label: 'Info' },
];

export default function TripDetail() {
  const session = useSession();
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [tripId, setTripId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [tab, setTab] = useState<TabKey>('wydatki');

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
      return;
    }
    if (!session) return;

    const id = new URLSearchParams(window.location.search).get('id');
    setTripId(id);

    if (!id) {
      setTrip(null);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data: tripData } = await supabase.from('trips').select('*').eq('id', id).maybeSingle();
      if (cancelled) return;
      setTrip((tripData as Trip) ?? null);

      if (tripData) {
        const { data: participantRows } = await supabase
          .from('trip_participants')
          .select('*')
          .eq('trip_id', id)
          .order('name');

        if (cancelled) return;

        setParticipants((participantRows as TripParticipant[]) ?? []);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (session === undefined || trip === undefined) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session) {
    return null;
  }

  if (!tripId) {
    return <p className="state-message">Nie wybrano wyjazdu.</p>;
  }

  if (trip === null) {
    return <p className="state-message">Nie znaleziono wyjazdu lub brak dostępu.</p>;
  }

  return (
    <div>
      <div className="trip-header">
        <span className="trip-header__flag">{countryCodeToFlag(trip.country_code)}</span>
        <div>
          <h1 className="trip-header__title">{trip.name}</h1>
          <div className="trip-header__dates">{formatDateRange(trip.start_date, trip.end_date)}</div>
        </div>
      </div>

      <div className="sub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`sub-tabs__item ${tab === t.key ? 'sub-tabs__item--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" key={tab}>
        {tab === 'wydatki' && (
          <ExpensesTab tripId={trip.id} participants={participants} isAdmin={isAdmin} />
        )}
        {tab === 'podsumowanie' && <SummaryTab tripId={trip.id} />}
        {tab === 'info' && <InfoTab trip={trip} participants={participants} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
