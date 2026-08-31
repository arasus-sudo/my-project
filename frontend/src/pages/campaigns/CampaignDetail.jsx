/**
 * CampaignDetail — /campaigns/:id
 *
 * Simple detail page for existing campaigns:
 *  - Shows campaign info header
 *  - CampaignReview for generate/preview/approve/launch
 *  - Edit button to go back to the builder for that campaign type
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ArrowLeft, Edit2, Loader2 } from "lucide-react";
import CampaignReview from "./CampaignReview";

const BUILDER_MAP = {
  plain: "/app/campaigns/create/plain",
  template: "/app/campaigns/create/template",
  ai_template: "/app/campaigns/create/ai-template",
  ai: "/app/campaigns/create/ai",
  marketing: "/app/campaigns/create/marketing",
};

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get(`/campaigns/${id}`)
      .then((r) => { setCampaign(r.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Campaign not found</p>
        <button onClick={() => nav("/app/campaigns")} className="btn-secondary">Back to Campaigns</button>
      </div>
    );
  }

  const editRoute = BUILDER_MAP[campaign.campaign_type] || BUILDER_MAP.plain;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-surface)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("/app/campaigns")} style={{
            display: "flex", alignItems: "center", gap: 4, border: "none",
            background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13,
          }}>
            <ArrowLeft size={14} /> Campaigns
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{campaign.name}</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: "var(--radius-full)",
            background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)", textTransform: "capitalize",
          }}>
            {campaign.campaign_type?.replace("_", " ") || "plain"}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: "var(--radius-full)",
            background: campaign.status === "active" ? "var(--color-success-subtle)" : "var(--bg-surface-sunken)",
            color: campaign.status === "active" ? "var(--color-success-text)" : "var(--text-tertiary)",
            fontFamily: "var(--font-mono)", textTransform: "capitalize",
          }}>
            {campaign.status}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => nav(`${editRoute}`)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
            borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
            background: "var(--bg-surface)", color: "var(--text-secondary)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            <Edit2 size={12} /> Edit
          </button>
        </div>
      </div>

      {/* Review area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <CampaignReview campaignId={id} />
      </div>
    </div>
  );
}
