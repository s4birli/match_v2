// Hand-rolled DB types for the app. We deliberately don't auto-generate to keep
// the schema/RLS as the single source of truth (per .claude/CLAUDE-DB-FIRST.md).

export type Role = "owner" | "admin" | "assistant_admin" | "user" | "guest";
export type MembershipStatus = "active" | "inactive" | "archived" | "invited";
export type StatsVisibility = "included" | "excluded";
export type MatchStatus = "draft" | "open" | "teams_ready" | "completed" | "cancelled";
export type AttendanceStatus =
  | "invited"
  | "confirmed"
  | "declined"
  | "reserve"
  | "checked_in"
  | "played"
  | "no_show";
export type TeamKey = "red" | "blue";
export type PollStatus = "open" | "closed";
export type TransactionType = "payment" | "match_fee" | "adjustment" | "bonus" | "penalty";
export type Direction = "debit" | "credit";
export type NotificationType =
  | "match_starting_soon"
  | "pre_match_poll_open"
  | "post_match_rating_open"
  | "wallet_updated";
export type PositionCode = "goalkeeper" | "defender" | "midfield" | "forward";

export interface Account {
  id: string;
  auth_user_id: string;
  email: string;
  preferred_language: string;
  is_active: boolean;
  is_archived: boolean;
  is_system_owner: boolean;
}

export interface Person {
  id: string;
  primary_account_id: string | null;
  first_name: string;
  last_name: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  is_guest_profile: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currency_code: string;
  default_language: string;
  invite_code: string;
  invite_code_active: boolean;
  invite_link_active: boolean;
  default_match_fee: string;
  is_active: boolean;
}

export interface Membership {
  id: string;
  tenant_id: string;
  person_id: string;
  role: Role;
  status: MembershipStatus;
  stats_visibility: StatsVisibility;
  is_guest_membership: boolean;
  archived_at: string | null;
  archived_reason: string | null;
}

export interface Venue {
  id: string;
  tenant_id: string;
  name: string;
  address_line: string | null;
  is_active: boolean;
}

export interface Match {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  team_format_label: string;
  players_per_team: number;
  match_fee: string;
  currency_code: string;
  status: MatchStatus;
  score_entered_at: string | null;
}

export interface MatchTeam {
  id: string;
  match_id: string;
  tenant_id: string;
  team_key: TeamKey;
  display_name: string;
  sort_order: number;
}

export interface MatchParticipant {
  id: string;
  match_id: string;
  tenant_id: string;
  membership_id: string;
  team_id: string | null;
  attendance_status: AttendanceStatus;
  entered_as_reserve: boolean;
}

export interface MatchResult {
  id: string;
  match_id: string;
  tenant_id: string;
  red_team_id: string;
  blue_team_id: string;
  red_score: number;
  blue_score: number;
  winner_team_id: string | null;
  is_draw: boolean;
}

export interface LedgerTransaction {
  id: string;
  tenant_id: string;
  membership_id: string;
  match_id: string | null;
  transaction_type: TransactionType;
  direction: Direction;
  amount: string;
  currency_code: string;
  description: string | null;
  recorded_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  membership_id: string;
  notification_type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}
