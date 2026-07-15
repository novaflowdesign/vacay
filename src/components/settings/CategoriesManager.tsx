import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ExpenseCategory } from '../../lib/types';

export default function CategoriesManager() {
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; icon: string }>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('expense_categories').select('*').order('name');
    setCategories((data as ExpenseCategory[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;

    const { error: insertError } = await supabase
      .from('expense_categories')
      .insert({ name: newName.trim(), icon: newIcon.trim() || null });

    if (insertError) {
      setError('Nie udało się dodać kategorii.');
      return;
    }

    setNewName('');
    setNewIcon('');
    load();
  }

  function startEdit(c: ExpenseCategory) {
    setEditing((prev) => ({ ...prev, [c.id]: { name: c.name, icon: c.icon ?? '' } }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(id: string) {
    const draft = editing[id];
    if (!draft || !draft.name.trim()) return;

    const { error: updateError } = await supabase
      .from('expense_categories')
      .update({ name: draft.name.trim(), icon: draft.icon.trim() || null })
      .eq('id', id);

    if (updateError) {
      setError('Nie udało się zapisać zmian.');
      return;
    }

    cancelEdit(id);
    load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Usunąć tę kategorię?')) return;

    const { error: deleteError } = await supabase.from('expense_categories').delete().eq('id', id);

    if (deleteError) {
      setError('Nie można usunąć kategorii — jest używana w wydatkach.');
      return;
    }

    load();
  }

  if (categories === null) {
    return <p className="state-message">Wczytywanie…</p>;
  }

  return (
    <div>
      <div className="card settings-list">
        {categories.length === 0 && <p className="state-message">Brak kategorii.</p>}
        {categories.map((c) => {
          const draft = editing[c.id];
          return (
            <div key={c.id} className="settings-row">
              {draft ? (
                <>
                  <input
                    type="text"
                    className="settings-row__icon-input"
                    value={draft.icon}
                    maxLength={4}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [c.id]: { ...draft, icon: e.target.value } }))}
                  />
                  <input
                    type="text"
                    className="settings-row__name-input"
                    value={draft.name}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [c.id]: { ...draft, name: e.target.value } }))}
                  />
                  <button type="button" onClick={() => saveEdit(c.id)}>
                    Zapisz
                  </button>
                  <button type="button" onClick={() => cancelEdit(c.id)}>
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <span className="settings-row__label">
                    {c.icon ?? '🛒'} {c.name}
                  </span>
                  <button type="button" onClick={() => startEdit(c)}>
                    Edytuj
                  </button>
                  <button type="button" onClick={() => handleDelete(c.id)}>
                    Usuń
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <form className="form settings-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="settings-row__icon-input"
          placeholder="🛒"
          maxLength={4}
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
        />
        <input
          type="text"
          className="settings-row__name-input"
          placeholder="Nazwa nowej kategorii"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn-secondary" type="submit">
          Dodaj kategorię
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
