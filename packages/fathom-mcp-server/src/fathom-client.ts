import axios, { AxiosInstance } from "axios";

// Based on Fathom API documentation at https://developers.fathom.ai/api-overview

export interface FathomMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  share_url?: string;
  created_at: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  action_items?: FathomActionItem[];
  summary?: string;
  transcript?: string;
}

export interface FathomActionItem {
  id: string;
  description: string;
  assignee?: string;
  completed: boolean;
}

export interface FathomSummary {
  summary: string;
  action_items?: FathomActionItem[];
}

export interface FathomTranscript {
  transcript: string;
}

export interface FathomUser {
  id: string;
  email: string;
  name: string;
}

export interface FathomTeam {
  id: string;
  name: string;
}

export interface FathomTeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ListMeetingsParams {
  calendar_invitees_domains?: string[];
  calendar_invitees_domains_type?:
    | "all"
    | "only_internal"
    | "one_or_more_external";
  created_after?: string;
  created_before?: string;
  cursor?: string;
  include_action_items?: boolean;
  include_crm_matches?: boolean;
  include_summary?: boolean;
  include_transcript?: boolean;
  limit?: number;
}

export class FathomClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: "https://api.fathom.ai/external/v1",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    });
  }

  // Meeting Methods
  async listMeetings(params?: ListMeetingsParams) {
    const response = await this.client.get("/meetings", { params });
    return response.data;
  }

  async getMeeting(meetingId: string) {
    const response = await this.client.get(`/meetings/${meetingId}`);
    return response.data;
  }

  // Recording Methods
  async getSummary(recordingId: string): Promise<FathomSummary> {
    const response = await this.client.get(
      `/recordings/${recordingId}/summary`
    );
    return response.data;
  }

  async getTranscript(recordingId: string): Promise<FathomTranscript> {
    const response = await this.client.get(
      `/recordings/${recordingId}/transcript`
    );
    return response.data;
  }

  // Teams Methods
  async getTeams(params?: { cursor?: string }): Promise<FathomTeam[]> {
    const response = await this.client.get("/teams", { params });
    return response.data;
  }

  async getTeamMembers(params?: {
    cursor?: string;
    team?: string;
  }): Promise<FathomTeamMember[]> {
    const response = await this.client.get("/team_members", { params });
    return response.data;
  }
}
