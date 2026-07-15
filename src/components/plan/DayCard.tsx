import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDayDate } from '../../lib/dateRange';
import type { ItineraryDay, ItineraryItem } from '../../lib/types';

const ITEM_CATEGORIES = [
  { value: 'zwiedzanie', label: 'Zwiedzanie', icon: '🏛️' },
  { value: 'jedzenie', label: 'Jedzenie', icon: '🍽️' },
  { value: 'transport', label: 'Transport', icon: '🚗' },
  { value: 'odpoczynek', label: 'Odpoczynek', icon: '🏖️' },
];

function categoryIcon(value: string | null): string {
  return ITEM_CATEGORIES.find((c) => c.value === value)?.icon ?? '📍';
}

interface ItemDraft {
  time: string;
  title: string;
  description: string;
  category: string;
}

const EMPTY_DRAFT: ItemDraft = { time: '', title: '', description: '', category: '' };

interface ItemFormProps {
  draft: ItemDraft;
  setDraft: (d: ItemDraft) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  error: string | null;
  submitLabel: string;
}

function ItemForm({ draft, setDraft, onSubmit, onCancel, error, submitLabel }: ItemFormProps) {
  return (
    <form className="form itinerary-item-form" onSubmit={onSubmit}>
      <div className="itinerary-item-form__row">
        <div className="itinerary-item-form__time">
          <label htmlFor="itemTime">Godzina</label>
          <input
            id="itemTime"
            type="time"
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="itemCategory">Kategoria</label>
          <select
            id="itemCategory"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            <option value="">Brak</option>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="itemTitle">Co robimy</label>
        <input
          id="itemTitle"
          type="text"
          required
          placeholder="np. Zwiedzanie Wawelu"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="itemDescription">Notatka (opcjonalnie)</label>
        <input
          id="itemDescription"
          type="text"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn-primary" type="submit">
          {submitLabel}
        </button>
        <button className="btn-secondary" type="button" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

interface DayCardProps {
  day: ItineraryDay;
  isAdmin: boolean;
  onDeleteDay: (dayId: string) => void;
}

export default function DayCard({ day, isAdmin, onDeleteDay }: DayCardProps) {
  const [items, setItems] = useState<ItineraryItem[] | null>(null);
  const [formMode, setFormMode] = useState<'closed' | 'create' | string>('closed');
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    const { data, error: fetchError } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('day_id', day.id)
      .order('order_index', { ascending: true });

    if (fetchError) {
      setError('Nie udało się wczytać punktów planu.');
      return;
    }
    setItems((data as ItineraryItem[]) ?? []);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.id]);

  function startCreate() {
    setError(null);
    setDraft(EMPTY_DRAFT);
    setFormMode('create');
  }

  function startEdit(item: ItineraryItem) {
    setError(null);
    setDraft({
      time: item.time ?? '',
      title: item.title,
      description: item.description ?? '',
      category: item.category ?? '',
    });
    setFormMode(item.id);
  }

  function cancelForm() {
    setFormMode('closed');
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!draft.title.trim()) {
      setError('Nazwa punktu planu jest wymagana.');
      return;
    }

    const payload = {
      time: draft.time || null,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      category: draft.category || null,
    };

    if (formMode === 'create') {
      const { error: insertError } = await supabase.from('itinerary_items').insert({
        ...payload,
        day_id: day.id,
        order_index: items?.length ?? 0,
      });
      if (insertError) {
        setError('Nie udało się dodać punktu planu.');
        return;
      }
    } else {
      const { error: updateError } = await supabase.from('itinerary_items').update(payload).eq('id', formMode);
      if (updateError) {
        setError('Nie udało się zapisać zmian.');
        return;
      }
    }

    cancelForm();
    loadItems();
  }

  async function handleDeleteItem(id: string) {
    if (!window.confirm('Usunąć ten punkt planu?')) return;
    await supabase.from('itinerary_items').delete().eq('id', id);
    loadItems();
  }

  return (
    <div className="card day-card">
      <div className="day-card__header">
        <div>
          <div className="day-card__number">Dzień {day.day_number}</div>
          <div className="day-card__date">{formatDayDate(day.day_date)}</div>
        </div>
        {isAdmin && (
          <button type="button" className="day-card__delete" onClick={() => onDeleteDay(day.id)}>
            Usuń dzień
          </button>
        )}
      </div>

      {items === null && <p className="state-message">Wczytywanie…</p>}

      {items && items.length === 0 && formMode === 'closed' && (
        <p className="state-message">Brak zaplanowanych punktów.</p>
      )}

      {items && items.length > 0 && (
        <div className="itinerary-items">
          {items.map((item) =>
            formMode === item.id ? (
              <ItemForm
                key={item.id}
                draft={draft}
                setDraft={setDraft}
                onSubmit={handleSubmit}
                onCancel={cancelForm}
                error={error}
                submitLabel="Zapisz zmiany"
              />
            ) : (
              <div key={item.id} className="itinerary-item">
                <div className="itinerary-item__main">
                  {item.time && <span className="itinerary-item__time">{item.time}</span>}
                  <span className="itinerary-item__category">{categoryIcon(item.category)}</span>
                  <span className="itinerary-item__title">{item.title}</span>
                </div>
                {item.description && <div className="itinerary-item__description">{item.description}</div>}
                {isAdmin && (
                  <div className="itinerary-item__actions">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        startEdit(item);
                      }}
                    >
                      Edytuj
                    </a>
                    <button type="button" onClick={() => handleDeleteItem(item.id)}>
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {formMode === 'create' && (
        <ItemForm
          draft={draft}
          setDraft={setDraft}
          onSubmit={handleSubmit}
          onCancel={cancelForm}
          error={error}
          submitLabel="Dodaj punkt"
        />
      )}

      {isAdmin && formMode === 'closed' && (
        <button type="button" className="btn-secondary block-add" onClick={startCreate}>
          + Dodaj punkt planu
        </button>
      )}
    </div>
  );
}
