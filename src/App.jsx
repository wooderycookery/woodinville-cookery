import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SaveTheDate from './pages/SaveTheDate'
import EventLanding from './pages/EventLanding'
import GuestDashboard from './pages/GuestDashboard'
import Gallery from './pages/Gallery'
import History from './pages/History'
import NotFound from './pages/NotFound'
import ProtectedRoute from './components/auth/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/event/:eventId" element={<EventLanding />} />
        <Route path="/my-invitations" element={<GuestDashboard />} />
        <Route path="/gallery/:eventId/:type" element={<Gallery />} />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/save-the-date"
          element={
            <ProtectedRoute>
              <SaveTheDate />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
