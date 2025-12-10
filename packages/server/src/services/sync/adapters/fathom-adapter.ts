import { BaseRecordAdapter } from "./base-adapter.js";
import { Record } from "../../../models/record.model.js";
import { EntityRelationship, FetchOptions } from "../../../types/index.js";
import {
  FathomRecord,
  FathomMeeting,
  FathomTranscript,
  FathomSummary,
  FathomNote,
  FathomActionItem,
  FathomHighlight,
  FathomUser,
  FathomTeam,
  FathomTeamMember,
  FathomAdapterConfig,
} from "@ebee-oss/shared-util";
import { FathomMCPClient } from "../../sources/fathom/mcpClient.js";
import pLimit from "p-limit";

const MEETING_CONCURRENCY = 16; // Process 5 meetings concurrently for transcripts/summaries
const TEAM_CONCURRENCY = 3; // Process 3 teams concurrently for members

/**
 * Fathom adapter for syncing Fathom records
 * Supports: meetings, transcripts, notes, action items, highlights
 */
export class FathomAdapter extends BaseRecordAdapter<FathomRecord> {
  readonly source = "fathom" as const;
  readonly supportedRecordTypes = [
    "meeting",
    "transcript",
    "summary",
    "note",
    "action_item",
    "highlight",
    "user",
    "team",
    "team_member",
  ];

  constructor(
    private client: FathomMCPClient,
    private config: FathomAdapterConfig
  ) {
    super();
  }

  /**
   * Fetch all records from Fathom
   */
  async *fetchAll(options?: FetchOptions): AsyncIterable<FathomRecord[]> {
    const batchSize = options?.batchSize || 100;

    // Fetch teams
    let teams: FathomTeam[] = [];
    if (this.config.includeTeams) {
      try {
        teams = await this.client.listTeams();
        if (teams.length > 0) {
          for (let i = 0; i < teams.length; i += batchSize) {
            yield teams.slice(i, i + batchSize) as FathomRecord[];
          }
        }
      } catch (error) {
        console.warn("Failed to fetch Fathom teams:", error);
      }
    }

    // Fetch team members in parallel
    if (this.config.includeTeamMembers) {
      if (teams.length === 0 && !this.config.includeTeams) {
        try {
          teams = await this.client.listTeams();
        } catch (error) {
          console.warn("Failed to fetch Fathom teams for team members:", error);
        }
      }

      const limit = pLimit(TEAM_CONCURRENCY);
      const memberPromises = teams.map((team) =>
        limit(async () => {
          try {
            return await this.client.listTeamMembers(team.id);
          } catch (error) {
            console.warn(
              `Failed to fetch team members for team ${team.id}:`,
              error
            );
            return [];
          }
        })
      );

      const allMembers = await Promise.all(memberPromises);
      for (const teamMembers of allMembers) {
        if (teamMembers.length > 0) {
          for (let i = 0; i < teamMembers.length; i += batchSize) {
            yield teamMembers.slice(i, i + batchSize) as FathomRecord[];
          }
        }
      }
    }

    // Fetch meetings WITHOUT embedded data
    const meetings = await this.client.listMeetings({
      include_summary: false,
      include_transcript: false,
      include_action_items: false,
    });

    // Yield meetings in batches
    for (let i = 0; i < meetings.length; i += batchSize) {
      yield meetings.slice(i, i + batchSize) as FathomRecord[];
    }

    // Fetch transcripts and summaries in batches to avoid hanging on large datasets
    const limit = pLimit(MEETING_CONCURRENCY);
    const TRANSCRIPT_BATCH_SIZE = 50; // Process meetings in groups of 50

    if (this.config.includeTranscripts !== false) {
      // Process meetings in batches
      for (let i = 0; i < meetings.length; i += TRANSCRIPT_BATCH_SIZE) {
        const meetingBatch = meetings.slice(i, i + TRANSCRIPT_BATCH_SIZE);

        const transcriptPromises = meetingBatch.map((meeting) =>
          limit(async () => {
            try {
              return await this.client.getTranscript(meeting.recording_id);
            } catch (error) {
              console.warn(
                `Failed to fetch transcript for meeting ${meeting.recording_id}:`,
                error
              );
              return null;
            }
          })
        );

        const transcripts = (await Promise.all(transcriptPromises)).filter(
          Boolean
        ) as FathomRecord[];

        // Yield transcripts as they're fetched
        if (transcripts.length > 0) {
          for (let j = 0; j < transcripts.length; j += batchSize) {
            yield transcripts.slice(j, j + batchSize);
          }
        }
      }
    }

    if (this.config.includeSummaries !== false) {
      // Process meetings in batches
      for (let i = 0; i < meetings.length; i += TRANSCRIPT_BATCH_SIZE) {
        const meetingBatch = meetings.slice(i, i + TRANSCRIPT_BATCH_SIZE);

        const summaryPromises = meetingBatch.map((meeting) =>
          limit(async () => {
            try {
              return await this.client.getSummary(meeting.recording_id);
            } catch (error) {
              console.warn(
                `Failed to fetch summary for meeting ${meeting.recording_id}:`,
                error
              );
              return null;
            }
          })
        );

        const summaries = (await Promise.all(summaryPromises)).filter(
          Boolean
        ) as FathomRecord[];

        // Yield summaries as they're fetched
        if (summaries.length > 0) {
          for (let j = 0; j < summaries.length; j += batchSize) {
            yield summaries.slice(j, j + batchSize);
          }
        }
      }
    }
  }

