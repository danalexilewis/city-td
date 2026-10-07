/** Own-site status values from `own_site_status`. */
export type OwnSiteStatus = 'pending' | 'live' | 'rejected';

/** Team review decision for `review_site`. */
export type ReviewDecision = 'approve' | 'reject';

/** One plot cell as expected by `propose_site` `p_plot_cells`. */
export type PlotCellPayload = {
  cell_r12: string;
  cell_r7: string;
  lng: number;
  lat: number;
};

/** Pending own-site row for the team review queue. */
export type PendingOwnSite = {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  status: OwnSiteStatus;
  cell_r12: string;
  cell_r7: string;
  proposer_id: string;
  created_at: string;
};

/** Row returned by `propose_site` / `review_site`. */
export type OwnSiteRow = {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  status: OwnSiteStatus;
  cell_r12: string;
  cell_r7: string;
  proposer_id: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
