import { withBase } from './url';

export const NAV_TABS = [
  { href: withBase('/'), icon: 'trips' as const, label: 'Wyjazdy' },
  { href: withBase('/mapa'), icon: 'map' as const, label: 'Mapa' },
  { href: withBase('/kalkulator'), icon: 'calculator' as const, label: 'Kalkulator' },
  { href: withBase('/plan'), icon: 'calendar' as const, label: 'Plan' },
];
