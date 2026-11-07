import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { authApi } from '../services';

const ThemeContext = createContext(null);
const KEY = 'ff_theme';

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const resolve = (mode) => (mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode);

export function ThemeProvider({ children }) {
  const { user, setUser } = useAuth();
  const [mode, setModeState] = useState(() => localStorage.getItem(KEY) || 'system');

  // Adopt the account's saved preference after sign-in.
  useEffect(() => { if (user?.theme) setModeState(user.theme); }, [user?.theme]);

  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolve(mode));
    apply();
    localStorage.setItem(KEY, mode);
    if (mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next) => {
    setModeState(next);
    if (user) authApi.updateProfile({ theme: next }).then((r) => setUser(r.data.user)).catch(() => {});
  }, [user, setUser]);

  const value = useMemo(() => ({ mode, resolved: resolve(mode), setMode, toggle: () => setMode(resolve(mode) === 'dark' ? 'light' : 'dark') }), [mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
