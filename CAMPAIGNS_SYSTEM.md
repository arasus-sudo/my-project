# Pitch EQ Campaigns System — Complete Architecture

## Overview

The Campaigns system is the core outbound sales engine of Pitch EQ. It supports **5 creation modes**, **7 messaging channels**, and a full **generate → preview → approve → launch** pipeline.

**Design inspiration**: Lemlist, Instantly.ai, Smartlead, Clay

---

## Frontend Architecture (15 files)

### Page Components

| File | Route | Purpose |
|------|-------|---------|
| `CampaignLanding.jsx` | `/app/campaigns` | Main landing page — 5 creation mode cards + campaign table |
| `CampaignDetail.jsx` | `/app/campaigns/:id` | 3-tab campaign editor (Sequence, Leads, Launch) |
| `PlainCampaignBuilder.jsx` | `/app/campaigns/create/plain/:id?` | Step-by-step multi-channel campaign builder |
| `MarketingCampaignBuilder.jsx` | `/app/campaigns/create/marketing` | HTML email builder with templates + AI |
| `AITemplateWorkflow.jsx` | `/app/campaigns/create/ai-template` | 5-step wizard: Objective → Category → Template → Context → Generate |
| `FullAICampaign.jsx` | `/app/campaigns/create/ai` | Natural language → full AI campaign generation |
| `TemplateCategories.jsx` | `/app/campaigns/create/template` | 4 top-level campaign categories |
| `TemplateLibrary.jsx` | `/app/campaigns/create/template/:category` | Browse templates within a category |
| `TemplateDetail.jsx` | `/app/campaigns/create/template/:category/:templateId` | Single template preview + "Use This Template" |

### Shared Components

| File | Purpose | Used By |
|------|---------|---------|
| `CampaignReview.jsx` | Generate → preview → approve → launch pipeline | All 5 creation modes |
| `AudiencePicker.jsx` | Lead selection: lists, search, tags, select N | CampaignDetail, PlainCampaignBuilder, MarketingCampaignBuilder |
| `SignaturePicker.jsx` | Email signature selection/creation | CampaignDetail, PlainCampaignBuilder, MarketingCampaignBuilder |
| `VariablePicker.jsx` | Merge variable insertion dropdown | PlainCampaignBuilder, MarketingCampaignBuilder |
| `RecipientPreview.jsx` | Live variable resolution preview | TemplateDetail |
| `templateData.js` | Template definitions (categories, variables, structures) | All template-related components |

---

## 5 Creation Modes

### 1. Plain (from scratch)
**Route**: `/app/campaigns/create/plain`
**Flow**: Write emails → Pick audience → Pick signature → Save & Generate → Review → Launch
**Best for**: Users who know exactly what they want to write

### 2. Template (proven structures)
**Route**: `/app/campaigns/create/template` → `/:category` → `/:templateId`
**Flow**: Browse categories → Pick template → Preview → "Use This Template" → Edit in PlainCampaignBuilder → Add leads → Generate → Review → Launch
**Best for**: Users who want a proven structure to customize

### 3. AI + Template (structure + AI content)
**Route**: `/app/campaigns/create/ai-template`
**Flow**: Pick objective → Pick category → Pick template → Enter context (product, audience, pain point) → AI generates content inside template structure
**Best for**: Users who want AI to write but want structural guidance

### 4. Full AI (describe it)
**Route**: `/app/campaigns/create/ai`
**Flow**: Describe campaign in natural language → AI extracts strategy → Generates full campaign → Review → Add leads → Launch
**Best for**: Users who want a fully automated experience

### 5. Marketing (HTML emails)
**Route**: `/app/campaigns/create/marketing`
**Flow**: Pick HTML template OR use AI → Edit HTML → Live preview (desktop/mobile/dark) → Pick audience → Save & Generate → Review → Launch
**Best for**: Marketing newsletters, announcements, promotional emails

---

## 7 Messaging Channels

| Channel | Value | Editor | Notes |
|---------|-------|--------|-------|
| **Email** | `email` | Rich HTML editor (TipTap) + subject line | Primary channel |
| **Phone Call** | `phone_call` | Simple text message | Call script / notes |
| **SMS** | `sms` | Simple text message | 160 char guidance |
| **WhatsApp** | `whatsapp` | Simple text message | Via WhatsApp EQ integration |
| **LinkedIn Connect** | `linkedin_connect` | Simple text message | Connection request message |
| **LinkedIn Message** | `linkedin_message` | Simple text message | Direct message to connection |
| **LinkedIn Comment** | `linkedin_comment` | Simple text message | Comment on post |

