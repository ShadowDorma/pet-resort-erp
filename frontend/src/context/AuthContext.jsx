import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';

const ROLE_ALIASES = {
  ADMIN: 'ADMIN',
  RECEPCIONIST: 'RECEPCIONIST',
  RECEPTIONIST: 'RECEPCIONIST',
  RECEPCIONISTA: 'RECEPCIONIST',
  CARETAKER: 'CARETAKER',
  CAREGIVER: 'CARETAKER',
  STYLIST: 'STYLIST',
  GROOMER: 'STYLIST',
  PELUQUERO: 'STYLIST',
  STAFF: 'RECEPCIONIST',
  CLIENT: 'CLIENT',
};

export const getUserRoles = (user) => {
  const raw = [user?.roles, user?.role].flat(Infinity).filter(Boolean);
  const tokens = raw.flatMap((item) =>
    String(item)
      .replace(/[{}]/g, '')
      .split(/[,\s]+/)
      .map((role) => role.trim().toUpperCase())
      .filter(Boolean)
  );
  return [...new Set(tokens.map((role) => ROLE_ALIASES[role] || role))];
};

export const userCanAccess = (user, allowedRoles = []) => {
  const roles = getUserRoles(user);
  if (roles.includes('ADMIN')) {
    return true;
  }
  const allowed = allowedRoles.map((role) => ROLE_ALIASES[String(role).toUpperCase()] || String(role).toUpperCase());
  return roles.some((role) => allowed.includes(role));
};

export const getPrimaryRole = (user) => {
  const roles = getUserRoles(user);
  if (roles.includes('ADMIN')) {
    return 'ADMIN';
  }
  if (roles.includes('RECEPCIONIST')) {
    return 'RECEPCIONIST';
  }
  if (roles.includes('CARETAKER')) {
    return 'CARETAKER';
  }
  if (roles.includes('STYLIST')) {
    return 'STYLIST';
  }
  return 'CLIENT';
};

export const getHomePath = (user) => {
  const role = getPrimaryRole(user);
  const paths = {
    CLIENT: '/mis-mascotas',
    RECEPCIONIST: '/recepcion',
    CARETAKER: '/cuidados',
    STYLIST: '/estetica',
    ADMIN: '/admin',
  };
  return paths[role] || '/mis-mascotas';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, [token]);

  const login = useCallback((nextToken, nextUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user && token),
      role: getPrimaryRole(user),
      homePath: getHomePath(user),
      setUser,
    }),
    [user, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}

export default AuthContext;
