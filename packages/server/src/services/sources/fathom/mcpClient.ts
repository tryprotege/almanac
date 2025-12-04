import { mcpClientManager } from "../../../mcp/client.js";
import {
  FathomMeeting,
  FathomTranscript,
  FathomSummary,
  FathomNote,
  FathomActionItem,
  FathomHighlight,
  FathomUser,
  FathomTeam,
  FathomTeamMember,
} from "./types.js";

/**
 * Fathom MCP Client wrapper for data extraction
 * Provides comprehensive Fathom integration including:
 * - Meeting Management
 * - Transcript Access
 * - Notes & Action Items
 * - Highlights & Summaries
 */
export class FathomMCPClient {
  private serverName = "fathom";
  private rateLimitDelay = 500; // 500ms = ~2 requests per second

  constructor() {}

  /**
   * Sleep utility for rate limiting
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call MCP tool with rate limiting and parse response
   */
  private async callTool<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    await this.sleep(this.rateLimitDelay);
    const response = await mcpClientManager.callTool(
      this.serverName,
      toolName,
      args
    );

    // MCP response format: { content: [{ type: 'text', text: '...' }] }
    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.find((c: any) => c.type === "text");
      if (response.isError) {
        console.warn(`MCP tool ${toolName} returned an error:`, textContent);
        throw new Error(
          "MCP tool error: " + (textContent?.text || "Unknown error")
        );
      } else if (textContent && textContent.text) {
        try {
          return JSON.parse(textContent.text) as T;
        } catch (error) {
          console.error("Failed to parse MCP response:", error);
          throw new Error(
            `Invalid JSON in MCP response: ${textContent.text.substring(
              0,
              100
            )}...`
          );
        }
      }
    }

    // Fallback: return response as-is if it doesn't match expected format
    return response as T;
  }

  /**
   * Generic pagination handler for cursor-based pagination
   */
  private async fetchAllPagesCursor<T>(
    toolName: string,
    params: Record<string, any>,
    extractResults: (response: any) => T[]
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | undefined = undefined;

    while (true) {
      const requestParams: Record<string, any> = { ...params };
      if (cursor) {
        requestParams.cursor = cursor;
      }

      const response: any = await this.callTool(toolName, requestParams);

      const results = extractResults(response);
      if (Array.isArray(results) && results.length > 0) {
        allResults.push(...results);
      }

      // Check if there's a next cursor
      if (response.next_cursor) {
        cursor = response.next_cursor;
      } else {
        break;
      }

      // Safety check: if no results and no next cursor, break
      if (results.length === 0) break;
    }

    return allResults;
  }

  // ============================================
  // User Methods
  // ============================================

  /**
   * Get current authenticated user (not available in Fathom API)
   * This is a placeholder for compatibility
   */
  async getMe(): Promise<FathomUser> {
    // Fathom doesn't have a get_me endpoint, return a placeholder
    return {
      email: "user@example.com",
      name: "Current User",
      email_domain: "example.com",
      team: "default",
    };
  }

  // ============================================
  // Meeting Methods
  // ============================================

  /**
   * List all meetings
   */
  async listMeetings(
    params: {
      created_after?: string;
      created_before?: string;
      include_summary?: boolean;
      include_transcript?: boolean;
      include_action_items?: boolean;
    } = {}
  ): Promise<FathomMeeting[]> {
    return this.fetchAllPagesCursor<FathomMeeting>(
      "list_meetings",
      params,
      (response) => response.items || []
    );
  }

  /**
   * Get a specific meeting (not directly available, use list with filter)
   */
  async getMeeting(meetingId: string): Promise<FathomMeeting> {
    const meetings = await this.listMeetings();
    const meeting = meetings.find(
      (m) => m.recording_id.toString() === meetingId
    );
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    return meeting;
  }

  // ============================================
  // Transcript Methods
  // ============================================

  /**
   * Get transcript for a meeting
   */
  async getTranscript(recordingId: number): Promise<FathomTranscript> {
    const response = await this.callTool<any>("get_transcript", {
      recording_id: recordingId,
    });

    // Transform the response to match our FathomTranscript type
    return {
      recording_id: recordingId,
      transcripts: response.transcript,
      type: "transcript",
    };
  }

  /**
   * Get summary for a meeting
   */
  async getSummary(recordingId: number): Promise<FathomSummary> {
    const response = await this.callTool<any>("get_summary", {
      recording_id: recordingId,
    });

    return {
      type: "summary",
      recording_id: recordingId,
      summary: response.summary || response.text || "",
      template_name: response.template_name,
      created_at: response.created_at || new Date().toISOString(),
    };
  }

  // ============================================
  // Notes Methods
  // ============================================

  /**
   * List notes for a meeting (not directly available in current API)
   */
  async listNotes(_meetingId: string): Promise<FathomNote[]> {
    // Notes are typically included in meeting data
    return [];
  }

  /**
   * Get a specific note (not directly available in current API)
   */
  async getNote(_noteId: string): Promise<FathomNote> {
    throw new Error("getNote not implemented in Fathom API");
  }

  // ============================================
  // Action Items Methods
  // ============================================

  /**
   * List action items for a meeting (included in meeting data)
   */
  async listActionItems(_meetingId: string): Promise<FathomActionItem[]> {
    // Action items are typically included in meeting data when include_action_items is true
    return [];
  }

  // ============================================
  // Highlights Methods
  // ============================================

  /**
   * List highlights for a meeting (not directly available in current API)
   */
  async listHighlights(_meetingId: string): Promise<FathomHighlight[]> {
    // Highlights are typically included in meeting data
    return [];
  }

  // ============================================
  // Team Methods
  // ============================================

  /**
   * List all teams
   */
  async listTeams(): Promise<FathomTeam[]> {
    return this.fetchAllPagesCursor<FathomTeam>(
      "list_teams",
      {},
      (response) => response.items || []
    );
  }

  /**
   * List team members
   */
  async listTeamMembers(team?: string): Promise<FathomTeamMember[]> {
    const params: Record<string, any> = {};
    if (team) params.team = team;

    return this.fetchAllPagesCursor<FathomTeamMember>(
      "list_team_members",
      params,
      (response) => response.items || []
    );
  }

  /**
   * Set custom rate limit delay
   */
  setRateLimitDelay(delayMs: number): void {
    this.rateLimitDelay = delayMs;
  }
}
