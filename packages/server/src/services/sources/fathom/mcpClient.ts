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
} from "@ebee-oss/shared-util";
import logger from "../../../utils/logger.js";
import pThrottle from "p-throttle";
import sleep from "../../../utils/sleep.js";

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
  private readonly MAX_RETRIES = 10;
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 second
  private throttledCallTool: <T>(
    toolName: string,
    args: Record<string, any>
  ) => Promise<T>;

  constructor() {
    // Create throttled version of callTool: 60 requests per 60 seconds
    const throttle = pThrottle({
      limit: 55,
      interval: 60000, // 60 seconds in milliseconds
    });

    this.throttledCallTool = throttle(this.callToolInternal.bind(this));
  }

  /**
   * Internal method to call MCP tool with retry logic and parse response
   * This is wrapped by throttledCallTool to enforce rate limiting
   */
  private async callToolInternal<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    let lastError: Error | null = null;

    // Retry loop with exponential backoff for 429 errors
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await mcpClientManager.callTool(
          this.serverName,
          toolName,
          args
        );

        // MCP response format: { content: [{ type: 'text', text: '...' }] }
        if (response && response.content && Array.isArray(response.content)) {
          const textContent = response.content.find(
            (c: any) => c.type === "text"
          );

          if (response.isError) {
            const errorText = textContent?.text || "Unknown error";

            // Check if it's a 429 rate limit error
            if (errorText.includes("429")) {
              // Calculate exponential backoff delay with jitter
              const baseDelay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
              const jitter = Math.random() * 0.3 * baseDelay; // ±30% jitter
              const delay = Math.floor(baseDelay + jitter);

              logger.warn(
                `Rate limit (429) hit for ${toolName}, attempt ${attempt + 1}/${
                  this.MAX_RETRIES + 1
                }. ` + `Retrying after ${delay}ms...`
              );

              // If we haven't exhausted retries, wait and continue
              if (attempt < this.MAX_RETRIES) {
                await sleep(delay);
                continue; // Retry
              }

              // If we've exhausted retries, throw error
              throw new Error(
                `Rate limit exceeded after ${this.MAX_RETRIES} retries: ${errorText}`
              );
            }

            // For non-429 errors, throw immediately
            console.warn(
              `MCP tool ${toolName} returned an error:`,
              textContent
            );
            throw new Error("MCP tool error: " + errorText);
          } else if (textContent && textContent.text) {
            try {
              // First try to parse as-is
              return JSON.parse(textContent.text) as T;
            } catch (error) {
              // If parsing fails, try to extract JSON from mixed content
              // Handle cases where error messages are prefixed before JSON
              const text = textContent.text;

              // Try to find JSON object or array in the response
              const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
              if (jsonMatch) {
                try {
                  const extractedJson = JSON.parse(jsonMatch[1]);
                  console.warn(
                    `MCP tool ${toolName} returned mixed content, extracted JSON successfully. Prefix: ${text
                      .substring(0, jsonMatch.index)
                      .trim()}`
                  );
                  return extractedJson as T;
                } catch (innerError) {
                  logger.error(
                    { innerError },
                    "Failed to parse extracted JSON:"
                  );
                }
              }

              // If we still can't parse, throw a detailed error
              logger.error({ error }, "Failed to parse MCP response:");
              logger.error("Response text:", text.substring(0, 500));
              throw new Error(
                `Invalid JSON in MCP response: ${text.substring(0, 100)}...`
              );
            }
          }
        }

        // Fallback: return response as-is if it doesn't match expected format
        return response as T;
      } catch (error) {
        lastError = error as Error;

        // If it's a 429 error and we have retries left, continue
        if (lastError.message.includes("429") && attempt < this.MAX_RETRIES) {
          const baseDelay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * baseDelay; // ±30% jitter
          const delay = Math.floor(baseDelay + jitter);
          logger.warn(
            `Caught 429 error, attempt ${attempt + 1}/${
              this.MAX_RETRIES + 1
            }. ` + `Retrying after ${delay}ms...`
          );
          await sleep(delay);
          continue;
        }

        // Otherwise, throw the error
        throw lastError;
      }
    }

    // This shouldn't be reached, but TypeScript needs it
    throw lastError || new Error("Unexpected error in retry logic");
  }

  /**
   * Call MCP tool with rate limiting (60 requests per 60 seconds) and parse response
   */
  private async callTool<T>(
    toolName: string,
    args: Record<string, any>
  ): Promise<T> {
    return this.throttledCallTool<T>(toolName, args);
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

      // Validate response structure
      if (!response || typeof response !== "object") {
        console.warn(
          `MCP tool ${toolName} returned invalid response structure:`,
          response
        );
        break;
      }

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
      recording_id: recordingId.toString(),
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
      recording_id: recordingId.toString(),
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
   * @param teamId - Required team ID to fetch members for
   */
  async listTeamMembers(teamId: string): Promise<FathomTeamMember[]> {
    return this.fetchAllPagesCursor<FathomTeamMember>(
      "list_team_members",
      { team_id: teamId },
      (response) => response.items || []
    );
  }
}
