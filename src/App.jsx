import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CitizenDashboard from './pages/citizen/CitizenDashboard';
import TanodDashboard from './pages/tanod/TanodDashboard';
import OfficialDashboard from './pages/official/OfficialDashboard';
import LuponDashboard from './pages/lupon/LuponDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { getDashboardPath } from './lib/adminAuth';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={getDashboardPath(user.role)} replace />
          ) : (
            <LoginPage />
          )
        }
      />

      <Route
        path="/register"
        element={
          user ? (
            <Navigate to={getDashboardPath(user.role)} replace />
          ) : (
            <RegisterPage />
          )
        }
      />

      <Route
        path="/"
        element={
          <Navigate
            to={user ? getDashboardPath(user.role) : '/login'}
            replace
          />
        }
      />

      <Route
        path="/citizen/dashboard"
        element={
          <ProtectedRoute isAuthenticated={Boolean(user)} allowedRoles={['CITIZEN']}>
            <CitizenDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/tanod/dashboard"
        element={
          <ProtectedRoute isAuthenticated={Boolean(user)} allowedRoles={['TANOD']}>
            <TanodDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/official/dashboard"
        element={
          <ProtectedRoute isAuthenticated={Boolean(user)} allowedRoles={['OFFICIAL']}>
            <OfficialDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/lupon/dashboard"
        element={
          <ProtectedRoute isAuthenticated={Boolean(user)} allowedRoles={['LUPON']}>
            <LuponDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute isAuthenticated={Boolean(user)} allowedRoles={['ADMIN']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </AuthProvider>
  );
}