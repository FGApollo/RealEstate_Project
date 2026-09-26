import { Routes, Route } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import LoginAgent from './pages/LoginAgent'
import RegisterAgent from './pages/RegisterAgent'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Home from './pages/Home'
import Swipe from './pages/Swipe'
import AgentOverview from './pages/AgentOverview'
import Chat from './pages/Chat'
import AdminPage from './pages/AdminPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login/agent" element={<LoginAgent />} />
      <Route path="/register/agent" element={<RegisterAgent />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
        <Route path="/swipe/:categoryName" element={<Swipe />} />
        <Route path="/chat" element={<Chat />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['AGENT']} />}>
        <Route path="/sale/overview" element={<AgentOverview />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
