import type {
  GitHubIssue,
  GitHubPullRequest,
  NotionPage,
  FathomMeeting,
  FathomTranscript,
  GitHubUser,
  FathomCalendarInvitee,
} from '@almanac/shared-util';
import type { Member } from '@slack/web-api/dist/types/response/UsersListResponse.js';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse.js';
import type {
  WorkflowTemplate,
  WorkflowStage,
  WorkflowInstance,
  WorkflowTopic,
  MessageWithChannel,
} from './types.js';
import type { GeneratorConfig } from '../types.js';
import { WORKFLOW_TEMPLATES } from './templates.js';
import { generateWithLLM } from '../utils/llm.js';
import { selectRandom, selectRandomMultiple } from '../utils/random.js';
import { COMPANY_DATA } from '../data/company.js';
import { generateGitHubUsers } from '../generators/github.js';

/**
 * Orchestrates workflow-based data generation with proper cross-service connections
 */
export class WorkflowOrchestrator {
  private workflows: WorkflowInstance[] = [];
  private artifacts: {
    github: { issues: GitHubIssue[]; prs: GitHubPullRequest[] };
    slack: MessageWithChannel[];
    notion: NotionPage[];
    fathom: { meetings: FathomMeeting[]; transcripts: FathomTranscript[] };
  };

  constructor(
    private config: GeneratorConfig,
    private topics: WorkflowTopic[],
    private timeline: Date[],
    private slackUsers: Member[],
    private slackChannels: Channel[],
  ) {
    this.artifacts = {
      github: { issues: [], prs: [] },
      slack: [],
      notion: [],
      fathom: { meetings: [], transcripts: [] },
    };
  }

  async generateConnectedData(workflowCount: number): Promise<typeof this.artifacts> {
    // Select workflow templates based on frequency weights
    const templates = this.selectWorkflowTemplates(workflowCount);

    for (let i = 0; i < workflowCount; i++) {
      const template = templates[i];
      const topic = this.topics[i % this.topics.length];
      const startDate = selectRandom(this.timeline);

      console.log(
        `🔄 Generating workflow ${i + 1}/${workflowCount}: ${template.name} - "${topic.title}"`,
      );

      const instance = await this.executeWorkflow(template, topic, startDate);
      this.workflows.push(instance);
    }

    return this.artifacts;
  }

  private selectWorkflowTemplates(count: number): WorkflowTemplate[] {
    const templates: WorkflowTemplate[] = [];
    const totalWeight = WORKFLOW_TEMPLATES.reduce((sum, t) => sum + t.frequency, 0);

    for (let i = 0; i < count; i++) {
      let random = Math.random() * totalWeight;
      for (const template of WORKFLOW_TEMPLATES) {
        random -= template.frequency;
        if (random <= 0) {
          templates.push(template);
          break;
        }
      }
    }

    return templates;
  }

  private async executeWorkflow(
    template: WorkflowTemplate,
    topic: WorkflowTopic,
    startDate: Date,
  ): Promise<WorkflowInstance> {
    const instance: WorkflowInstance = {
      templateId: template.id,
      topic: topic.title,
      artifacts: new Map(),
      timeline: [],
    };

    let currentDate = startDate;

    for (const stage of template.stages) {
      // Calculate timing
      const delayHours =
        stage.delayFromPrevious.min +
        Math.random() * (stage.delayFromPrevious.max - stage.delayFromPrevious.min);
      currentDate = new Date(currentDate.getTime() + delayHours * 3600000);
      instance.timeline.push(currentDate);

      // Gather references from previous stages
      const references = stage.references.map((ref) => instance.artifacts.get(ref)).filter(Boolean);

      // Generate the artifact for this stage
      try {
        const artifact = await this.generateStageArtifact(stage, topic, currentDate, references);

        instance.artifacts.set(String(stage.order), artifact);

        // Add to global artifacts
        this.addToGlobalArtifacts(stage.service, stage.type, artifact);
      } catch (error) {
        console.error(
          `  ❌ Error generating stage ${stage.order} (${stage.service}/${stage.type}):`,
          error,
        );
      }
    }

    return instance;
  }

