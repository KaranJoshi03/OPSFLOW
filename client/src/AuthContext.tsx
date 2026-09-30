import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  teamMemberships?: any[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('opsflow_token'));
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user on mount if token exists
  useEffect(() => {
    if (token) {
      authAPI.me()
        .then((res) => setUser(res.data.user))
        .catch(() => {
          localStorage.removeItem('opsflow_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    const { user: userData, token: newToken } = res.data;
    localStorage.setItem('opsflow_token', newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await authAPI.register(email, password, displayName);
    const { user: userData, token: newToken } = res.data;
    localStorage.setItem('opsflow_token', newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('opsflow_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
