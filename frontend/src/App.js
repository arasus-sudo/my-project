import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SuiteHome from "./pages/SuiteHome";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import CampaignBuilder from "./pages/CampaignBuilder";
import Leads from "./pages/Leads";
import LeadDetail from "./pages/LeadDetail";
import Mailboxes from "./pages/Mailboxes";
import Inbox from "./pages/Inbox";
import CRM from "./pages/CRM";
import Admin from "./pages/Admin";
import Analytics from "./pages/Analytics";
import AuditLog from "./pages/AuditLog";
import CreateEQEditor from "./pages/CreateEQEditor";
import CreateEQProjects from "./pages/CreateEQProjects";
import Onboarding from "./pages/Onboarding";
import Team from "./pages/Team";
import Templates from "./pages/Templates";
import Settings from "./pages/Settings";
import Billing from "./pages/Billing";
import { OutOfCreditsWatcher } from "./components/Credits";
import Webhooks from "./pages/Webhooks";
import HubSpotSettings from "./pages/HubSpotSettings";
import VoiceEQOverview from "./pages/VoiceEQOverview";
import VoiceAgents from "./pages/VoiceAgents";
import VoiceAgentBuilder from "./pages/VoiceAgentBuilder";
import VoiceCampaigns from "./pages/VoiceCampaigns";
import VoiceCampaignBuilder from "./pages/VoiceCampaignBuilder";
import CallLogs from "./pages/CallLogs";
import VoiceLiveDashboard from "./pages/VoiceLiveDashboard";
import VoiceSettings from "./pages/VoiceSettings";
import ScheduleEQOverview from "./pages/ScheduleEQOverview";
import EventTypes from "./pages/EventTypes";
import EventTypeBuilder from "./pages/EventTypeBuilder";
import Bookings from "./pages/Bookings";
import ScheduleSettings from "./pages/ScheduleSettings";
import BookingPage from "./pages/BookingPage";
import ManageBooking from "./pages/ManageBooking";
import Proposals from "./pages/Proposals";
import ProposalBuilder from "./pages/ProposalBuilder";
import PricingCatalog from "./pages/PricingCatalog";
import SocialEQOverview from "./pages/SocialEQOverview";
import PostComposer from "./pages/PostComposer";
import PostQueue from "./pages/PostQueue";
import SocialSettings from "./pages/SocialSettings";

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
          <OutOfCreditsWatcher />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/onboarding" element={<Private><Onboarding /></Private>} />
            <Route path="/suite" element={<Private><SuiteHome /></Private>} />
            <Route path="/settings" element={<Private><Settings /></Private>} />
            <Route path="/billing" element={<Private><Billing /></Private>} />
            <Route path="/admin" element={<Private><Admin /></Private>} />
            {/* Public, token-only guest self-service — must sit before the slug route
                so "manage" isn't parsed as a workspaceId. */}
            <Route path="/book/manage/:token" element={<ManageBooking />} />
            <Route path="/book/:workspaceId/:eventTypeSlug" element={<BookingPage />} />
            <Route path="/app" element={<Private><AppLayout /></Private>}>
              <Route index element={<Dashboard />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/new" element={<CampaignBuilder />} />
              <Route path="campaigns/:id" element={<CampaignBuilder />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="mailboxes" element={<Mailboxes />} />
              <Route path="templates" element={<Templates />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="team" element={<Team />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="create-eq" element={<CreateEQProjects />} />
              <Route path="create-eq/:id" element={<CreateEQEditor />} />
              <Route path="voice-eq" element={<VoiceEQOverview />} />
              <Route path="voice-eq/agents" element={<VoiceAgents />} />
              <Route path="voice-eq/agents/:id" element={<VoiceAgentBuilder />} />
              <Route path="voice-eq/campaigns" element={<VoiceCampaigns />} />
              <Route path="voice-eq/campaigns/new" element={<VoiceCampaignBuilder />} />
              <Route path="voice-eq/campaigns/:id" element={<VoiceCampaignBuilder />} />
              <Route path="voice-eq/calls" element={<CallLogs />} />
              <Route path="voice-eq/live" element={<VoiceLiveDashboard />} />
              <Route path="voice-eq/settings" element={<VoiceSettings />} />
              <Route path="schedule-eq" element={<ScheduleEQOverview />} />
              <Route path="schedule-eq/event-types" element={<EventTypes />} />
              <Route path="schedule-eq/event-types/new" element={<EventTypeBuilder />} />
              <Route path="schedule-eq/event-types/:id" element={<EventTypeBuilder />} />
              <Route path="schedule-eq/bookings" element={<Bookings />} />
              <Route path="schedule-eq/settings" element={<ScheduleSettings />} />
              <Route path="proposal-eq" element={<Proposals />} />
              <Route path="proposal-eq/new" element={<ProposalBuilder />} />
              <Route path="proposal-eq/pricing" element={<PricingCatalog />} />
              <Route path="proposal-eq/:id" element={<ProposalBuilder />} />
              <Route path="social-eq" element={<SocialEQOverview />} />
              <Route path="social-eq/compose" element={<PostComposer />} />
              <Route path="social-eq/queue" element={<PostQueue />} />
              <Route path="social-eq/settings" element={<SocialSettings />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="hubspot" element={<HubSpotSettings />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="crm" element={<CRM />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
