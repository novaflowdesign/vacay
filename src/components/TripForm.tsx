import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { useProfile } from '../lib/useProfile';
import { withBase } from '../lib/url';
import { resizeImage } from '../lib/resizeImage';
import type { Profile } from '../lib/types';

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

interface ParticipantRow {
  localId: string;
  name: string;
  profileId: string | null;
}

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `participant-${localIdCounter}`;
}

export default function TripForm() {
  const session = useSession();
  const profile = useProfile();
  const [tripId, setTripId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [defaultTotalPeople, setDefaultTotalPeople] = useState('5');
  const [notes, setNotes] = useState('');

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [participants, setParticipants] = useState<ParticipantRow[]>([
    { localId: nextLocalId(), name: '', profileId: null },
  ]);
  const [originalProfileIds, setOriginalProfileIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
    }
  }, [session]);

  useEffect(() => {
    if (profile === null) {
      window.location.replace(withBase('/'));
    }
    if (profile && profile.role !== 'admin') {
      window.location.replace(withBase('/'));
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;

    const id = new URLSearchParams(window.location.search).get('id');
    setTripId(id);

    let cancelled = false;

    async function load() {
      const { data: profileRows } = await supabase.from('profiles').select('*').order('display_name');
      if (cancelled) return;
      setProfiles((profileRows as Profile[]) ?? []);

      if (!id) {
        setReady(true);
        return;
      }

      const [{ data: trip }, { data: existingParticipants }] = await Promise.all([
        supabase.from('trips').select('*').eq('id', id).single(),
        supabase.from('trip_participants').select('*').eq('trip_id', id).order('name'),
      ]);

      if (cancelled) return;

      if (trip) {
        setName(trip.name ?? '');
        setCountryCode(trip.country_code ?? '');
        setStartDate(trip.start_date ?? '');
        setEndDate(trip.end_date ?? '');
        setDefaultTotalPeople(String(trip.default_total_people ?? 5));
        setNotes(trip.notes ?? '');
        setPhotoUrl(trip.photo_url ?? null);
      }

      if (existingParticipants && existingParticipants.length > 0) {
        setParticipants(
          existingParticipants.map((p) => ({ localId: nextLocalId(), name: p.name, profileId: p.profile_id }))
        );
        setOriginalProfileIds(
          new Set(existingParticipants.map((p) => p.profile_id).filter((pid): pid is string => Boolean(pid)))
        );
      }

      setReady(true);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  function updateParticipant(localId: string, value: string) {
    setParticipants((prev) => prev.map((p) => (p.localId === localId ? { ...p, name: value } : p)));
  }

  function updateParticipantProfile(localId: string, profileId: string | null) {
    setParticipants((prev) => prev.map((p) => (p.localId === localId ? { ...p, profileId } : p)));
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, { localId: nextLocalId(), name: '', profileId: null }]);
  }

  function removeParticipant(localId: string) {
    setParticipants((prev) => prev.filter((p) => p.localId !== localId));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (file.size > MAX_PHOTO_SIZE) {
      setError('Zdjęcie jest za duże (maksymalnie 10 MB).');
      return;
    }

    setError(null);
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemovePhoto(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Nazwa wyjazdu jest wymagana.');
      return;
    }

    const defaultTotalPeopleNum = Number(defaultTotalPeople);
    if (!Number.isFinite(defaultTotalPeopleNum) || defaultTotalPeopleNum < 1) {
      setError('Domyślna liczba osób musi być liczbą co najmniej 1.');
      return;
    }

    setSaving(true);

    let finalPhotoUrl = removePhoto ? null : photoUrl;

    if (photoFile) {
      setUploadingPhoto(true);
      try {
        const blob = await resizeImage(photoFile);
        const path = `${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('trip-photos')
          .upload(path, blob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        finalPhotoUrl = supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl;
      } catch (uploadErr) {
        console.error('photo upload failed', uploadErr);
        setUploadingPhoto(false);
        setSaving(false);
        setError('Nie udało się przesłać zdjęcia.');
        return;
      }
      setUploadingPhoto(false);
    }

    const payload = {
      name: name.trim(),
      country_code: countryCode.trim().toUpperCase() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      default_total_people: defaultTotalPeopleNum,
      notes: notes.trim() || null,
      photo_url: finalPhotoUrl,
    };

    let currentTripId = tripId;

    if (tripId) {
      const { error: updateError } = await supabase.from('trips').update(payload).eq('id', tripId);
      if (updateError) {
        console.error('trips update failed', updateError);
        setSaving(false);
        setError(`Nie udało się zapisać zmian: ${updateError.message}`);
        return;
      }
      const { error: clearParticipantsError } = await supabase
        .from('trip_participants')
        .delete()
        .eq('trip_id', tripId);
      if (clearParticipantsError) {
        console.error('trip_participants delete failed', clearParticipantsError);
        setSaving(false);
        setError(`Nie udało się zaktualizować uczestników: ${clearParticipantsError.message}`);
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('trips')
        .insert({ ...payload, created_by: session?.user.id })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error('trips insert failed', insertError);
        setSaving(false);
        setError(`Nie udało się utworzyć wyjazdu: ${insertError?.message ?? 'nieznany błąd'}`);
        return;
      }
      currentTripId = inserted.id;
    }

    const seenNames = new Set<string>();
    const rows: { trip_id: string; name: string; profile_id: string | null }[] = [];
    for (const p of participants) {
      const trimmedName = p.name.trim();
      if (!trimmedName || seenNames.has(trimmedName)) continue;
      seenNames.add(trimmedName);
      rows.push({ trip_id: currentTripId as string, name: trimmedName, profile_id: p.profileId });
    }

    if (currentTripId && rows.length > 0) {
      const { error: participantsError } = await supabase.from('trip_participants').insert(rows);
      if (participantsError) {
        console.error('trip_participants insert failed', participantsError);
        setSaving(false);
        setError(`Wyjazd zapisany, ale nie udało się zapisać uczestników: ${participantsError.message}`);
        return;
      }
    }

    if (currentTripId) {
      const newProfileIds = new Set(rows.map((r) => r.profile_id).filter((pid): pid is string => Boolean(pid)));
      const tripCountryCode = payload.country_code;

      const removedProfileIds = [...originalProfileIds].filter((pid) => !newProfileIds.has(pid));
      if (removedProfileIds.length > 0) {
        await supabase
          .from('visited_countries')
          .delete()
          .eq('trip_id', currentTripId)
          .in('profile_id', removedProfileIds);
      }

      const addedProfileIds = [...newProfileIds].filter((pid) => !originalProfileIds.has(pid));
      if (addedProfileIds.length > 0 && tripCountryCode) {
        await supabase
          .from('visited_countries')
          .upsert(
            addedProfileIds.map((pid) => ({
              country_code: tripCountryCode,
              profile_id: pid,
              trip_id: currentTripId,
            })),
            { onConflict: 'country_code,profile_id', ignoreDuplicates: true }
          );
      }
    }

    setSaving(false);
    window.location.replace(withBase('/'));
  }

  async function handleDelete() {
    if (!tripId) return;
    if (!window.confirm('Usunąć ten wyjazd wraz ze wszystkimi wydatkami? Tej operacji nie można cofnąć.')) {
      return;
    }
    setSaving(true);
    const { error: deleteError } = await supabase.from('trips').delete().eq('id', tripId);
    if (deleteError) {
      setSaving(false);
      setError('Nie udało się usunąć wyjazdu.');
      return;
    }
    window.location.replace(withBase('/'));
  }

  if (session === undefined || profile === undefined) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  if (!session || !profile || profile.role !== 'admin') {
    return null;
  }

  if (!ready) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Nazwa wyjazdu</label>
        <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label>Zdjęcie wyjazdu</label>
        {(photoPreview || (photoUrl && !removePhoto)) && (
          <div className="photo-preview">
            <img src={photoPreview ?? photoUrl ?? ''} alt="" />
            <button type="button" className="btn-secondary" onClick={handleRemovePhoto}>
              Usuń zdjęcie
            </button>
          </div>
        )}
        <label htmlFor="photo" className="btn-secondary file-input-label">
          {photoPreview || (photoUrl && !removePhoto) ? 'Zmień zdjęcie' : 'Wybierz zdjęcie'}
        </label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="visually-hidden-input"
        />
        {uploadingPhoto && <p className="form-hint">Przesyłanie zdjęcia…</p>}
      </div>
      <div>
        <label htmlFor="country">Kod kraju (ISO, np. PL, ES, IT)</label>
        <input
          id="country"
          type="text"
          maxLength={2}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
        />
      </div>
      <div>
        <label htmlFor="start">Data rozpoczęcia</label>
        <input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
      <div>
        <label htmlFor="end">Data zakończenia</label>
        <input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div>
        <label htmlFor="people">Domyślna liczba osób</label>
        <input
          id="people"
          type="text"
          inputMode="numeric"
          placeholder="5"
          required
          value={defaultTotalPeople}
          onChange={(e) => setDefaultTotalPeople(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="notes">Notatki</label>
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <label>Uczestnicy</label>
        <p className="form-hint">
          Wpisz imiona osób biorących udział w wyjeździe (np. „Ja”, „Teść”) — to etykiety używane
          przy dzieleniu wydatków. Podpięcie konta daje tej osobie dostęp do wyjazdu i automatycznie
          zaznacza jego kraj na jej mapie.
        </p>
        <div className="participant-list">
          {participants.map((p) => (
            <div key={p.localId} className="participant-entry">
              <div className="participant-row">
                <input
                  type="text"
                  placeholder="Imię uczestnika"
                  value={p.name}
                  onChange={(e) => updateParticipant(p.localId, e.target.value)}
                />
                <button type="button" onClick={() => removeParticipant(p.localId)}>
                  Usuń
                </button>
              </div>
              <select
                className="participant-row__account"
                value={p.profileId ?? ''}
                onChange={(e) => updateParticipantProfile(p.localId, e.target.value || null)}
              >
                <option value="">— brak konta —</option>
                {profiles.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.display_name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary participant-add" onClick={addParticipant}>
          + Dodaj uczestnika
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? 'Zapisywanie…' : tripId ? 'Zapisz zmiany' : 'Utwórz wyjazd'}
      </button>
      {tripId && (
        <button className="btn-danger" type="button" onClick={handleDelete} disabled={saving}>
          Usuń wyjazd
        </button>
      )}
    </form>
  );
}