---

## Merge Variables

Available in all channels via `{{variable_name}}` syntax:

| Variable | Description |
|----------|-------------|
| `{{first_name}}` | Lead's first name |
| `{{last_name}}` | Lead's last name |
| `{{company_name}}` / `{{company}}` | Company name |
| `{{job_title}}` / `{{title}}` | Job title |
| `{{industry}}` | Industry |
| `{{sender_name}}` | Your name |
| `{{sender_company}}` | Your company |
| `{{sender_role}}` | Your role |

---

## Campaign Review Pipeline

`CampaignReview.jsx` handles the full post-generation workflow:

1. **No leads** → Show "No audience selected" prompt
2. **Leads assigned, no emails** → Auto-trigger `run-engine` or show "Generate Emails" button
3. **Generating** → Progress bar with done/total count
4. **Review mode** → Split view: lead list (left) + email preview (right)
   - Navigate leads with prev/next
   - **Approve** → marks as approved for sending
   - **Reject** → marks as rejected, won't be sent
   - **Test** → sends test email to logged-in user
   - **Delete** → removes personalized email
   - **Approve All** → bulk approve
   - **Regenerate All** → regenerate all emails
5. **Launch bar** (bottom) → Shows approved/rejected/pending counts + Launch/Pause button

---

## Backend API Endpoints

### Campaign CRUD
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/{cid}` | Get campaign details |
| PUT | `/api/campaigns/{cid}` | Update campaign |
| DELETE | `/api/campaigns/{cid}` | Delete campaign |

### Email Generation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/{cid}/run-engine` | Start email generation (sync for template, async for AI) |
| GET | `/api/campaigns/{cid}/generation-status` | Poll generation progress |
| POST | `/api/campaigns/{cid}/leads/generate-all` | Generate for all leads |
| POST | `/api/campaigns/{cid}/leads/{lid}/generate-email` | Generate for single lead |
| POST | `/api/campaigns/{cid}/leads/{lid}/regenerate-opener` | Regenerate AI opener |
| POST | `/api/campaigns/{cid}/leads/regenerate-all` | Regenerate all emails |

### Email Approval
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/{cid}/leads/{lid}/approve` | Approve single email |
| POST | `/api/campaigns/{cid}/leads/{lid}/reject` | Reject single email |
| POST | `/api/campaigns/{cid}/leads/approve-all` | Approve all emails |
| POST | `/api/campaigns/{cid}/leads/bulk-status` | Bulk status update |
| POST | `/api/campaigns/{cid}/leads/{lid}/update-opener` | Edit AI opener |

### Campaign Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns/{cid}/leads` | Get campaign leads with personalized emails |
| POST | `/api/campaigns/{cid}/leads/batch` | Add/remove leads in batch |
| DELETE | `/api/campaigns/{cid}/leads/{lid}/email` | Delete single personalized email |
| DELETE | `/api/campaigns/{cid}/leads/email` | Delete all personalized emails |

### Launch & Queue
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/{cid}/launch` | Launch campaign |
| POST | `/api/campaigns/{cid}/pause` | Pause campaign |
| POST | `/api/campaigns/{cid}/complete` | Mark as completed |
| POST | `/api/campaigns/{cid}/archive` | Archive campaign |
| POST | `/api/campaigns/{cid}/preflight` | Pre-launch health checks |
| GET | `/api/campaigns/{cid}/queue` | View send queue |
| POST | `/api/campaigns/{cid}/advance-batch` | Advance to next batch |
| GET | `/api/campaigns/{cid}/batch-status` | Check batch status |

### Testing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/{cid}/leads/{lid}/send-test` | Send test email |

### Campaign Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaign-engine/generate` | AI campaign generation |

### Signatures
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/signatures` | List signatures |
| POST | `/api/signatures` | Create signature |
| DELETE | `/api/signatures/{sid}` | Delete signature |

### Campaign Templates & Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaign-templates` | List saved templates |
| POST | `/api/campaign-templates` | Save campaign as template |
| GET | `/api/campaign-folders` | List folders |
| POST | `/api/campaign-folders` | Create folder |
| DELETE | `/api/campaign-folders/{fid}` | Delete folder |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/{cid}/optimize` | AI campaign optimization |
| GET | `/api/campaigns/{cid}/contact-states` | Contact engagement states |
| GET | `/api/campaigns/{cid}/funnel` | Funnel analytics |

---

## Data Flow

```
Create Campaign (POST /campaigns)
  ↓
