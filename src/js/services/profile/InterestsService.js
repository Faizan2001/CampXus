// Starter interests set with Font Awesome icon class names (Free)
// Keep lowercase names; displayName is capitalized at render time

export const MAX_INTERESTS = 10;

export const STARTER_INTERESTS = [
  { key: 'football', icon: 'fas fa-futbol' },
  { key: 'basketball', icon: 'fas fa-basketball-ball' },
  { key: 'volleyball', icon: 'fas fa-volleyball-ball' },
  { key: 'badminton', icon: 'fas fa-table-tennis-paddle-ball' },
  { key: 'cricket', icon: 'fas fa-baseball-ball' },
  { key: 'squash', icon: 'fas fa-table-tennis-paddle-ball' },
  { key: 'coding', icon: 'fas fa-code' },
  { key: 'music', icon: 'fas fa-music' },
  { key: 'gaming', icon: 'fas fa-gamepad' },
  { key: 'reading', icon: 'fas fa-book' },
  { key: 'movies', icon: 'fas fa-film' },
  { key: 'photography', icon: 'fas fa-camera' },
];

export function normalizeInterest(input) {
  if (!input) return '';
  return input.toString().trim().toLowerCase();
}

export function isValidCustomInterest(value) {
  const v = normalizeInterest(value);
  return v.length >= 3 && v.length <= 20 && /^[a-z0-9\s\-]+$/.test(v);
}

export function interestIcon(key) {
  const found = STARTER_INTERESTS.find((i) => i.key === key);
  return found ? found.icon : 'fas fa-star';
}

