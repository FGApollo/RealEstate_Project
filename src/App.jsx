import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import SessionRoute from './components/SessionRoute'
import PageErrorBoundary from './components/PageErrorBoundary'
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const LoginAgent = lazy(() => import('./pages/LoginAgent'))
const RegisterAgent = lazy(() => import('./pages/RegisterAgent'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ResendVerification = lazy(() => import('./pages/ResendVerification'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Home = lazy(() => import('./pages/Home'))
const Swipe = lazy(() => import('./pages/Swipe'))
const AgentOverview = lazy(() => import('./pages/AgentOverview'))
const AgentPayment = lazy(() => import('./pages/AgentPayment'))
const Chat = lazy(() => import('./pages/Chat'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const LifestyleOnboarding = lazy(() => import('./pages/LifestyleOnboarding'))
import './App.css'
import './mobile.css'
import { useViewportHeight } from './hooks/useViewportHeight'

function App() {
  useViewportHeight()
  const { pathname } = useLocation()
  return (
    <PageErrorBoundary key={pathname}>
    <Suspense fallback={<div className="page-loading" role="status"><span aria-hidden="true" />Đang mở trang…</div>}>
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
    </Suspense>
    </PageErrorBoundary>
  )
}

export default App
