import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { clearAccessToken, restoreSession, setAccessToken } from './apiClient';
import { AuthContext } from './context';

const persistUser = (user) => {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((restoredUser) => {
        if (active) {
          persistUser(restoredUser);
          setUser(restoredUser);
        }
      })
      .catch(() => {
        if (active) {
          persistUser(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const handleExpiry = () => {
      clearAccessToken();
      persistUser(null);
      setUser(null);
    };
    window.addEventListener('auth:expired', handleExpiry);
    return () => {
      active = false;
      window.removeEventListener('auth:expired', handleExpiry);
    };
  }, []);

  const completeLogin = ({ user: nextUser, accessToken }) => {
    setAccessToken(accessToken);
    persistUser(nextUser);
    setUser(nextUser);
  };

  const updateUser = (changes) => {
    setUser((previous) => {
      if (!previous) return previous;
      const nextUser = { ...previous, ...changes };
      persistUser(nextUser);
      return nextUser;
    });
  };

  const logout = async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Không thể đăng xuất. Vui lòng thử lại.');

    clearAccessToken();
    persistUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, completeLogin, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
