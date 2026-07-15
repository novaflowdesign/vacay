import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useProfile } from '../../lib/useProfile';
import { withBase } from '../../lib/url';
import { countryCodeToFlag, formatDateRange } from '../../lib/format';
import { addDaysToISO, isoDatesBetween } from '../../lib/dateRange';
import type { Trip, ItineraryDay } from '../../lib/types';
import DayCard from './DayCard';

async function loadDays(tripId: string): Promise<ItineraryDay[]> {
  const { data } = await supabase
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId)
    .order('day_number', { ascending: true });
  return (data as ItineraryDay[]) ?? [];
}

export default function PlanDetail() {
  const session = useSession();
  const profile = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [tripId, setTripId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [days, setDays] = useState<ItineraryDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (!tripData) return;

      let existingDays = await loadDays(id!);
      if (cancelled) return;

      // Pierwsza wizyta w planie tego wyjazdu — jeśli nie ma jeszcze dni, a
      // wyjazd ma ustawione daty, wygeneruj je automatycznie. Dla widza
      // insert po prostu nie przejdzie przez RLS i nic się nie stanie.
      if (existingDays.length === 0 && tripData.start_date && tripData.end_date) {
        const dates = isoDatesBetween(tripData.start_date, tripData.end_date);
        const rows = dates.map((date, i) => ({ trip_id: id, day_number: i + 1, day_date: date }));
        const { error: genError } = await supabase.from('itinerary_days').insert(rows);
        if (!genError) {
          existingDays = await loadDays(id!);
          if (cancelled) return;
        }
      }

      setDays(existingDays);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleAddDay() {
    if (!tripId) return;
    const lastDay = days && days.length > 0 ? days[days.length - 1] : null;
    const nextNumber = lastDay ? lastDay.day_number + 1 : 1;
    const nextDate = lastDay ? addDaysToISO(lastDay.day_date, 1) : new Date().toISOString().slice(0, 10);

    const { error: insertError } = await supabase.from('itinerary_days').insert({
      trip_id: tripId,
      day_number: nextNumber,
      day_date: nextDate,
    });

    if (insertError) {
      setError('Nie udało się dodać dnia.');
      return;
    }

    setDays(await loadDays(tripId));
  }

  async function handleDeleteDay(dayId: string) {
    if (!window.confirm('Usunąć ten dzień wraz z zaplanowanymi punktami?')) return;
    const { error: deleteError } = await supabase.from('itinerary_days').delete().eq('id', dayId);
    if (deleteError) {
      setError('Nie udało się usunąć dnia.');
      return;
    }
    setDays((prev) => prev?.filter((d) => d.id !== dayId) ?? null);
  }

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

      {error && <p className="state-message">{error}</p>}

      {days === null && <p className="state-message">Wczytywanie…</p>}

      {days && days.length === 0 && (
        <p className="state-message">
          {trip.start_date && trip.end_date
            ? 'Brak zaplanowanych dni.'
            : 'Ten wyjazd nie ma ustawionych dat — dodaj dni ręcznie albo uzupełnij daty w edycji wyjazdu.'}
        </p>
      )}

      {days && days.map((day) => <DayCard key={day.id} day={day} isAdmin={isAdmin} onDeleteDay={handleDeleteDay} />)}

      {isAdmin && (
        <button type="button" className="btn-primary block-add" onClick={handleAddDay}>
          + Dodaj dzień
        </button>
      )}
    </div>
  );
}
