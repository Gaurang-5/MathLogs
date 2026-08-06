import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, type ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { readTokenPayload } from './utils/auth';

// Lazy Load Pages
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BatchList = lazy(() => import('./pages/BatchList'));
const BatchDetails = lazy(() => import('./pages/BatchDetails'));
const Register = lazy(() => import('./pages/Register'));
const Approvals = lazy(() => import('./pages/Approvals'));
const TestList = lazy(() => import('./pages/TestList'));
const QuizList = lazy(() => import('./pages/QuizList'));
const TestDetails = lazy(() => import('./pages/TestDetails'));
const ScanMarks = lazy(() => import('./pages/ScanMarks'));
const Fees = lazy(() => import('./pages/Fees'));
const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const Billing = lazy(() => import('./pages/Billing'));
const CheckStatus = lazy(() => import('./pages/CheckStatus'));
const SetupAccount = lazy(() => import('./pages/SetupAccount'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const JoinOnboarding = lazy(() => import('./pages/JoinOnboarding'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const StudentPaymentPortal = lazy(() => import('./pages/StudentPaymentPortal'));
const StudentPortalLogin = lazy(() => import('./pages/StudentPortalLogin'));
const StudentPortalDashboard = lazy(() => import('./pages/StudentPortalDashboard'));
const TakeQuiz = lazy(() => import('./pages/student/TakeQuiz'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));

const MarketplaceHome = lazy(() => import('./pages/MarketplaceHome'));
const CoachingProfile = lazy(() => import('./pages/CoachingProfile'));
const TeacherRegistration = lazy(() => import('./pages/TeacherRegistration'));
const MarketplaceSettings = lazy(() => import('./pages/MarketplaceSettings'));

const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const AboutUs = lazy(() => import('./pages/AboutUs'));

// Protected Route Component
function PrivateRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

// Role Protected Route Component
function RoleRoute({ children, allowedRole }: { children: ReactNode, allowedRole: string }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;

  const payload = readTokenPayload(token);
  if (!payload) {
    return <Navigate to="/login" />;
  }

  if (payload.role !== allowedRole) {
    if (allowedRole === 'SUPER_ADMIN') {
      return <Navigate to="/dashboard" />;
    }
    return <Navigate to="/login" />;
  }

  return children;
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
      <Toaster position="top-center" reverseOrder={false} />
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Landing Page */}
            <Route path="/" element={<Home />} />

            <Route path="/login" element={<AdminLogin />} />
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/join/:token" element={<JoinOnboarding />} />
            <Route path="/super-admin" element={
              <RoleRoute allowedRole="SUPER_ADMIN">
                <SuperAdminDashboard />
              </RoleRoute>
            } />

            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/batches" element={<PrivateRoute><BatchList /></PrivateRoute>} />
            <Route path="/batches/:id" element={<PrivateRoute><BatchDetails /></PrivateRoute>} />
            <Route path="/tests" element={<PrivateRoute><TestList /></PrivateRoute>} />
            <Route path="/quizzes" element={<PrivateRoute><QuizList /></PrivateRoute>} />
            <Route path="/tests/:id" element={<PrivateRoute><TestDetails /></PrivateRoute>} />
            <Route path="/scan" element={<PrivateRoute><ScanMarks /></PrivateRoute>} />
            <Route path="/students/:id" element={<PrivateRoute><StudentProfile /></PrivateRoute>} />
            <Route path="/fees" element={<PrivateRoute><Fees /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/marketplace-settings" element={<PrivateRoute><MarketplaceSettings /></PrivateRoute>} />
            <Route path="/billing" element={<PrivateRoute><Billing /></PrivateRoute>} />

            <Route path="/approvals" element={<PrivateRoute><Approvals /></PrivateRoute>} />

            <Route path="/register/:batchId" element={<Register />} />
            <Route path="/kiosk/register/:batchId" element={<Register mode="kiosk" />} />
            <Route path="/check-status/:batchId" element={<CheckStatus />} />
            <Route path="/pay/:slug" element={<StudentPaymentPortal />} />

            {/* Marketplace Routes */}
            <Route path="/coaching" element={<MarketplaceHome />} />
            <Route path="/coaching/:slug" element={<CoachingProfile />} />
            <Route path="/list-coaching" element={<TeacherRegistration />} />

            <Route path="/:instituteSlug/student" element={<StudentPortalLogin />} />
            <Route path="/:instituteSlug/student/dashboard" element={<StudentPortalDashboard />} />
            <Route path="/:instituteSlug/student/quiz/:quizId" element={<TakeQuiz />} />

            {/* Legal / Info Pages */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/about" element={<AboutUs />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ChunkErrorBoundary>
  )
}

export default App
