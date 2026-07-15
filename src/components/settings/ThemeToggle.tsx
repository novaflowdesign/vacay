import { useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'vacay-theme';

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
    document
      .getElementById('theme-color-meta')
      ?.setAttribute('content', next === 'dark' ? '#0e1512' : '#0F4C4A');
  }

  return (
    <div className="card theme-toggle">
      <span>Tryb ciemny</span>
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'dark'}
        aria-label="Tryb ciemny"
        className={`theme-toggle__switch ${theme === 'dark' ? 'theme-toggle__switch--on' : ''}`}
        onClick={toggle}
      >
        <span className="theme-toggle__knob" />
      </button>
    </div>
  );
}
