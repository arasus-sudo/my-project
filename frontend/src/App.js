import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import CampaignBuilder from "./pages/CampaignBuilder";
import Leads from "./pages/Leads";
import Mailboxes from "./pages/Mailboxes";
import Inbox from "./pages/Inbox";
import CRM from "./pages/CRM";
import Onboarding from "./pages/Onboarding";
import Settings from "./pages/Settings";

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-neutral-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="light" />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/onboarding" element={<Private><Onboarding /></Private>} />
            <Route path="/app" element={<Private><AppLayout /></Private>}>
              <Route index element={<Dashboard />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/new" element={<CampaignBuilder />} />
              <Route path="campaigns/:id" element={<CampaignBuilder />} />
              <Route path="leads" element={<Leads />} />
              <Route path="mailboxes" element={<Mailboxes />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="crm" element={<CRM />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