  /**
   * Fetch records modified since timestamp
   */
  async *fetchIncremental(
    since: Date,
    _cursor?: string
  ): AsyncIterable<FathomRecord[]> {
    // Fetch meetings without embedded data
    const meetings = await this.client.listMeetings({
      created_after: since.toISOString(),
      include_summary: false,
      include_transcript: false,
      include_action_items: false,
    });

    const recentMeetings = meetings.filter(
      (m) => new Date(m.created_at) > since
    );

    if (recentMeetings.length > 0) {
      yield recentMeetings as FathomRecord[];

      // Fetch transcripts and summaries in parallel
      const limit = pLimit(MEETING_CONCURRENCY);

      if (this.config.includeTranscripts !== false) {
        const transcriptPromises = recentMeetings.map((meeting) =>
          limit(async () => {
            try {
              return await this.client.getTranscript(meeting.recording_id);
            } catch (error) {
              console.warn(
                `Failed to fetch transcript for meeting ${meeting.recording_id}:`,
                error
              );
              return null;
            }
          })
        );

        const transcripts = (await Promise.all(transcriptPromises)).filter(
          Boolean
        ) as FathomRecord[];
        if (transcripts.length > 0) {
          yield transcripts;
        }
      }

      if (this.config.includeSummaries !== false) {
        const summaryPromises = recentMeetings.map((meeting) =>
          limit(async () => {
            try {
              return await this.client.getSummary(meeting.recording_id);
            } catch (error) {
              console.warn(
                `Failed to fetch summary for meeting ${meeting.recording_id}:`,
                error
              );
              return null;
            }
          })
        );

        const summaries = (await Promise.all(summaryPromises)).filter(
          Boolean
        ) as FathomRecord[];
        if (summaries.length > 0) {
          yield summaries;
        }
      }
    }
  }

