/* Curated Lucide re-exports — docs/design-system.md §3.3.
 *
 * RULE (§25): this is a CLOSED list. Adding an icon here requires adding a row
 * to §3.3 of the design system first. The point is that a glyph means one
 * thing everywhere: `mail` is always email, `trash-2` is always delete, and
 * nobody picks a synonym on a whim two screens later.
 *
 * Import from here, never from "lucide-react" directly:
 *     import { Mail, TrendingUp } from "@/icons";
 *
 * Named for §3.3's semantic role where the Lucide name is ambiguous, so the
 * call site reads as intent rather than as geometry (Overflow, not
 * MoreHorizontal). Both names are exported where the raw one is already
 * idiomatic.
 *
 * §3.1: outline only, 1.5px stroke at 16-20px, always set an explicit size,
 * never hardcode a colour — icons inherit currentColor.
 *
 * The file is .js, not the .ts §25 specifies: this frontend is JavaScript
 * (CRA + JSX), so a .ts entry point would not resolve.
 */

export {
  // ---- Navigation ----
  LayoutDashboard,   // Dashboard
  Users,             // Leads / Contacts
  Kanban,            // Pipeline
  ListChecks,        // Tasks
  BarChart3,         // Analytics
  UsersRound,        // Team
  Plug,              // Integrations
  Settings,          // Settings
  LifeBuoy,          // Help & Support
  Bell,              // Notifications

  // ---- Actions ----
  Plus,              // Add / Create
  Pencil,            // Edit
  Trash2,            // Delete
  Copy,              // Duplicate
  Download,          // Export
  Upload,            // Import
  Share2,            // Share
  Play,              // Run
  Pause,             // Pause a running campaign/process
  RotateCcw,         // Reset
  RefreshCw,         // Sync
  Check,             // Confirm
  X,                 // Dismiss
  Archive,           // Archive
  MoreHorizontal,    // Row overflow
  MoreVertical,      // Card overflow
  ExternalLink,      // Opens a new context
  ChevronRight,      // Drill-in
  ChevronDown,       // Disclosure (§7.3 select trigger)
  ArrowRight,        // Forward / link-out in copy
  ArrowLeft,         // Back navigation

  // ---- Filtering & search ----
  Search,
  Filter,
  ArrowUpDown,       // Sortable column (§11)
  ArrowUp,           // Active ascending sort
  ArrowDown,         // Active descending sort
  Calendar,          // Date range
  SlidersHorizontal, // Advanced / columns
  LayoutGrid,        // Grid view
  List,              // List view
  SearchX,           // Filtered-to-zero empty state (§4.4)

  // ---- Communication ----
  Mail,
  Phone,
  PhoneCall,         // Active / answered call
  PhoneOutgoing,     // Outbound call placed
  MessageSquare,     // Message / notes
  CalendarClock,     // Schedule
  Send,
  FileText,          // Document / proposal
  StickyNote,        // Note
  Paperclip,         // Attachment

  // ---- Records & entities ----
  Building2,         // Company
  User,              // Person
  MapPin,            // Location
  Globe,             // Website
  Link,              // URL
  Linkedin,          // LinkedIn profile/company link
  Tag,               // Segment
  IdCard,            // Profile
  Briefcase,         // Deal

  // ---- Metrics & analytics ----
  DollarSign,        // Value / revenue
  Percent,           // Rate
  Target,            // Goal / quota
  TrendingUp,        // Positive trend — see the §3.3 direction/colour rule
  TrendingDown,      // Negative trend
  Activity,          // Activity volume
  PieChart,          // Distribution
  Gauge,             // Health / score
  LineChart,         // Trend

  // ---- Intelligence (violet surfaces only, §4.5) ----
  Sparkles,          // Assisted default
  Brain,             // Insight / model
  Wand2,             // Generate
  Lightbulb,         // Recommendation
  Crosshair,         // Scoring
  Zap,               // Automation
  Bot,               // AI agent / persona entity

  // ---- Status & feedback ----
  CheckCircle2,      // Success
  AlertTriangle,     // Warning
  AlertCircle,       // Error
  Info,              // Info
  CircleDashed,      // Pending
  Loader2,           // Loading (spin)
  ShieldCheck,       // Secure
  Lock,              // Auth
  Eye,               // Visible
  EyeOff,            // Hidden

  // ---- Time ----
  Clock,             // Time / recency
  History,           // Activity log
  CalendarDays,      // Date
  Timer,             // Duration / SLA

  // ---- Tinted-square tone examples (§3.2) ----
  Database,          // Primary tone: data
  Table,             // Primary tone: records
  Folder,            // Neutral tone: files
  Flame,             // Risk tone: urgency

  // ---- Board (§13) ----
  GripVertical,      // Drag handle, hover-only
} from "lucide-react";

// Aliases that name the ROLE rather than the shape, so call sites read as
// intent. §3.3 assigns each of these exactly one meaning.
export {
  MoreHorizontal as RowOverflow,
  MoreVertical as CardOverflow,
  Loader2 as Spinner,
  CheckCircle2 as SuccessIcon,
  AlertTriangle as WarningIcon,
  AlertCircle as ErrorIcon,
  CircleDashed as PendingIcon,
  Sparkles as IntelIcon,
} from "lucide-react";

/** Default stroke widths by rendered size (§3.1). Icons are always given an
 * explicit width AND height — never scaled with a transform, which would
 * thicken or thin the stroke off-spec. */
export const ICON_STROKE = {
  14: 1.5,
  16: 1.5,
  18: 1.5,
  20: 1.5,
  24: 1.75,
  32: 2,
  40: 2,
};

/** strokeWidth for a given rendered size, falling back to the nearest rule. */
export function strokeFor(size) {
  if (size >= 32) return 2;
  if (size >= 24) return 1.75;
  return 1.5;
}
