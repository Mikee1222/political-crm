export type CampaignTypeRow = {
  id: string;
  name: string;
  description: string | null;
  retell_agent_id: string | null;
  /** Resolved from `retell_agents` when available (GET /api/campaign-types). */
  retell_agent_name?: string | null;
  color: string;
  created_at: string;
};