Add Leads (POST /campaigns/{cid}/leads/batch)
  ↓
Run Engine (POST /campaigns/{cid}/run-engine)
  ├── Template path: personalizes merge variables per lead (instant)
  └── AI path: background job generates personalized content (async)
  ↓
Poll Status (GET /campaigns/{cid}/generation-status)
  ↓
Review & Approve (POST /campaigns/{cid}/leads/{lid}/approve)
  ↓
Launch (POST /campaigns/{cid}/launch)
  → enqueue_campaign() in sender.py
  → Sends via configured mailbox
```

---

## Known Issues & Fixes Applied

### Fixed
1. ✅ **AudiencePicker prop mismatch** — CampaignDetail passed `selected`/`onConfirm` instead of `selectedLeads`/`onSelect`
2. ✅ **Plain campaign type not recognized** — Backend `run-engine` didn't include "plain" in `is_template` check
3. ✅ **Email preview showed blank** — CampaignReview accessed `personalized.subject` but API returns `email_subject`
4. ✅ **No responsiveness** — CampaignDetail/PlainCampaignBuilder used fixed pixel widths with no mobile handling
5. ✅ **Channel options limited** — Only Email/SMS/WhatsApp; now includes Phone Call, LinkedIn Connect/Message/Comment
6. ✅ **Template "Use This Template" broken** — Navigated back instead of creating campaign
7. ✅ **CampaignReview bottom bar overlap** — Changed from `position: fixed` to flex child

### Remaining
1. ⚠️ CampaignReview still uses `position: fixed` bottom bar (needs flex-based layout)
2. ⚠️ CampaignReview sidebar (260px) not responsive on mobile
3. ⚠️ AITemplateWorkflow and FullAICampaign not responsive on mobile
4. ⚠️ MarketingCampaignBuilder doesn't have multi-channel (HTML only)
5. ⚠️ No campaign editing for existing AI-generated campaigns
6. ⚠️ No A/B testing support per step

---

## File Dependencies

```
App.js
  └── AppLayout.jsx (sidebar + Outlet)
       ├── CampaignLanding.jsx (/campaigns)
       │    └── RowAction, StatusPill, Select, Button
       ├── CampaignDetail.jsx (/campaigns/:id)
       │    ├── AudiencePicker.jsx
       │    ├── SignaturePicker.jsx
       │    ├── CampaignReview.jsx
       │    └── RichEmailEditor.jsx
       ├── PlainCampaignBuilder.jsx (/campaigns/create/plain/:id?)
       │    ├── CampaignReview.jsx
       │    ├── AudiencePicker.jsx
       │    ├── SignaturePicker.jsx
       │    └── VariablePicker.jsx
       ├── MarketingCampaignBuilder.jsx (/campaigns/create/marketing)
       │    ├── CampaignReview.jsx
       │    ├── AudiencePicker.jsx
       │    └── SignaturePicker.jsx
       ├── AITemplateWorkflow.jsx (/campaigns/create/ai-template)
       │    ├── CampaignReview.jsx
       │    └── templateData.js (CATEGORIES, TEMPLATES)
       ├── FullAICampaign.jsx (/campaigns/create/ai)
       │    └── CampaignReview.jsx
       ├── TemplateCategories.jsx (/campaigns/create/template)
       │    └── templateData.js (CATEGORIES)
       ├── TemplateLibrary.jsx (/campaigns/create/template/:category)
       │    └── templateData.js (TEMPLATES)
       └── TemplateDetail.jsx (/campaigns/create/template/:category/:templateId)
            ├── RecipientPreview.jsx
            └── templateData.js (CATEGORIES, TEMPLATES, VARIABLE_CATEGORIES)
```

---

## Style Conventions

- All inline styles (no CSS modules or Tailwind for campaign pages)
- Uses CSS custom properties from design system (`--bg-surface`, `--text-primary`, etc.)
- Responsive via `<style>` tags with `@media` queries and class names
- Icons from `lucide-react`
- Toast notifications via `sonner`
- API calls via shared `api` axios instance from `../../lib/api`
