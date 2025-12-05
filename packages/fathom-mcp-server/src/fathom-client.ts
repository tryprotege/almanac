import axios, { AxiosInstance } from "axios";
import type {
  FathomSummary,
  FathomTranscript,
  FathomTeam,
  FathomTeamMember,
  ListMeetingsParams,
} from "@ebee-oss/shared-util";

// Based on Fathom API documentation at https://developers.fathom.ai/api-overview
// Types are imported from @ebee-oss/shared-util for consistency across packages

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
