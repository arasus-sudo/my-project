import "./App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import { OutOfCreditsWatcher } from "./components/Credits";

// Every page is its own chunk — previously all ~60 pages (including the
// Create EQ canvas editor and every chart-heavy Analytics page) shipped in
// one bundle, so a visitor landing on the public site downloaded the whole
// authenticated app before anything painted. Route-level lazy() splits each
// page into its own request, fetched only when actually navigated to.
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const SuiteHome = lazy(() => import("./pages/SuiteHome"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilder"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const Mailboxes = lazy(() => import("./pages/Mailboxes"));
const Inbox = lazy(() => import("./pages/Inbox"));
const UnifiedInbox = lazy(() => import("./pages/UnifiedInbox"));
const CRM = lazy(() => import("./pages/CRM"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const LeadLists = lazy(() => import("./pages/LeadLists"));
const LeadSearch = lazy(() => import("./pages/LeadSearch"));
const Admin = lazy(() => import("./pages/Admin"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const CreateEQEditor = lazy(() => import("./pages/CreateEQEditor"));
const CreateEQProjects = lazy(() => import("./pages/CreateEQProjects"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Team = lazy(() => import("./pages/Team"));
const Templates = lazy(() => import("./pages/Templates"));
const Settings = lazy(() => import("./pages/Settings"));
const Billing = lazy(() => import("./pages/Billing"));
const Webhooks = lazy(() => import("./pages/Webhooks"));
const HubSpotSettings = lazy(() => import("./pages/HubSpotSettings"));
const CompanyIntel = lazy(() => import("./pages/CompanyIntel"));

const ServiceLibrary = lazy(() => import("./pages/ServiceLibrary"));
const CampaignWizard = lazy(() => import("./pages/CampaignWizard"));
const VoiceEQOverview = lazy(() => import("./pages/VoiceEQOverview"));
const VoiceAgents = lazy(() => import("./pages/VoiceAgents"));
const VoiceAgentBuilder = lazy(() => import("./pages/VoiceAgentBuilder"));
const VoiceCampaigns = lazy(() => import("./pages/VoiceCampaigns"));
const VoiceCampaignBuilder = lazy(() => import("./pages/VoiceCampaignBuilder"));
const CallLogs = lazy(() => import("./pages/CallLogs"));
const VoiceLiveDashboard = lazy(() => import("./pages/VoiceLiveDashboard"));
const VoiceSettings = lazy(() => import("./pages/VoiceSettings"));
const ScheduleEQOverview = lazy(() => import("./pages/ScheduleEQOverview"));
const EventTypes = lazy(() => import("./pages/EventTypes"));
const EventTypeBuilder = lazy(() => import("./pages/EventTypeBuilder"));
const Bookings = lazy(() => import("./pages/Bookings"));
const ScheduleSettings = lazy(() => import("./pages/ScheduleSettings"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const ManageBooking = lazy(() => import("./pages/ManageBooking"));
const Proposals = lazy(() => import("./pages/Proposals"));
const ProposalBuilder = lazy(() => import("./pages/ProposalBuilder"));
const PricingCatalog = lazy(() => import("./pages/PricingCatalog"));
const SocialEQOverview = lazy(() => import("./pages/SocialEQOverview"));
const PostComposer = lazy(() => import("./pages/PostComposer"));
const PostQueue = lazy(() => import("./pages/PostQueue"));
const SocialSettings = lazy(() => import("./pages/SocialSettings"));
const SocialCalendar = lazy(() => import("./pages/SocialCalendar"));
const BulkImportDrawer = lazy(() => import("./pages/BulkImportDrawer"));
const SocialAnalytics = lazy(() => import("./pages/SocialAnalytics"));
const SocialInbox = lazy(() => import("./pages/SocialInbox"));
const SiteEQOverview = lazy(() => import("./pages/SiteEQOverview"));
const SiteList = lazy(() => import("./pages/SiteList"));
const SiteInbox = lazy(() => import("./pages/SiteInbox"));
const SiteAnalytics = lazy(() => import("./pages/SiteAnalytics"));
const SmsEQOverview = lazy(() => import("./pages/SmsEQOverview"));
const SmsTemplates = lazy(() => import("./pages/SmsTemplates"));
const SmsInbox = lazy(() => import("./pages/SmsInbox"));
const SmsBroadcasts = lazy(() => import("./pages/SmsBroadcasts"));
const SmsContacts = lazy(() => import("./pages/SmsContacts"));
const SmsSettings = lazy(() => import("./pages/SmsSettings"));
const WhatsAppEQOverview = lazy(() => import("./pages/WhatsAppEQOverview"));
const WhatsAppTemplates = lazy(() => import("./pages/WhatsAppTemplates"));
const WhatsAppInbox = lazy(() => import("./pages/WhatsAppInbox"));
const WhatsAppBroadcasts = lazy(() => import("./pages/WhatsAppBroadcasts"));
const WhatsAppContacts = lazy(() => import("./pages/WhatsAppContacts"));
const WhatsAppSettings = lazy(() => import("./pages/WhatsAppSettings"));
const HrmseqOverview = lazy(() => import("./pages/HrmseqOverview"));
const HrmseqEmployees = lazy(() => import("./pages/HrmseqEmployees"));
const HrmseqOrgChart = lazy(() => import("./pages/HrmseqOrgChart"));
const HrmseqRecruitment = lazy(() => import("./pages/HrmseqRecruitment"));
const HrmseqOnboarding = lazy(() => import("./pages/HrmseqOnboarding"));
const HrmseqLeave = lazy(() => import("./pages/HrmseqLeave"));
const HrmseqReviews = lazy(() => import("./pages/HrmseqReviews"));
const AccountingOverview = lazy(() => import("./pages/AccountingOverview"));
const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const JournalEntries = lazy(() => import("./pages/JournalEntries"));
const AccountingCustomers = lazy(() => import("./pages/AccountingCustomers"));
const AccountingInvoices = lazy(() => import("./pages/AccountingInvoices"));
const AccountingBills = lazy(() => import("./pages/AccountingBills"));
const AccountingReports = lazy(() => import("./pages/AccountingReports"));

export function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bone">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );
}

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="light" />
          <OutOfCreditsWatcher />
          <Suspense fallback={<RouteLoader />}>
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
              {/* CRM routes */}
              <Route path="crm" element={<CRM />} />
              <Route path="crm/leads" element={<Leads />} />
              <Route path="crm/leads/:id" element={<LeadDetail />} />
              <Route path="crm/search" element={<LeadSearch />} />
              <Route path="crm/lists" element={<LeadLists />} />
              <Route path="crm/pipeline" element={<Pipeline />} />
              {/* Legacy leads routes redirect to CRM */}
              <Route path="leads" element={<Navigate to="/app/crm/leads" replace />} />
              <Route path="leads/:id" element={<Navigate to="/app/crm/leads/:id" replace />} />
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
              <Route path="social-eq/calendar" element={<SocialCalendar />} />
              <Route path="social-eq/import" element={<BulkImportDrawer />} />
              <Route path="social-eq/analytics" element={<SocialAnalytics />} />
              <Route path="social-eq/inbox" element={<SocialInbox />} />
              <Route path="site-eq" element={<SiteEQOverview />} />
              <Route path="site-eq/sites" element={<SiteList />} />
              <Route path="site-eq/inbox" element={<SiteInbox />} />
              <Route path="site-eq/analytics" element={<SiteAnalytics />} />
              <Route path="sms-eq" element={<SmsEQOverview />} />
              <Route path="sms-eq/templates" element={<SmsTemplates />} />
              <Route path="sms-eq/inbox" element={<SmsInbox />} />
              <Route path="sms-eq/broadcasts" element={<SmsBroadcasts />} />
              <Route path="sms-eq/contacts" element={<SmsContacts />} />
              <Route path="sms-eq/settings" element={<SmsSettings />} />
              <Route path="whatsapp-eq" element={<WhatsAppEQOverview />} />
              <Route path="whatsapp-eq/templates" element={<WhatsAppTemplates />} />
              <Route path="whatsapp-eq/inbox" element={<WhatsAppInbox />} />
              <Route path="whatsapp-eq/broadcasts" element={<WhatsAppBroadcasts />} />
              <Route path="whatsapp-eq/contacts" element={<WhatsAppContacts />} />
              <Route path="whatsapp-eq/settings" element={<WhatsAppSettings />} />
              <Route path="hrms-eq" element={<HrmseqOverview />} />
              <Route path="hrms-eq/employees" element={<HrmseqEmployees />} />
              <Route path="hrms-eq/org-chart" element={<HrmseqOrgChart />} />
              <Route path="hrms-eq/recruitment" element={<HrmseqRecruitment />} />
              <Route path="hrms-eq/onboarding" element={<HrmseqOnboarding />} />
              <Route path="hrms-eq/leave" element={<HrmseqLeave />} />
              <Route path="hrms-eq/reviews" element={<HrmseqReviews />} />
              <Route path="accounting-eq" element={<AccountingOverview />} />
              <Route path="accounting-eq/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="accounting-eq/journal-entries" element={<JournalEntries />} />
              <Route path="accounting-eq/customers" element={<AccountingCustomers />} />
              <Route path="accounting-eq/invoices" element={<AccountingInvoices />} />
              <Route path="accounting-eq/bills" element={<AccountingBills />} />
              <Route path="accounting-eq/reports" element={<AccountingReports />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="hubspot" element={<HubSpotSettings />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="unified-inbox" element={<UnifiedInbox />} />
              <Route path="intelligence" element={<CompanyIntel />} />
              <Route path="services" element={<ServiceLibrary />} />
              <Route path="campaigns/wizard" element={<CampaignWizard />} />
              <Route path="campaigns/pro/:id" element={<CampaignWizard />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </ErrorBoundary>
    </div>
  );
}

export default App;
