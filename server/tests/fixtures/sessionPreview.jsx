import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../../../src/auth/AuthContext.jsx';
import App from '../../../src/App.jsx';
import '../../../src/index.css';

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId="isolated-browser-test.apps.googleusercontent.com">
    <AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider>
  </GoogleOAuthProvider>
);
