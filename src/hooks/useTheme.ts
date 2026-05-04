import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system');

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (t: Theme) => {
      root.classList.remove('light', 'dark');
      if (t === 'system') {
        const isDark = mediaQuery.matches;
        root.classList.add(isDark ? 'dark' : 'light');
      } else {
        root.classList.add(t);
      }
    };

    localStorage.setItem('theme', theme);
    applyTheme(theme);

    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  return { theme, setTheme };
}
