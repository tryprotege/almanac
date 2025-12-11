import type {
  FathomMeeting,
  FathomTranscript,
  FathomSummary,
  FathomTeam,
  FathomTeamMember,
  FathomUser,
  FathomCalendarInvitee,
} from "@ebee-oss/shared-util";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";
import { COMPANY_DATA } from "../data/company.js";
import { generateRandomDate, generateDateInRange } from "../utils/dates.js";
import { selectRandom, selectRandomMultiple } from "../utils/random.js";
import type {
  GenerationContext,
  RelationshipContext,
  GeneratorConfig,
} from "../types.js";
import { generateWithLLM } from "../utils/llm.js";

/**
 * Generate Fathom teams
 */
export function generateFathomTeams(count: number = 2): FathomTeam[] {
  const teamNames = ["Engineering", "Product", "Sales", "Marketing", "Design"];
  const teams: FathomTeam[] = [];

  for (let i = 0; i < Math.min(count, teamNames.length); i++) {
    const now = new Date();
    teams.push({
      id: `team_${i + 1}`,
      name: teamNames[i],
      created_at: new Date(
        now.getTime() - 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      updated_at: now.toISOString(),
    });
  }

  return teams;
}

/**
 * Generate Fathom team members from company data
 */
export function generateFathomTeamMembers(
  teams: FathomTeam[]
): FathomTeamMember[] {
  const members: FathomTeamMember[] = [];

  for (const teamMember of COMPANY_DATA.teamMembers) {
    const team = selectRandom(teams);
    const now = new Date();

    members.push({
      id: `member_${teamMember.email.split("@")[0]}`,
      team: team.id,
      name: teamMember.name,
      email: teamMember.email,
      role: teamMember.role || "member",
      created_at: new Date(
        now.getTime() - 180 * 24 * 60 * 60 * 1000
      ).toISOString(),
      updated_at: now.toISOString(),
    });
  }

  return members;
}

/**
 * Generate Fathom meetings with proper structure
 */
export function generateFathomMeetings(
  count: number,
  teamMembers: FathomTeamMember[],
  context: GenerationContext,
  startingId: number = 1000
): FathomMeeting[] {
  const meetings: FathomMeeting[] = [];
  const meetingTypes = [
    { title: "Sprint Planning", duration: 60 },
    { title: "Daily Standup", duration: 15 },
    { title: "Sprint Review", duration: 45 },
    { title: "Sprint Retrospective", duration: 45 },
    { title: "1:1 Meeting", duration: 30 },
    { title: "Team Sync", duration: 30 },
    { title: "Architecture Discussion", duration: 60 },
    { title: "Product Review", duration: 45 },
  ];

  for (let i = 0; i < count; i++) {
    const recordingId = startingId + i;
    const meetingType = selectRandom(meetingTypes);
    const scheduledStart = generateDateInRange(
      context.startDate,
      context.endDate
    );
    const scheduledEnd = new Date(
      scheduledStart.getTime() + meetingType.duration * 60 * 1000
    );

    // Recording typically starts a bit after scheduled time
    const recordingStart = new Date(scheduledStart.getTime() + 2 * 60 * 1000);
    const recordingEnd = new Date(
      recordingStart.getTime() + (meetingType.duration - 5) * 60 * 1000
    );

    const recordedBy = selectRandom(teamMembers);
    const inviteeCount = meetingType.title.includes("1:1")
      ? 2
      : Math.floor(Math.random() * 5) + 3;
    const invitees = selectRandomMultiple(teamMembers, inviteeCount);

    const calendarInvitees: FathomCalendarInvitee[] = invitees.map(
      (member) => ({
        name: member.name,
        email: member.email,
        email_domain: member.email.split("@")[1],
        is_external: false,
        matched_speaker_display_name: member.name,
      })
    );

    meetings.push({
      title: `${meetingType.title} - ${scheduledStart.toLocaleDateString()}`,
      meeting_title: meetingType.title,
      recording_id: recordingId,
      url: `https://app.fathom.video/recording/${recordingId}`,
      share_url: `https://app.fathom.video/share/${recordingId}`,
      created_at: scheduledStart.toISOString(),
      scheduled_start_time: scheduledStart.toISOString(),
      scheduled_end_time: scheduledEnd.toISOString(),
      recording_start_time: recordingStart.toISOString(),
      recording_end_time: recordingEnd.toISOString(),
      calendar_invitees_domains_type: "all",
      transcript_language: "en",
      calendar_invitees: calendarInvitees,
      recorded_by: {
        name: recordedBy.name,
        email: recordedBy.email,
        email_domain: recordedBy.email.split("@")[1],
        team: recordedBy.team,
      },
      // NOTE: Do NOT include transcript, default_summary, or action_items
      // The adapter fetches these separately via getTranscript() and getSummary()
    });
  }

  return meetings;
}

/**
 * Generate transcripts for meetings with optional context
 */
export async function generateFathomTranscripts(
  meetings: FathomMeeting[],
  config: GeneratorConfig,
  context?: RelationshipContext
): Promise<FathomTranscript[]> {
  const transcripts: FathomTranscript[] = [];

  for (const meeting of meetings) {
    const speakers = meeting.calendar_invitees.slice(
      0,
      Math.min(4, meeting.calendar_invitees.length)
    );

    let conversationSnippets: string[];

    // If context is provided, generate context-aware conversation
    if (
      context &&
      (context.issues?.length ||
        context.messages?.length ||
        context.pages?.length)
    ) {
      const contextItems: string[] = [];

      // 60% chance to reference a GitHub issue
      if (context.issues && context.issues.length > 0 && Math.random() < 0.6) {
        const issue = selectRandom(context.issues);
        contextItems.push(
          `We need to address issue #${issue.number}: ${issue.title}`
        );
      }

      // 40% chance to reference a Slack discussion
      if (
        context.messages &&
        context.messages.length > 0 &&
        Math.random() < 0.4
      ) {
        const msg = selectRandom(context.messages) as MessageElement;
        contextItems.push(
          `Following up on the Slack discussion about ${msg.text?.substring(
            0,
            50
          )}...`
        );
      }

      // 30% chance to reference a Notion page
      if (context.pages && context.pages.length > 0 && Math.random() < 0.3) {
        const page = selectRandom(context.pages);
        const pageTitle =
          typeof page.properties?.title === "object" &&
          "title" in page.properties.title
            ? page.properties.title.title[0]?.plain_text || "the document"
            : "the document";
        contextItems.push(`As documented in ${pageTitle}, we should...`);
      }

      conversationSnippets = [
        ...contextItems,
        "Let's start by reviewing what we accomplished last sprint.",
        "I think we should prioritize this feature.",
        "The performance has been great since the optimization.",
        "Can someone give an update on the progress?",
        "We should schedule a follow-up meeting to discuss this further.",
      ];
    } else {
      // Default conversation snippets without context
      conversationSnippets = [
        "Let's start by reviewing what we accomplished last sprint.",
        "I think we should prioritize the authentication feature.",
        "The API performance has been great since the optimization.",
        "We need to address the technical debt in the payment module.",
        "Can someone give an update on the database migration?",
        "I'm blocked on the frontend integration, need help from backend team.",
        "The design mockups look great, when can we start implementation?",
        "We should schedule a follow-up meeting to discuss this further.",
        "Let's make sure we document this decision in Notion.",
        "I'll create a GitHub issue to track this work.",
      ];
    }

    const segments = [];
    const segmentCount = Math.floor(Math.random() * 15) + 10; // 10-25 segments

    for (let i = 0; i < segmentCount; i++) {
      const speaker = selectRandom(speakers);
      const minutes = Math.floor(i * 2);
      const seconds = Math.floor(Math.random() * 60);

      segments.push({
        speaker: {
          display_name: speaker.name,
          matched_calendar_invitee_email: speaker.email,
        },
        text: selectRandom(conversationSnippets),
        timestamp: `00:${String(minutes).padStart(2, "0")}:${String(
          seconds
        ).padStart(2, "0")}`,
      });
    }

    transcripts.push({
      type: "transcript",
      recording_id: meeting.recording_id,
      transcripts: segments,
    });
  }

  return transcripts;
}

/**
 * Generate summaries for meetings with optional context
 */
export async function generateFathomSummaries(
  meetings: FathomMeeting[],
  config: GeneratorConfig,
  context?: RelationshipContext
): Promise<FathomSummary[]> {
  const summaries: FathomSummary[] = [];

  for (const meeting of meetings) {
    let summary: string;

    // If context is provided, generate context-aware summary
    if (
      context &&
      (context.issues?.length ||
        context.messages?.length ||
        context.pages?.length)
    ) {
      const contextReferences: string[] = [];

      // Reference GitHub issues
      if (context.issues && context.issues.length > 0 && Math.random() < 0.6) {
        const issue = selectRandom(context.issues);
        contextReferences.push(
          `- Discussed GitHub issue #${issue.number}: ${issue.title}`
        );
      }

      // Reference Slack discussions
      if (
        context.messages &&
        context.messages.length > 0 &&
        Math.random() < 0.4
      ) {
        contextReferences.push(`- Followed up on team discussions from Slack`);
      }

      // Reference Notion pages
      if (context.pages && context.pages.length > 0 && Math.random() < 0.3) {
        const page = selectRandom(context.pages);
        const pageTitle =
          typeof page.properties?.title === "object" &&
          "title" in page.properties.title
            ? page.properties.title.title[0]?.plain_text || "documentation"
            : "documentation";
        contextReferences.push(`- Reviewed ${pageTitle}`);
      }

      summary = `## Key Discussion Points\n\n${contextReferences.join(
        "\n"
      )}\n- Reviewed progress and next steps\n- Addressed team questions\n\n## Action Items\n\n- Follow up on discussed items\n- Update relevant documentation\n- Schedule follow-up if needed`;
    } else {
      // Default summary without context
      const summaryTemplates = [
        "## Key Discussion Points\n\n- Reviewed sprint progress\n- Discussed technical challenges\n- Planned next steps\n\n## Action Items\n\n- Follow up on pending PRs\n- Schedule architecture review\n- Update documentation",
        "## Meeting Summary\n\n- Team alignment on priorities\n- Technical decisions made\n- Blockers identified and addressed\n\n## Next Steps\n\n- Continue implementation\n- Review with stakeholders\n- Update project timeline",
        "## Overview\n\n- Progress update shared\n- Challenges discussed\n- Solutions proposed\n\n## Decisions\n\n- Approved technical approach\n- Assigned tasks to team members\n- Set deadline for next milestone",
      ];
      summary = selectRandom(summaryTemplates);
    }

    summaries.push({
      type: "summary",
      recording_id: meeting.recording_id,
      summary,
      template_name: "Default Summary",
      created_at: meeting.created_at,
    });
  }

  return summaries;
}

/**
 * Legacy function for compatibility - generates basic Fathom users
 */
export function generateFathomUsers(): FathomUser[] {
  return COMPANY_DATA.teamMembers.map((member) => ({
    name: member.name,
    email: member.email,
    email_domain: member.email.split("@")[1],
    team: "gragger",
  }));
}
