export interface FathomMeeting {
  title: string;
  meeting_title: string;
  recording_id: number;
  url: string;
  share_url?: string;
  created_at: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type: string;
  transcript_language: string;
  calendar_invitees: FathomCalendarInvitee[];
  recorded_by: FathomUser;
  transcript?: FathomTranscriptSegment[];
  default_summary?: {
    template_name: string;
    markdown_formatted: string;
  };
  action_items?: FathomActionItem[];
}

export interface FathomActionItem {
  description: string;
  user_generated: boolean;
  completed: boolean;
  record_timestamp: string;
  recording_playback_url?: string;
  assignee?: FathomTeamMember;
}

export interface FathomTeamMember {
  id?: string;
  team: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface ListMeetingsParams {
  calendar_invitees_domains?: string[];
  calendar_invitees_domains_type?: 'all' | 'only_internal' | 'one_or_more_external';
  created_after?: string;
  created_before?: string;
  cursor?: string;
  include_action_items?: boolean;
  include_crm_matches?: boolean;
  include_summary?: boolean;
  include_transcript?: boolean;
  limit?: number;
}

export interface FathomUser {
  name: string;
  email: string;
  email_domain?: string;
  team: string;
}

export interface FathomCalendarInvitee {
  name: string;
  email?: string;
  email_domain?: string;
  is_external?: boolean;
  matched_speaker_display_name?: string;
}

export interface FathomParticipant {
  id: string;
  name: string;
  email?: string;
  role: 'host' | 'participant';
}

export interface FathomTranscript {
  type?: string;
  recording_id: number;
  transcripts: {
    speaker: {
      display_name: string;
      matched_calendar_invitee_email?: string;
    };
    text: string;
    timestamp: string;
  }[];
}

export interface FathomTranscriptSegment {
  speaker: {
    display_name: string;
    matched_calendar_invitee_email?: string;
  };
  text: string;
  timestamp: string;
}

export interface FathomNote {
  id: string;
  meeting_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface FathomHighlight {
  id: string;
  meeting_id: string;
  text: string;
  timestamp: number;
  created_by: string;
  created_at: string;
}

export interface FathomSummary {
  type: string;
  recording_id: number;
  summary: string;
  template_name?: string;
  created_at: string;
}

export interface FathomTeam {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export type FathomRecord =
  | FathomMeeting
  | FathomTranscript
  | FathomSummary
  | FathomNote
  | FathomActionItem
  | FathomHighlight
  | FathomUser
  | FathomTeam
  | FathomTeamMember;

export interface FathomAdapterConfig {
  includeTranscripts?: boolean;
  includeSummaries?: boolean;
  includeNotes?: boolean;
  includeActionItems?: boolean;
  includeHighlights?: boolean;
  includeTeams?: boolean;
  includeTeamMembers?: boolean;
  since?: string; // ISO timestamp for incremental sync
}
