import type {
  FathomMeeting,
  FathomTranscript,
  FathomSummary,
  FathomTeam,
  FathomTeamMember,
  FathomUser,
  FathomCalendarInvitee,
} from '@almanac/shared-util';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse.js';
import { COMPANY_DATA } from '../data/company.js';
import { generateRandomDate, generateDateInRange } from '../utils/dates.js';
import { selectRandom, selectRandomMultiple } from '../utils/random.js';
import type { GenerationContext, RelationshipContext, GeneratorConfig } from '../types.js';
import { generateWithLLM } from '../utils/llm.js';
import { generateRandomStringId, generateFathomRecordingId } from '../utils/id-generator.js';

/**
 * Generate Fathom teams
 */
export function generateFathomTeams(count: number = 2): FathomTeam[] {
  const teamNames = ['Engineering', 'Product', 'Sales', 'Marketing', 'Design'];
  const teams: FathomTeam[] = [];

  for (let i = 0; i < Math.min(count, teamNames.length); i++) {
    const now = new Date();
    teams.push({
      id: generateRandomStringId('team'),
      name: teamNames[i],
      created_at: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
    });
  }

  return teams;
}

/**
 * Generate Fathom team members from company data
 */
export function generateFathomTeamMembers(teams: FathomTeam[]): FathomTeamMember[] {
  const members: FathomTeamMember[] = [];

  for (const teamMember of COMPANY_DATA.teamMembers) {
    const team = selectRandom(teams);
    const now = new Date();

    members.push({
      id: generateRandomStringId('member'),
      team: team.id,
      name: teamMember.name,
      email: teamMember.email,
      role: teamMember.role || 'member',
      created_at: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
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
  startingId: number = 1000,
): FathomMeeting[] {
  const meetings: FathomMeeting[] = [];
  const meetingTypes = [
    { title: 'Sprint Planning', duration: 60 },
    { title: 'Daily Standup', duration: 15 },
    { title: 'Sprint Review', duration: 45 },
    { title: 'Sprint Retrospective', duration: 45 },
    { title: '1:1 Meeting', duration: 30 },
    { title: 'Team Sync', duration: 30 },
    { title: 'Architecture Discussion', duration: 60 },
    { title: 'Product Review', duration: 45 },
  ];

  for (let i = 0; i < count; i++) {
    const recordingId = generateFathomRecordingId();
    const meetingType = selectRandom(meetingTypes);
    const scheduledStart = generateDateInRange(context.startDate, context.endDate);
    const scheduledEnd = new Date(scheduledStart.getTime() + meetingType.duration * 60 * 1000);

    // Recording typically starts a bit after scheduled time
    const recordingStart = new Date(scheduledStart.getTime() + 2 * 60 * 1000);
    const recordingEnd = new Date(
      recordingStart.getTime() + (meetingType.duration - 5) * 60 * 1000,
    );

    const recordedBy = selectRandom(teamMembers);
    const inviteeCount = meetingType.title.includes('1:1') ? 2 : Math.floor(Math.random() * 5) + 3;
    const invitees = selectRandomMultiple(teamMembers, inviteeCount);

    const calendarInvitees: FathomCalendarInvitee[] = invitees.map((member) => ({
      name: member.name,
      email: member.email,
      email_domain: member.email.split('@')[1],
      is_external: false,
      matched_speaker_display_name: member.name,
    }));

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
      calendar_invitees_domains_type: 'all',
      transcript_language: 'en',
      calendar_invitees: calendarInvitees,
      recorded_by: {
        name: recordedBy.name,
        email: recordedBy.email,
        email_domain: recordedBy.email.split('@')[1],
        team: recordedBy.team,
      },
      // NOTE: Do NOT include transcript, default_summary, or action_items
      // The adapter fetches these separately via getTranscript() and getSummary()
    });
  }

  return meetings;
}

/**
 * Generate transcripts for meetings with optional context using LLM
 */
export async function generateFathomTranscripts(
  meetings: FathomMeeting[],
  config: GeneratorConfig,
  context?: RelationshipContext,
): Promise<FathomTranscript[]> {
  const transcripts: FathomTranscript[] = [];

  for (const meeting of meetings) {
    const speakers = meeting.calendar_invitees.slice(
      0,
      Math.min(4, meeting.calendar_invitees.length),
    );

    const segmentCount = Math.floor(Math.random() * 15) + 10; // 10-25 segments

    // Build context string if available
    let contextStr = '';
    if (context) {
      const contextParts: string[] = [];

      if (context.issues && context.issues.length > 0 && Math.random() < 0.6) {
        const issue = selectRandom(context.issues);
        contextParts.push(`GitHub Issue #${issue.number}: ${issue.title}`);
      }

      if (context.messages && context.messages.length > 0 && Math.random() < 0.4) {
        contextParts.push('Recent Slack discussions from the team');
      }

      if (context.pages && context.pages.length > 0 && Math.random() < 0.3) {
        const page = selectRandom(context.pages);
        const pageTitle =
          typeof page.properties?.title === 'object' && 'title' in page.properties.title
            ? page.properties.title.title[0]?.plain_text || 'the document'
            : 'documentation';
        contextParts.push(`Notion page: ${pageTitle}`);
      }

      if (contextParts.length > 0) {
        contextStr = `\n\nContext to reference naturally in conversation:\n- ${contextParts.join(
          '\n- ',
        )}`;
      }
    }

    // Generate conversation using LLM
    const prompt = `Generate a realistic meeting transcript for: ${meeting.meeting_title}

Participants: ${speakers.map((s) => s.name).join(', ')}
Company: ${COMPANY_DATA.name} - Gaming & Interactive Entertainment startup
Meeting Duration: ~${Math.floor(
      (new Date(meeting.recording_end_time).getTime() -
        new Date(meeting.recording_start_time).getTime()) /
        60000,
    )} minutes${contextStr}

Create ${segmentCount} conversational segments that:
- Sound like a real ${meeting.meeting_title.toLowerCase()}
- Have natural back-and-forth between participants
- Include technical discussions relevant to game development
- ${
      context
        ? 'Reference the provided context naturally'
        : 'Focus on sprint work and technical decisions'
    }
- Mix longer technical explanations with brief acknowledgments
- Include realistic filler like "um", "let me check", "good point"

Format each segment as:
[Speaker Name]: [What they said]

Generate exactly ${segmentCount} segments:`;

    try {
      const response = await generateWithLLM(prompt, config);
      const lines = response
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      const segments = [];
      let segmentIndex = 0;

      for (const line of lines) {
        if (segmentIndex >= segmentCount) break;

        const match = line.match(/^\[?([^\]]+)\]?:(.+)$/);
        if (match) {
          const speakerName = match[1].trim();
          const text = match[2].trim();

          // Find matching speaker or use random
          let speaker = speakers.find((s) => s.name === speakerName);
          if (!speaker) {
            speaker = selectRandom(speakers);
          }

          const minutes = Math.floor(segmentIndex * 2);
          const seconds = Math.floor(Math.random() * 60);

          segments.push({
            speaker: {
              display_name: speaker.name,
              matched_calendar_invitee_email: speaker.email,
            },
            text: text,
            timestamp: `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
          });

          segmentIndex++;
        }
      }

      // If we didn't get enough segments, fill with simple ones
      while (segments.length < Math.min(segmentCount, 8)) {
        const speaker = selectRandom(speakers);
        const minutes = Math.floor(segments.length * 2);
        const seconds = Math.floor(Math.random() * 60);

        segments.push({
          speaker: {
            display_name: speaker.name,
            matched_calendar_invitee_email: speaker.email,
          },
          text: selectRandom([
            'Thanks for the update.',
            'Makes sense to me.',
            "I'll follow up on that.",
            'Good point.',
            "Let's discuss this more offline.",
          ]),
          timestamp: `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        });
      }

      transcripts.push({
        type: 'transcript',
        recording_id: meeting.recording_id,
        transcripts: segments,
      });
    } catch (error) {
      console.error(`Error generating transcript for meeting ${meeting.recording_id}:`, error);
      // Fallback to simple transcript
      const segments = [];
      for (let i = 0; i < Math.min(segmentCount, 5); i++) {
        const speaker = selectRandom(speakers);
        const minutes = Math.floor(i * 2);
        const seconds = Math.floor(Math.random() * 60);

        segments.push({
          speaker: {
            display_name: speaker.name,
            matched_calendar_invitee_email: speaker.email,
          },
          text: 'Discussion about project progress.',
          timestamp: `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        });
      }

      transcripts.push({
        type: 'transcript',
        recording_id: meeting.recording_id,
        transcripts: segments,
      });
    }
  }

  return transcripts;
}

/**
 * Generate summaries for meetings with optional context using LLM
 */
export async function generateFathomSummaries(
  meetings: FathomMeeting[],
  config: GeneratorConfig,
  context?: RelationshipContext,
): Promise<FathomSummary[]> {
  const summaries: FathomSummary[] = [];

  for (const meeting of meetings) {
    // Build context string if available
    let contextStr = '';
    if (context) {
      const contextParts: string[] = [];

      if (context.issues && context.issues.length > 0 && Math.random() < 0.6) {
        const issue = selectRandom(context.issues);
        contextParts.push(`GitHub Issue #${issue.number}: ${issue.title}`);
      }

      if (context.messages && context.messages.length > 0 && Math.random() < 0.4) {
        contextParts.push('Recent Slack team discussions');
      }

      if (context.pages && context.pages.length > 0 && Math.random() < 0.3) {
        const page = selectRandom(context.pages);
        const pageTitle =
          typeof page.properties?.title === 'object' && 'title' in page.properties.title
            ? page.properties.title.title[0]?.plain_text || 'documentation'
            : 'documentation';
        contextParts.push(`Notion: ${pageTitle}`);
      }

      if (contextParts.length > 0) {
        contextStr = `\n\nContext discussed in meeting:\n- ${contextParts.join('\n- ')}`;
      }
    }

    const prompt = `Generate a concise meeting summary for: ${meeting.meeting_title}

Meeting Date: ${new Date(meeting.recording_start_time).toLocaleDateString()}
Company: ${COMPANY_DATA.name} - Gaming startup
Participants: ${meeting.calendar_invitees.map((p) => p.name).join(', ')}${contextStr}

Create a professional summary with these sections:

## Key Discussion Points
- 3-4 bullet points of main topics discussed

## Decisions Made
- 2-3 key decisions or conclusions

## Action Items
- 2-4 specific next steps with implied owners

Keep it concise and actionable. Use markdown formatting.

Generate the summary:`;

    try {
      const summary = await generateWithLLM(prompt, config);

      summaries.push({
        type: 'summary',
        recording_id: meeting.recording_id,
        summary: summary.trim(),
        template_name: 'Default Summary',
        created_at: meeting.created_at,
      });
    } catch (error) {
      console.error(`Error generating summary for meeting ${meeting.recording_id}:`, error);
      // Fallback to simple summary
      summaries.push({
        type: 'summary',
        recording_id: meeting.recording_id,
        summary: `## Key Discussion Points\n\n- Reviewed ${meeting.meeting_title.toLowerCase()}\n- Team alignment discussion\n- Progress updates shared\n\n## Action Items\n\n- Follow up on open items\n- Update documentation`,
        template_name: 'Default Summary',
        created_at: meeting.created_at,
      });
    }
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
    email_domain: member.email.split('@')[1],
    team: 'gragger',
  }));
}
