import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services';
import { TOKEN_KEY } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return undefined;
    let cancelled = false;
    authApi.me()
      .then((res) => { if (!cancelled) setUser(res.data.user); })
      .catch(() => { if (!cancelled) logout(); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [logout]);

  useEffect(() => {
    window.addEventListener('ff:unauthorized', logout);
    return () => window.removeEventListener('ff:unauthorized', logout);
  }, [logout]);

  const accept = useCallback((res) => {
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const value = useMemo(() => ({
    user, loading, isAuthenticated: Boolean(user),
    login: async (email, password) => accept(await authApi.login({ email, password })),
    register: async (name, email, password) => accept(await authApi.register({ name, email, password })),
    logout,
    setUser,
  }), [user, loading, accept, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