  private async generateStageArtifact(
    stage: WorkflowStage,
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<any> {
    switch (stage.service) {
      case 'github':
        return this.generateGitHubArtifact(stage.type, topic, date, references);
      case 'slack':
        return this.generateSlackArtifact(stage.type, topic, date, references);
      case 'notion':
        return this.generateNotionArtifact(stage.type, topic, date, references);
      case 'fathom':
        return this.generateFathomArtifact(stage.type, topic, date, references);
    }
  }

  private async generateGitHubArtifact(
    type: string,
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<GitHubIssue | GitHubPullRequest> {
    if (type === 'issue') {
      return this.generateConnectedIssue(topic, date, references);
    } else {
      return this.generateConnectedPR(topic, date, references);
    }
  }

  private async generateConnectedIssue(
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<GitHubIssue> {
    const refContext = this.buildReferenceContext(references);
    const users = generateGitHubUsers();
    const author = selectRandom(users);

    const prompt = `Generate a GitHub issue for: ${topic.title}

Technical Context: ${topic.technicalDetails}
Repository: ${topic.affectedRepo}
Category: ${topic.category}

${refContext ? `This issue follows from:\n${refContext}` : ''}

The issue body should:
- Reference specific technical details
${references.some((r) => r?.type === 'message') ? '- Mention "as discussed in Slack"' : ''}
${references.some((r) => r?.url?.includes('notion')) ? '- Link to the Notion doc' : ''}
${references.some((r) => r?.recording_id) ? '- Reference "per our meeting discussion"' : ''}

Return JSON:
{
  "title": "Issue title",
  "body": "Full issue body with markdown formatting"
}`;

    const response = await generateWithLLM(prompt, this.config);
    const parsed = JSON.parse(response);

    const issueNumber = this.artifacts.github.issues.length + 1;

    return {
      id: 1000 + issueNumber,
      node_id: `MDU6SXNzdWU${1000 + issueNumber}`,
      number: issueNumber,
      title: parsed.title,
      body: this.injectCrossReferences(parsed.body, references),
      state: 'open',
      state_reason: null,
      user: {
        login: author.login,
        id: author.id,
        node_id: author.node_id,
        avatar_url: author.avatar_url,
        html_url: author.html_url,
        type: author.type,
        site_admin: false,
        name: author.name,
        email: author.email,
      },
      labels: [],
      assignees: [],
      milestone: null,
      comments: 0,
      created_at: date.toISOString(),
      updated_at: date.toISOString(),
      closed_at: null,
      author_association: 'CONTRIBUTOR',
      locked: false,
      repository_url: `https://api.github.com/repos/${COMPANY_DATA.githubOrg}/${topic.affectedRepo}`,
      html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${topic.affectedRepo}/issues/${issueNumber}`,
    };
  }

  private async generateConnectedPR(
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<GitHubPullRequest> {
    // Find the issue this PR fixes
    const relatedIssue = references.find((r) => r?.number && r?.title);
    const users = generateGitHubUsers();
    const author = selectRandom(users);

    const prompt = `Generate a GitHub PR that ${
      relatedIssue
        ? `fixes issue #${relatedIssue.number}: ${relatedIssue.title}`
        : `implements: ${topic.title}`
    }

Repository: ${topic.affectedRepo}
Technical Context: ${topic.technicalDetails}

The PR should:
- Have a clear title starting with the type (fix:, feat:, refactor:, etc.)
- Body must include "Fixes #${relatedIssue?.number || 'XX'}" if fixing an issue
- Describe what changed and why
- Mention testing done

Return JSON:
{
  "title": "PR title",
  "body": "Full PR body with markdown"
}`;

    const response = await generateWithLLM(prompt, this.config);
    const parsed = JSON.parse(response);
    const prNumber = this.artifacts.github.prs.length + 1;

    return {
      id: 2000 + prNumber,
      node_id: `MDExOlB1bGxSZXF1ZXN0${2000 + prNumber}`,
      number: prNumber,
      title: parsed.title,
      body: parsed.body,
      state: 'closed',
      user: {
        login: author.login,
        id: author.id,
        node_id: author.node_id,
        avatar_url: author.avatar_url,
        html_url: author.html_url,
        type: author.type,
        site_admin: false,
        name: author.name,
      },
      labels: [],
      assignees: [],
      requested_reviewers: [],
      requested_teams: [],
      milestone: null,
      draft: false,
      merged: true,
      mergeable: null,
      mergeable_state: 'unknown',
      merged_at: new Date(date.getTime() + 3600000).toISOString(),
      merged_by: selectRandom(users),
      merge_commit_sha: `abc${Math.random().toString(36).substring(7)}`,
      head: {
        label: `${COMPANY_DATA.githubOrg}:feature-${prNumber}`,
        ref: `feature-${prNumber}`,
        sha: `def${Math.random().toString(36).substring(7)}`,
        user: users[0],
        repo: null as any,
      },
      base: {
        label: `${COMPANY_DATA.githubOrg}:main`,
        ref: 'main',
        sha: `ghi${Math.random().toString(36).substring(7)}`,
        user: users[0],
        repo: null as any,
      },
      created_at: date.toISOString(),
      updated_at: new Date(date.getTime() + 3600000).toISOString(),
      closed_at: new Date(date.getTime() + 3600000).toISOString(),
      html_url: `https://github.com/${COMPANY_DATA.githubOrg}/${topic.affectedRepo}/pull/${prNumber}`,
      diff_url: `https://github.com/${COMPANY_DATA.githubOrg}/${topic.affectedRepo}/pull/${prNumber}.diff`,
      patch_url: `https://github.com/${COMPANY_DATA.githubOrg}/${topic.affectedRepo}/pull/${prNumber}.patch`,
      commits: Math.floor(Math.random() * 5) + 1,
      additions: Math.floor(Math.random() * 500) + 10,
      deletions: Math.floor(Math.random() * 200) + 5,
      changed_files: Math.floor(Math.random() * 10) + 1,
      author_association: 'CONTRIBUTOR',
      locked: false,
    };
  }

  private async generateSlackArtifact(
    type: string,
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<MessageWithChannel[]> {
    const channel = this.selectChannelForTopic(topic);
    const participants = this.getParticipantsAsUsers(topic.participants);
    const refContext = this.buildReferenceContext(references);

    const prompt = `Generate a Slack conversation about: ${topic.title}

Channel: #${channel.name}
Participants: ${topic.participants.join(', ')}
Context: ${topic.description}

${refContext ? `This discussion references:\n${refContext}` : ''}

Requirements:
${
  references.some((r) => r?.number)
    ? `- Must mention "GitHub issue #${references.find((r) => r?.number)?.number}"`
    : ''
}
${references.some((r) => r?.recording_id) ? '- Should reference "the meeting" or "our call"' : ''}
${
  references.some((r) => r?.url?.includes('notion'))
    ? '- Should link to or mention "the Notion doc/spec"'
    : ''
}
${type === 'urgent-thread' ? '- Urgent tone, production issue' : ''}
- Natural conversation flow
- Mix of short and medium messages
- 4-8 messages total

Return JSON array of messages:
[
  {"user": "name", "text": "message text"},
  ...
]`;

    const response = await generateWithLLM(prompt, this.config);
    const messages = JSON.parse(response);

    const baseTs = date.getTime() / 1000;
    const threadTs = baseTs.toFixed(6);

    return messages.map((msg: any, idx: number) => {
      const user =
        participants.find((p) =>
          p.real_name?.toLowerCase().includes(msg.user.toLowerCase().split(' ')[0]),
        ) || selectRandom(participants);

      return {
        type: 'message',
        user: user.id,
        text: this.injectCrossReferences(msg.text, references),
        ts: (baseTs + idx * 300).toFixed(6), // 5 min apart
        thread_ts: idx === 0 ? undefined : threadTs,
        channel: channel.id,
      } as MessageWithChannel;
    });
  }

  private async generateNotionArtifact(
    type: string,
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<NotionPage> {
    const refContext = this.buildReferenceContext(references);

    const pageTypeMap: Record<string, string> = {
      'spec-page': 'Technical Specification',
      'meeting-notes': 'Meeting Notes',
      'incident-report': 'Incident Report',
      'design-doc': 'Design Document',
      'page-update': 'Updated Specification',
    };

    const prompt = `Generate a Notion ${pageTypeMap[type] || 'Document'} for: ${topic.title}

Context: ${topic.description}
Technical Details: ${topic.technicalDetails}

${refContext ? `This document should reference:\n${refContext}` : ''}

Requirements:
${
  references.some((r) => r?.number)
    ? `- Include a "Related GitHub Issues" section linking to #${
        references.find((r) => r?.number)?.number
      }`
    : ''
}
${references.some((r) => r?.recording_id) ? '- Include "Meeting Reference" section' : ''}
${references.some((r) => r?.thread_ts) ? '- Mention Slack discussion' : ''}
${
  type === 'incident-report'
    ? '- Include Timeline, Root Cause, Resolution, Action Items sections'
    : ''
}
${type === 'meeting-notes' ? '- Include Attendees, Discussion Points, Decisions, Action Items' : ''}
${
  type === 'spec-page' ? '- Include Overview, Requirements, Technical Approach, Open Questions' : ''
}

Return JSON:
{
  "title": "Page title",
  "content": "Full page content with markdown sections"
}`;

    const response = await generateWithLLM(prompt, this.config);
    const parsed = JSON.parse(response);

    return {
      object: 'page',
      id: `notion-${type}-${Date.now()}-${Math.random()}`,
      created_time: date.toISOString(),
      last_edited_time: date.toISOString(),
      created_by: { object: 'user', id: 'notion-user-1' },
      last_edited_by: { object: 'user', id: 'notion-user-1' },
      cover: undefined,
      icon: undefined,
      parent: { type: 'workspace', workspace: true },
      archived: false,
      properties: {
        title: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: parsed.title, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: parsed.title,
              href: null,
            },
          ],
        },
      },
      url: `https://notion.so/${topic.title.replace(/\s+/g, '-').toLowerCase()}`,
      public_url: undefined,
      _content: parsed.content, // Store for block generation
      _references: references.map((r) => r?.id),
    } as any;
  }

  private async generateFathomArtifact(
    type: string,
    topic: WorkflowTopic,
    date: Date,
    references: any[],
  ): Promise<{ meeting: FathomMeeting; transcript: FathomTranscript }> {
    const participants = topic.participants.map((name) => {
      const member = COMPANY_DATA.teamMembers.find((m) => m.name === name);
      return {
        name: member?.name || name,
        email: member?.email || `${name.toLowerCase().replace(' ', '.')}@gragger.com`,
        email_domain: 'gragger.com',
      };
    });

    const meetingTitleMap: Record<string, string> = {
      meeting: 'Team Sync',
      'meeting-mention': 'Sprint Planning',
      'incident-call': 'Incident Response',
      'design-review': 'Design Review',
    };

    const refContext = this.buildReferenceContext(references);
    const meetingDuration = 45; // minutes

    // Generate transcript with explicit cross-references
    const prompt = `Generate a meeting transcript for: ${meetingTitleMap[type] || 'Team Meeting'}

Topic: ${topic.title}
Participants: ${topic.participants.join(', ')}
Context: ${topic.description}

${refContext ? `The meeting discusses:\n${refContext}` : ''}

Requirements:
${
  references.some((r) => r?.number)
    ? `- Someone must say "Looking at GitHub issue ${
        references.find((r) => r?.number)?.number
      }" or "the issue we filed"`
    : ''
}
${
  references.some((r) => r?.thread_ts)
    ? '- Reference "the Slack thread" or "what we discussed in Slack"'
    : ''
}
${
  references.some((r) => r?.url?.includes('notion'))
    ? '- Mention "the Notion doc" or "the spec"'
    : ''
}
${type === 'incident-call' ? '- Urgent tone, troubleshooting a production issue' : ''}
- Natural conversation with technical details
- 10-15 speaking turns
- Mix of updates, questions, and decisions

Format:
[Speaker Name]: What they said

Generate the transcript:`;

    const transcriptResponse = await generateWithLLM(prompt, this.config);
    const recordingId = 3000 + this.artifacts.fathom.meetings.length;

    const meeting: FathomMeeting = {
      title: `${meetingTitleMap[type]} - ${topic.title}`,
      meeting_title: meetingTitleMap[type] || 'Team Meeting',
      recording_id: recordingId,
      url: `https://app.fathom.video/recording/${recordingId}`,
      share_url: `https://app.fathom.video/share/${recordingId}`,
      created_at: date.toISOString(),
      scheduled_start_time: date.toISOString(),
      scheduled_end_time: new Date(date.getTime() + meetingDuration * 60000).toISOString(),
      recording_start_time: new Date(date.getTime() + 2 * 60000).toISOString(),
      recording_end_time: new Date(date.getTime() + (meetingDuration - 5) * 60000).toISOString(),
      calendar_invitees_domains_type: 'all',
      transcript_language: 'en',
      calendar_invitees: participants as FathomCalendarInvitee[],
      recorded_by: {
        name: participants[0].name,
        email: participants[0].email,
        email_domain: participants[0].email_domain,
        team: 'gragger',
      },
    };

    const transcript = this.parseTranscript(
      transcriptResponse,
      meeting,
      participants,
      meetingDuration,
    );

    return { meeting, transcript };
  }

  private parseTranscript(
    transcriptText: string,
    meeting: FathomMeeting,
    participants: any[],
    meetingDuration: number,
  ): FathomTranscript {
    const lines = transcriptText
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    const segments = [];
    const meetingDurationSeconds = meetingDuration * 60;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\[?([^\]]+)\]?:(.+)$/);

      if (match) {
        const speakerName = match[1].trim();
        const text = match[2].trim();

        let speaker = participants.find((p) => p.name === speakerName);
        if (!speaker) {
          speaker = selectRandom(participants);
        }

        // Calculate realistic timestamp based on position in conversation
        const timePerSegment = meetingDurationSeconds / lines.length;
        const secondsFromStart = Math.floor(
          i * timePerSegment + Math.random() * timePerSegment * 0.3,
        );
        const minutes = Math.floor(secondsFromStart / 60);
        const seconds = secondsFromStart % 60;

        segments.push({
          speaker: {
            display_name: speaker.name,
            matched_calendar_invitee_email: speaker.email,
          },
          text: text,
          timestamp: `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        });
      }
    }

    return {
      type: 'transcript',
      recording_id: meeting.recording_id,
      transcripts: segments,
    };
  }

  private buildReferenceContext(references: any[]): string {
    const parts: string[] = [];

    for (const ref of references) {
      if (!ref) continue;

      if (ref.number && ref.title) {
        parts.push(`- GitHub Issue #${ref.number}: "${ref.title}"`);
      }
      if (ref.recording_id) {
        parts.push(`- Meeting: "${ref.meeting_title || ref.title}"`);
      }
      if (ref.thread_ts || ref.type === 'message') {
        parts.push(`- Slack thread discussing: "${ref.text?.substring(0, 100)}..."`);
      }
      if (ref.url?.includes('notion')) {
        const title = ref.properties?.title?.title?.[0]?.plain_text || 'Document';
        parts.push(`- Notion page: "${title}"`);
      }
    }

    return parts.join('\n');
  }

  private injectCrossReferences(text: string, references: any[]): string {
    let result = text;

    for (const ref of references) {
      if (!ref) continue;

      // Inject GitHub issue links
      if (ref.number && ref.html_url) {
        result = result.replace(
          new RegExp(`#${ref.number}\\b`, 'g'),
          `[#${ref.number}](${ref.html_url})`,
        );
      }

      // Inject Notion links
      if (ref.url?.includes('notion')) {
        const title = ref.properties?.title?.title?.[0]?.plain_text;
        if (title && result.toLowerCase().includes('notion')) {
          result = result.replace(/the (notion )?doc(ument)?/gi, `[${title}](${ref.url})`);
        }
      }
    }

    return result;
  }

  private selectChannelForTopic(topic: WorkflowTopic): Channel {
    const categoryChannelMap: Record<string, string[]> = {
      bug: ['engineering', 'backend'],
      feature: ['product', 'engineering'],
      infrastructure: ['backend', 'engineering'],
      design: ['design', 'product'],
      process: ['general', 'engineering'],
    };

    const channelNames = categoryChannelMap[topic.category] || ['engineering'];
    const channelName = selectRandom(channelNames);
    return this.slackChannels.find((c) => c.name === channelName) || this.slackChannels[0];
  }

  private getParticipantsAsUsers(participantNames: string[]): Member[] {
    return participantNames
      .map((name) =>
        this.slackUsers.find((u) => u.real_name?.toLowerCase().includes(name.toLowerCase())),
      )
      .filter(Boolean) as Member[];
  }

  private addToGlobalArtifacts(service: string, type: string, artifact: any): void {
    switch (service) {
      case 'github':
        if (type === 'issue') {
          this.artifacts.github.issues.push(artifact);
        } else if (type === 'pull-request') {
          this.artifacts.github.prs.push(artifact);
        }
        break;
      case 'slack':
        if (Array.isArray(artifact)) {
          this.artifacts.slack.push(...artifact);
        } else {
          this.artifacts.slack.push(artifact);
        }
        break;
      case 'notion':
        this.artifacts.notion.push(artifact);
        break;
      case 'fathom':
        this.artifacts.fathom.meetings.push(artifact.meeting);
        this.artifacts.fathom.transcripts.push(artifact.transcript);
        break;
    }
  }
}