  /**
   * Fetch single record by ID
   */
  async fetchById(id: string): Promise<FathomRecord | null> {
    // Parse ID format: fathom_<type>_<id>
    const parts = id.split("_");
    if (parts.length < 3) return null;

    const [, type, ...rest] = parts;
    const identifier = rest.join("_");

    try {
      switch (type) {
        case "meeting":
          return (await this.client.getMeeting(identifier)) as FathomRecord;

        case "transcript":
          return (await this.client.getTranscript(
            parseInt(identifier, 10)
          )) as FathomRecord;

        case "summary":
          return (await this.client.getSummary(
            parseInt(identifier, 10)
          )) as FathomRecord;

        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to fetch record ${id}:`, error);
      return null;
    }
  }

  /**
   * Transform Fathom record to unified format
   */
  async transform(sourceRecord: FathomRecord): Promise<Record> {
    const recordType = this.getRecordType(sourceRecord);
    const sourceId = this.getSourceId(sourceRecord);
    const _id = this.generateRecordId(recordType, sourceId);
    const title = this.extractTitle(sourceRecord);
    const content = this.extractTextContent(sourceRecord);
    const people = this.extractPeople(sourceRecord);
    const primaryDate = this.extractPrimaryDate(sourceRecord);
    const tags = this.extractTags(sourceRecord);

    return {
      _id,
      source: this.source,
      sourceId: `${recordType}_${sourceId}`,
      recordType,
      title,
      content,
      people,
      primaryDate,
      tags,
      rawData: sourceRecord,
      checksum: this.computeChecksum(sourceRecord),
      version: 1,
      syncedAt: new Date(),
      sourceUpdatedAt: this.getUpdatedAt(sourceRecord),
      deletedAt: this.isDeleted(sourceRecord) ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract relationships from Fathom record
   */
  async extractRelationships(
    sourceRecord: FathomRecord
  ): Promise<EntityRelationship[]> {
    const relationships: EntityRelationship[] = [];
    const recordType = this.getRecordType(sourceRecord);
    const sourceId = this.getSourceId(sourceRecord);
    const recordId = this.generateRecordId(recordType, sourceId);

    // Meeting relationships
    if (recordType === "meeting") {
      const meeting = sourceRecord as FathomMeeting;

      // Calendar invitee relationships (participants)
      if (meeting.calendar_invitees) {
        meeting.calendar_invitees.forEach((invitee) => {
          if (invitee.email) {
            relationships.push({
              sourceId: recordId,
              targetId: this.generateRecordId("user", invitee.email),
              type: "HAS_PARTICIPANT",
              confidence: 1.0,
            });
          }
        });
      }

      // Recorded by relationship
      if (meeting.recorded_by?.email) {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", meeting.recorded_by.email),
          type: "RECORDED_BY",
          confidence: 1.0,
        });
      }
    }

    // Transcript relationships
    if (recordType === "transcript") {
      const transcript = sourceRecord as FathomTranscript;

      // Link transcript to meeting
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId(
          "meeting",
          transcript.recording_id.toString()
        ),
        type: "TRANSCRIPT_OF",
        confidence: 1.0,
      });

      // Extract speaker relationships from transcript
      if (transcript.transcripts && transcript.transcripts.length > 0) {
        const speakerMap = new Map<string, boolean>(); // speakerId -> hasMatchedEmail
        transcript.transcripts.forEach((segment) => {
          const speakerId =
            segment.speaker.matched_calendar_invitee_email ||
            segment.speaker.display_name;
          if (speakerId) {
            const hasMatchedEmail =
              !!segment.speaker.matched_calendar_invitee_email;
            speakerMap.set(speakerId, hasMatchedEmail);
          }
        });

        speakerMap.forEach((hasMatchedEmail, speakerId) => {
          relationships.push({
            sourceId: recordId,
            targetId: this.generateRecordId("user", speakerId),
            type: "HAS_SPEAKER",
            confidence: hasMatchedEmail ? 1.0 : 0.8,
          });
        });
      }
    }

    // Summary relationships
    if (recordType === "summary") {
      const summary = sourceRecord as FathomSummary;
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId(
          "meeting",
          summary.recording_id.toString()
        ),
        type: "SUMMARY_OF",
        confidence: 1.0,
      });
    }

    // Note relationships
    if (recordType === "note") {
      const note = sourceRecord as FathomNote;
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("meeting", note.meeting_id),
        type: "NOTE_IN_MEETING",
        confidence: 1.0,
      });

      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", note.created_by),
        type: "CREATED_BY",
        confidence: 1.0,
      });
    }

    // Action Item relationships (for standalone action item records)
    if (recordType === "action_item") {
      const actionItem = sourceRecord as FathomActionItem;

      if (actionItem.assignee) {
        relationships.push({
          sourceId: recordId,
          targetId: this.generateRecordId("user", actionItem.assignee.email),
          type: "ASSIGNED_TO",
          confidence: 1.0,
        });
      }
    }

    // Highlight relationships
    if (recordType === "highlight") {
      const highlight = sourceRecord as FathomHighlight;
      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("meeting", highlight.meeting_id),
        type: "HIGHLIGHT_IN_MEETING",
        confidence: 1.0,
      });

      relationships.push({
        sourceId: recordId,
        targetId: this.generateRecordId("user", highlight.created_by),
        type: "CREATED_BY",
        confidence: 1.0,
      });
    }

    return relationships;
  }

  /**
   * Check if record is deleted
   */
  isDeleted(sourceRecord: FathomRecord): boolean {
    const recordType = this.getRecordType(sourceRecord);

    if (recordType === "action_item") {
      return !(sourceRecord as FathomActionItem).completed;
    }

    return false;
  }

  /**
   * Get deleted records
   */
  async *getDeletedRecords(_since: Date): AsyncIterable<string[]> {
    // Fathom doesn't provide deleted records API
    yield [];
  }

  // ============================================
  // Protected Helper Methods
  // ============================================

  protected extractTextContent(sourceRecord: FathomRecord): string {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "meeting": {
        const meeting = sourceRecord as FathomMeeting;
        const parts: string[] = [];

        // Add meeting title
        if (meeting.title) {
          parts.push(`Meeting: ${meeting.title}`);
        }

        // Add participants
        if (meeting.calendar_invitees && meeting.calendar_invitees.length > 0) {
          const inviteeNames = meeting.calendar_invitees
            .map((i) => i.name)
            .filter(Boolean)
            .join(", ");
          if (inviteeNames) {
            parts.push(`Participants: ${inviteeNames}`);
          }
        }

        // Add recorded by
        if (meeting.recorded_by?.name) {
          parts.push(`Recorded by: ${meeting.recorded_by.name}`);
        }

        // Add meeting times
        if (meeting.scheduled_start_time) {
          parts.push(
            `Scheduled: ${new Date(
              meeting.scheduled_start_time
            ).toLocaleString()}`
          );
        }

        return parts.filter(Boolean).join("\n");
      }

      case "transcript": {
        const transcript = sourceRecord as FathomTranscript;
        if (transcript.transcripts && transcript.transcripts.length > 0) {
          return transcript.transcripts
            .map((seg) => `${seg.speaker.display_name}: ${seg.text}`)
            .join("\n");
        }
        return "";
      }

      case "summary": {
        const summary = sourceRecord as FathomSummary;
        return `${JSON.stringify(summary.summary)}`;
      }

      case "note": {
        const note = sourceRecord as FathomNote;
        return note.content;
      }

      case "action_item": {
        const actionItem = sourceRecord as FathomActionItem;
        return actionItem.description;
      }

      case "highlight": {
        const highlight = sourceRecord as FathomHighlight;
        return highlight.text;
      }

      case "user": {
        const user = sourceRecord as FathomUser;
        return `${user.name} (${user.email})`;
      }

      case "team": {
        const team = sourceRecord as FathomTeam;
        return team.name;
      }

      case "team_member": {
        const member = sourceRecord as FathomTeamMember;
        return `${member.name} (${member.email})`;
      }

      default:
        return "";
    }
  }

  protected extractTitle(sourceRecord: FathomRecord): string {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "meeting":
        return (sourceRecord as FathomMeeting).title;

      case "transcript": {
        const transcript = sourceRecord as FathomTranscript;
        return `Transcript for Recording ${transcript.recording_id}`;
      }

      case "summary": {
        const summary = sourceRecord as FathomSummary;
        return summary.template_name
          ? `Summary: ${summary.template_name}`
          : `Summary for Recording ${summary.recording_id}`;
      }

      case "note":
        return `Note: ${(sourceRecord as FathomNote).content.substring(
          0,
          50
        )}...`;

      case "action_item":
        return (sourceRecord as FathomActionItem).description;

      case "highlight":
        return `Highlight: ${(sourceRecord as FathomHighlight).text.substring(
          0,
          50
        )}...`;

      case "user":
        return (sourceRecord as FathomUser).name;

      case "team":
        return (sourceRecord as FathomTeam).name;

      case "team_member":
        return (sourceRecord as FathomTeamMember).name;

      default:
        return "Unknown";
    }
  }

  protected extractPeople(sourceRecord: FathomRecord): string[] {
    const people: string[] = [];
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "meeting": {
        const meeting = sourceRecord as FathomMeeting;
        if (meeting.calendar_invitees) {
          meeting.calendar_invitees.forEach((invitee) => {
            if (invitee.email) {
              people.push(invitee.email);
            }
          });
        }
        if (meeting.recorded_by?.email) {
          people.push(meeting.recorded_by.email);
        }
        break;
      }

      case "note": {
        const note = sourceRecord as FathomNote;
        people.push(note.created_by);
        break;
      }

      case "action_item": {
        const actionItem = sourceRecord as FathomActionItem;
        if (actionItem.assignee) {
          const assignee = actionItem.assignee as FathomTeamMember;
          people.push(assignee.email);
        }
        break;
      }

      case "highlight": {
        const highlight = sourceRecord as FathomHighlight;
        people.push(highlight.created_by);
        break;
      }
    }

    return [...new Set(people)];
  }

  protected extractPrimaryDate(sourceRecord: FathomRecord): Date | null {
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "meeting":
        return new Date(
          (sourceRecord as FathomMeeting).scheduled_start_time ?? new Date()
        );

      case "transcript": {
        return null;
      }

      case "summary":
        return new Date((sourceRecord as FathomSummary).created_at);

      case "note":
        return new Date((sourceRecord as FathomNote).created_at);

      case "action_item":
        return new Date((sourceRecord as FathomActionItem).record_timestamp);

      case "highlight":
        return new Date((sourceRecord as FathomHighlight).created_at);

      case "user":
        return null; // FathomUser doesn't have a created_at field

      case "team":
        return new Date((sourceRecord as FathomTeam).created_at ?? new Date());

      case "team_member":
        return new Date((sourceRecord as FathomTeamMember).created_at);

      default:
        return null;
    }
  }

  protected extractTags(sourceRecord: FathomRecord): string[] {
    const tags: string[] = [];
    const recordType = this.getRecordType(sourceRecord);

    switch (recordType) {
      case "meeting": {
        const meeting = sourceRecord as FathomMeeting;
        if (meeting.calendar_invitees_domains_type) {
          tags.push(meeting.calendar_invitees_domains_type);
        }
        if (meeting.transcript_language) {
          tags.push(meeting.transcript_language);
        }
        break;
      }

      case "note": {
        const note = sourceRecord as FathomNote;
        tags.push(...note.tags);
        break;
      }

      case "action_item": {
        const actionItem = sourceRecord as FathomActionItem;
        tags.push(actionItem.completed ? "completed" : "pending");
        if (actionItem.user_generated) {
          tags.push("user_generated");
        }
        break;
      }
    }

    return tags;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private getRecordType(record: FathomRecord): string {
    if ("type" in record) {
      return record.type as string;
    }
    // Check for meeting (has recording_id and calendar_invitees)
    if ("recording_id" in record && "calendar_invitees" in record)
      return "meeting";

    // Check for transcript (has recording_id and transcripts array)
    if ("recording_id" in record && "transcripts" in record)
      return "transcript";

    // Check for summary (has recording_id and summary string)
    if ("recording_id" in record && "summary" in record) return "summary";

    // Check for note (has content, meeting_id, created_by, tags)
    if (
      "content" in record &&
      "meeting_id" in record &&
      "created_by" in record &&
      "tags" in record
    )
      return "note";

    // Check for action item (has description, user_generated, completed)
    if (
      "description" in record &&
      "user_generated" in record &&
      "completed" in record
    )
      return "action_item";

    // Check for highlight (has text, timestamp, meeting_id, created_by)
    if (
      "text" in record &&
      "timestamp" in record &&
      "meeting_id" in record &&
      "created_by" in record
    )
      return "highlight";

    // Check for team member (has team, role, and email with created_at/updated_at)
    if (
      "team" in record &&
      "role" in record &&
      "email" in record &&
      "created_at" in record &&
      "updated_at" in record
    )
      return "team_member";

    // Check for team (has name and id with created_at/updated_at but not email)
    if (
      "name" in record &&
      "id" in record &&
      "created_at" in record &&
      "updated_at" in record &&
      !("email" in record)
    )
      return "team";

    // Check for user (has email and email_domain and team but not role)
    if (
      "email" in record &&
      "email_domain" in record &&
      "team" in record &&
      !("role" in record)
    )
      return "user";

    return "unknown";
  }

  private getSourceId(record: FathomRecord): string {
    // For meetings, transcripts, and summaries, use recording_id
    if ("recording_id" in record) {
      const id = (record as any).recording_id.toString();
      // Add prefix for transcripts and summaries to differentiate from meetings
      return id;
    }

    // For other records with id field
    if ("id" in record) {
      return (record as any).id?.toString() || "unknown";
    }

    return "unknown";
  }

  private getUpdatedAt(record: FathomRecord): Date {
    if ("updated_at" in record) {
      return new Date((record as any).updated_at);
    }
    if ("created_at" in record) {
      return new Date((record as any).created_at);
    }

    return new Date();
  }
}
