import { Routes, Route } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import SessionRoute from './components/SessionRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import LoginAgent from './pages/LoginAgent'
import RegisterAgent from './pages/RegisterAgent'
import VerifyEmail from './pages/VerifyEmail'
import ResendVerification from './pages/ResendVerification'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Home from './pages/Home'
import Swipe from './pages/Swipe'
import AgentOverview from './pages/AgentOverview'
import AgentPayment from './pages/AgentPayment'
import Chat from './pages/Chat'
import AdminPage from './pages/AdminPage'
import UserProfile from './pages/UserProfile'
import LifestyleOnboarding from './pages/LifestyleOnboarding'
import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<SessionRoute guestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login/agent" element={<LoginAgent />} />
        <Route path="/register/agent" element={<RegisterAgent />} />
      </Route>
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/resend-verification" element={<ResendVerification />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<SessionRoute />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['USER']} />}>
        <Route path="/onboarding" element={<LifestyleOnboarding />} />
        <Route path="/swipe/:categoryName" element={<Swipe />} />
        <Route path="/profile" element={<UserProfile />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['USER', 'AGENT']} />}>
        <Route path="/chat" element={<Chat />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['AGENT']} />}>
        <Route path="/sale/overview" element={<AgentOverview />} />
        <Route path="/sale/payment/:orderId" element={<AgentPayment />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
