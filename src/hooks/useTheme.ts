import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system');

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (t: Theme) => {
      const root = window.document.documentElement;
      const body = window.document.body;
      
      const isDark = t === 'dark' || (t === 'system' && mediaQuery.matches);
      
      root.classList.remove('light', 'dark');
      body.classList.remove('light', 'dark');
      
      if (isDark) {
        root.classList.add('dark');
        body.classList.add('dark');
      } else {
        root.classList.add('light');
        body.classList.add('light');
      }
      
      // Strict pure black background for dark mode on body
      if (isDark) {
        body.style.backgroundColor = '#000000';
      } else {
        body.style.backgroundColor = ''; // Remove inline style for light mode
      }
      
      // Update theme-color meta tag for mobile status bar
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(metaThemeColor);
      }
      metaThemeColor.setAttribute('content', isDark ? '#000000' : '#ffffff');
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
