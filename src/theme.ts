type Theme = 'light' | 'dark';
const storageKey = 'near-theme';

export function initializeTheme(onChange: () => void) {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference: Theme | null = readPreference();
  function readPreference(): Theme | null {
    try { const value = localStorage.getItem(storageKey); return value === 'light' || value === 'dark' ? value : null; }
    catch { return null; }
  }
  function apply() {
    const theme = preference ?? (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f6f8fc');
    onChange();
  }
  const onSystemChange = () => { if (preference === null) apply(); };
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) { preference = readPreference(); apply(); } };
  system.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  apply();
  return {
    toggle() {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(storageKey, preference); } catch { /* The toggle still works when storage is unavailable. */ }
      apply();
    },
  };
}
