import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';

// Lazy Load Pages
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BatchList = lazy(() => import('./pages/BatchList'));
const BatchDetails = lazy(() => import('./pages/BatchDetails'));
const Register = lazy(() => import('./pages/Register'));
const Approvals = lazy(() => import('./pages/Approvals'));
const TestList = lazy(() => import('./pages/TestList'));
const TestDetails = lazy(() => import('./pages/TestDetails'));
const ScanMarks = lazy(() => import('./pages/ScanMarks'));
const Fees = lazy(() => import('./pages/Fees'));
const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const CheckStatus = lazy(() => import('./pages/CheckStatus'));
const SetupAccount = lazy(() => import('./pages/SetupAccount'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));

// Protected Route Component
function PrivateRoute({ children }: { children: any }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

// Role Protected Route Component
function RoleRoute({ children, allowedRole }: { children: any, allowedRole: string }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== allowedRole) {
      if (allowedRole === 'SUPER_ADMIN') {
        return <Navigate to="/dashboard" />;
      }
      return <Navigate to="/login" />;
    }
    return children;
  } catch (e) {
    return <Navigate to="/login" />;
  }
}

// Simple Loading Spinner
const Loading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
  </div>
);

function App() {
  return (
    <ChunkErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Landing Page */}
            <Route path="/" element={<Home />} />

            <Route path="/login" element={<AdminLogin />} />
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/super-admin" element={
              <RoleRoute allowedRole="SUPER_ADMIN">
                <SuperAdminDashboard />
              </RoleRoute>
            } />

            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/batches" element={<PrivateRoute><BatchList /></PrivateRoute>} />
            <Route path="/batches/:id" element={<PrivateRoute><BatchDetails /></PrivateRoute>} />
            <Route path="/tests" element={<PrivateRoute><TestList /></PrivateRoute>} />
            <Route path="/tests/:id" element={<PrivateRoute><TestDetails /></PrivateRoute>} />
            <Route path="/scan" element={<PrivateRoute><ScanMarks /></PrivateRoute>} />
            <Route path="/fees" element={<PrivateRoute><Fees /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />

            <Route path="/approvals" element={<PrivateRoute><Approvals /></PrivateRoute>} />

            <Route path="/register/:batchId" element={<Register />} />
            <Route path="/kiosk/register/:batchId" element={<Register mode="kiosk" />} />
            <Route path="/check-status/:batchId" element={<CheckStatus />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ChunkErrorBoundary>
  )
}

export default App
