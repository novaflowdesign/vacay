import { countryCodeToFlag, formatDateRange } from '../../lib/format';
import { withBase } from '../../lib/url';
import type { Trip, TripParticipant } from '../../lib/types';

interface InfoTabProps {
  trip: Trip;
  participants: TripParticipant[];
  isAdmin: boolean;
}

export default function InfoTab({ trip, participants, isAdmin }: InfoTabProps) {
  return (
    <div>
      <div className="card info-block">
        <div className="info-row">
          <span>Kraj</span>
          <span>
            {countryCodeToFlag(trip.country_code)} {trip.country_code ?? '—'}
          </span>
        </div>
        <div className="info-row">
          <span>Termin</span>
          <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
        </div>
        <div className="info-row">
          <span>Domyślna liczba osób</span>
          <span>{trip.default_total_people}</span>
        </div>
      </div>

      <h2 className="section-title">Uczestnicy</h2>
      <div className="card">
        {participants.length === 0 ? (
          <p className="state-message">Brak przypisanych uczestników.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="info-row">
              <span>{p.name}</span>
            </div>
          ))
        )}
      </div>

      {trip.notes && (
        <>
          <h2 className="section-title">Notatki</h2>
          <div className="card info-notes">{trip.notes}</div>
        </>
      )}

      {isAdmin && (
        <a className="btn-secondary block-add" href={withBase(`/trips/edytuj/?id=${trip.id}`)}>
          Edytuj wyjazd
        </a>
      )}
    </div>
  );
}
