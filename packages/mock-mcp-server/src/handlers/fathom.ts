import type { MockData } from "../types.js";

/**
 * Get all meetings
 */
export function getMeetings(
  data: MockData,
  options?: {
    limit?: number;
    start_date?: string;
    end_date?: string;
  }
): any[] {
  if (!data.fathom) return [];

  let meetings = data.fathom.meetings;

  // Filter by date range
  if (options?.start_date) {
    const startDate = new Date(options.start_date);
    meetings = meetings.filter((m) => new Date(m.start_time) >= startDate);
  }

  if (options?.end_date) {
    const endDate = new Date(options.end_date);
    meetings = meetings.filter((m) => new Date(m.start_time) <= endDate);
  }

  // Apply limit
  if (options?.limit && options.limit > 0) {
    meetings = meetings.slice(0, options.limit);
  }

  return meetings;
}

/**
 * Get meeting by ID
 */
export function getMeetingById(
  data: MockData,
  meetingId: string
): any | undefined {
  return data.fathom?.meetings.find((m) => m.id === meetingId);
}

/**
 * Get transcript by recording ID
 */
export function getTranscriptByRecordingId(
  data: MockData,
  recordingId: string
): any | undefined {
  return data.fathom?.transcripts.find((t) => t.recording_id === recordingId);
}

/**
 * Get summary by recording ID
 */
export function getSummaryByRecordingId(
  data: MockData,
  recordingId: string
): any | undefined {
  return data.fathom?.summaries.find((s) => s.recording_id === recordingId);
}

/**
 * Search meetings by title or participants
 */
export function searchMeetings(
  data: MockData,
  query: string,
  options?: {
    limit?: number;
  }
): any[] {
  if (!data.fathom) return [];

  const queryLower = query.toLowerCase();

  let meetings = data.fathom.meetings.filter((m) => {
    const title = m.title?.toLowerCase() || "";
    const participants =
      m.participants?.map((p: any) => p.name?.toLowerCase()).join(" ") || "";
    return title.includes(queryLower) || participants.includes(queryLower);
  });

  // Apply limit
  if (options?.limit && options.limit > 0) {
    meetings = meetings.slice(0, options.limit);
  }

  return meetings;
}

/**
 * Get all teams
 */
export function getTeams(data: MockData): any[] {
  return data.fathom?.teams || [];
}

/**
 * Get all team members
 */
export function getTeamMembers(data: MockData): any[] {
  return data.fathom?.teamMembers || [];
}
