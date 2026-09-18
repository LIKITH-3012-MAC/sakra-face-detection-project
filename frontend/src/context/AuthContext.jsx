import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login as apiLogin, adminLogin as apiAdminLogin } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('sakra_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('sakra_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Validate session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('sakra_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await getCurrentUser();
        if (res?.data) {
          const userData = {
            email: res.data.sub,
            full_name: res.data.name,
            role: res.data.role,
            student_id: res.data.student_id,
            roll_number: res.data.roll_number
          };
          setUser(userData);
          localStorage.setItem('sakra_user', JSON.stringify(userData));
        }
      } catch (err) {
        console.warn('Session expired or invalid:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin({ email, password });
    if (res?.data?.token && res?.data?.user) {
      const authToken = res.data.token;
      const authUser = res.data.user;
      setToken(authToken);
      setUser(authUser);
      localStorage.setItem('sakra_token', authToken);
      localStorage.setItem('sakra_user', JSON.stringify(authUser));
      return authUser;
    }
    throw new Error(res?.message || 'Login failed');
  };

  const adminLogin = async (email, password) => {
    const res = await apiAdminLogin({ email, password });
    if (res?.data?.token && res?.data?.user) {
      const authToken = res.data.token;
      const authUser = res.data.user;
      setToken(authToken);
      setUser(authUser);
      localStorage.setItem('sakra_token', authToken);
      localStorage.setItem('sakra_user', JSON.stringify(authUser));
      return authUser;
    }
    throw new Error(res?.message || 'Administrator authentication failed');
  };

  const setAuthSession = (authToken, authUser) => {
    setToken(authToken);
    setUser(authUser);
    localStorage.setItem('sakra_token', authToken);
    localStorage.setItem('sakra_user', JSON.stringify(authUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('sakra_token');
    localStorage.removeItem('sakra_user');
  };

  const role = user?.role || null;
  const isAuthenticated = Boolean(token && user);
  const isAdmin = role === 'admin';
  const isStudent = role === 'user';

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        loading,
        isAuthenticated,
        isAdmin,
        isStudent,
        login,
        adminLogin,
        setAuthSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
