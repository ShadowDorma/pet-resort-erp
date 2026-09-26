import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GuestRoute, ProtectedRoute } from './ProtectedRoute';
import ErrorBoundary from '../components/ErrorBoundary';
import Navbar from '../components/Navbar';
import Home from '../pages/Home';
import Services from '../pages/Services';
import Auth from '../pages/Auth';
import MyPets from '../pages/MyPets';
import Profile from '../pages/Profile';
import Bookings from '../pages/Bookings';
import PetDetail from '../pages/PetDetail';
import Notifications from '../pages/Notifications';
import AdminDashboard from '../pages/AdminDashboard';
import StaffDashboard from '../pages/StaffDashboard';
import ReceptionDashboard from '../pages/ReceptionDashboard';
import CaretakerDashboard from '../pages/CaretakerDashboard';
import StylistDashboard from '../pages/StylistDashboard';

function PetDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/mis-mascotas/${id}`} replace />;
}

function StaffPanel({ roles, children }) {
  return (
    <ProtectedRoute roles={roles}>
      <ErrorBoundary fallbackLabel="Panel operativo">{children}</ErrorBoundary>
    </ProtectedRoute>
  );
}

export default function AppRoutes() {
  const { loading } = useAuth();
  const location = useLocation();
  const fullBleed = ['/', '/auth', '/login', '/register'].includes(location.pathname);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-primary-dark">
        Cargando Pet Resort...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main className={fullBleed ? '' : 'mx-auto max-w-6xl px-4 py-6 sm:py-8'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicios" element={<Services />} />
          <Route
            path="/auth"
            element={
              <GuestRoute>
                <Auth />
              </GuestRoute>
            }
          />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Auth />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <Auth />
              </GuestRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-mascotas"
            element={
              <ProtectedRoute roles={['CLIENT']}>
                <MyPets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-mascotas/:id"
            element={
              <ProtectedRoute roles={['CLIENT']}>
                <PetDetail />
              </ProtectedRoute>
            }
          />
          <Route path="/mascotas" element={<Navigate to="/mis-mascotas" replace />} />
          <Route path="/mascotas/:id" element={<PetDetailRedirect />} />
          <Route
            path="/reservar"
            element={
              <ProtectedRoute roles={['CLIENT']}>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notificaciones"
            element={
              <ProtectedRoute roles={['CLIENT']}>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recepcion"
            element={
              <StaffPanel roles={['RECEPCIONIST', 'ADMIN']}>
                <ReceptionDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/reception"
            element={
              <StaffPanel roles={['RECEPCIONIST', 'ADMIN']}>
                <ReceptionDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/cuidados"
            element={
              <StaffPanel roles={['CARETAKER', 'ADMIN']}>
                <CaretakerDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/caretaker"
            element={
              <StaffPanel roles={['CARETAKER', 'ADMIN']}>
                <CaretakerDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/estetica"
            element={
              <StaffPanel roles={['STYLIST', 'ADMIN']}>
                <StylistDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/stylist"
            element={
              <StaffPanel roles={['STYLIST', 'ADMIN']}>
                <StylistDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/admin"
            element={
              <StaffPanel roles={['ADMIN']}>
                <AdminDashboard />
              </StaffPanel>
            }
          />
          <Route
            path="/staff"
            element={
              <StaffPanel roles={['ADMIN']}>
                <StaffDashboard />
              </StaffPanel>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
