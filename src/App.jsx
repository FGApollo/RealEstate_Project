import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import LoginAgent from './pages/LoginAgent'
import RegisterAgent from './pages/RegisterAgent'
import Home from './pages/Home'
import Swipe from './pages/Swipe'
import AgentOverview from './pages/AgentOverview'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login/agent" element={<LoginAgent />} />
      <Route path="/register/agent" element={<RegisterAgent />} />
      <Route path="/swipe/:categoryName" element={<Swipe />} />
      <Route path="/sale/overview" element={<AgentOverview />} />
    </Routes>
  )
}

export default App
