// Browser test entry point only; never imported by the production application.
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import AdminPage from '../../../src/pages/AdminPage';
import { AuthContext } from '../../../src/auth/context';
import { setAccessToken } from '../../../src/auth/apiClient';
import '../../../src/index.css';

const { token, user } = await (await fetch('/__analytics_session')).json();
setAccessToken(token);
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user, logout: async () => {} }}>
    <BrowserRouter>
      <Routes>
        <Route path="/__analytics_test" element={<Outlet context={{ currentUser: user }} />}>
          <Route index element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AuthContext.Provider>
);
