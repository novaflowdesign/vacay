// Fixed-order categorical palette (8 hues), validated for CVD-safe adjacency.
// Never cycle or reassign by rank — each category gets a stable slot derived
// from its name, so the same category keeps the same color everywhere.
export const CATEGORICAL_PALETTE = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
];

export function colorForCategory(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORICAL_PALETTE[hash % CATEGORICAL_PALETTE.length];
}
