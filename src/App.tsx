import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { KeyboardInsetTracker } from "@/hooks/use-keyboard-inset";

// Eagerly load the landing page for fast FCP/LCP
import Index from "./pages/Index";

// Lazy-load all other routes
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Convert = lazy(() => import("./pages/Convert"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const History = lazy(() => import("./pages/History"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const Signup = lazy(() => import("./pages/Signup"));
const ClaimShare = lazy(() => import("./pages/ClaimShare"));
const SharedPdfDownload = lazy(() => import("./pages/SharedPdfDownload"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Admin = lazy(() => import("./pages/Admin"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <KeyboardInsetTracker />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationsProvider>
          <Navbar />
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            <Route path="/convert" element={<Convert />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            
            <Route path="/history" element={<History />} />
            <Route path="/job/:id" element={<JobDetail />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/claim/:token" element={<ClaimShare />} />
            <Route path="/shared-pdf/:token" element={<SharedPdfDownload />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <Footer />
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
