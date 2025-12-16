import type {
  GitHubIssue,
  GitHubPullRequest,
  NotionPage,
  FathomMeeting,
  FathomTranscript,
  FathomSummary,
} from "@ebee-oss/shared-util";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse.js";

// Extended MessageElement with channel tracking
interface MessageWithChannel extends MessageElement {
  channel?: string;
  reactions?: Array<{
    name: string;
    users: string[];
    count: number;
  }>;
}

/**
 * Represents a cohesive group of related work across services
 */
export interface WorkflowGroup {
  groupId: string;
  title: string; // Human-readable title
  description: string; // What this group is about
  timeline: {
    startDate: string;
    endDate: string;
  };
  // All related records grouped together
  records: {
    githubIssues: GitHubIssue[];
    githubPRs: GitHubPullRequest[];
    notionPages: NotionPage[];
    fathomMeetings: FathomMeeting[];
    fathomTranscripts: FathomTranscript[];
    fathomSummaries: FathomSummary[];
    slackThreads: SlackThread[];
  };
  // Cross-references between records
  crossReferences: {
    type: string; // e.g., "github-issue-to-slack", "slack-to-notion"
    from: string; // ID of source record
    to: string; // ID of target record
    context: string; // Where/how the reference appears
  }[];
  // Metrics for this group
  metrics: {
    totalRecords: number;
    totalMessages: number;
    participantCount: number;
    servicesCovered: string[];
  };
}

/**
 * Slack thread with all its messages
 */
export interface SlackThread {
  threadId: string; // thread_ts
  channel: string;
  parentMessage: MessageElement;
  replies: MessageElement[];
  totalMessages: number;
}

/**
 * Shared/standalone records
 */
export interface SharedResources {
  // People
  users: {
    github: any[];
    slack: any[];
    notion: any[];
    fathom: any[];
  };
  // Infrastructure
  infrastructure: {
    slackChannels: any[];
    githubRepositories: any[];
    notionDatabases: any[];
    fathomTeams: any[];
  };
  // Standalone items (not part of any workflow)
  standalone: {
    slackMessages: MessageElement[]; // Messages not in threads or groups
    slackThreads: SlackThread[]; // Threads without cross-references
  };
}

/**
 * New grouped output format
 */
export interface GroupedOutputV2 {
  metadata: {
    generatedAt: string;
    version: string;
    summary: {
      totalWorkflows: number;
      totalRecordsInWorkflows: number;
      totalStandaloneRecords: number;
      servicesCovered: string[];
    };
  };
  // Main workflow groups - related work across services
  workflows: WorkflowGroup[];
  // Shared resources used across workflows
  shared: SharedResources;
}

/**
 * Extract meeting title from various sources
 */
function extractMeetingTitle(text: string): string | null {
  const meetingTypes = [
    "Sprint Review",
    "Sprint Planning",
    "Sprint Retrospective",
    "Daily Standup",
    "Product Review",
    "Architecture Discussion",
    "1:1 Meeting",
    "Team Sync",
  ];

  for (const type of meetingTypes) {
    if (text.includes(type)) {
      return type;
    }
  }

  return null;
}

/**
 * Group Slack messages into threads
 */
function groupSlackThreads(
  messages: MessageElement[]
): Map<string, SlackThread> {
  const threads = new Map<string, SlackThread>();

  // Group by thread_ts or ts
  for (const msg of messages) {
    const threadTs = msg.thread_ts || msg.ts;
    if (!threadTs) continue;

    // Cast to any to access channel property
    const msgWithChannel = msg as any;

    if (!threads.has(threadTs)) {
      threads.set(threadTs, {
        threadId: threadTs,
        channel: msgWithChannel.channel || "",
        parentMessage: msg,
        replies: [],
        totalMessages: 0,
      });
    }

    const thread = threads.get(threadTs)!;
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      // This is a reply
      thread.replies.push(msg);
    } else if (!msg.thread_ts) {
      // This is a parent message (no thread_ts)
      thread.parentMessage = msg;
    }
    thread.totalMessages++;
  }

  return threads;
}

/**
 * Extract all cross-references from a record
 */
function extractCrossReferences(
  record: any,
  recordId: string,
  recordType: string
): {
  githubIssues: string[];
  githubPRs: string[];
  notionPages: string[];
  fathomMeetings: string[];
} {
  const content = JSON.stringify(record);
  const refs = {
    githubIssues: [] as string[],
    githubPRs: [] as string[],
    notionPages: [] as string[],
    fathomMeetings: [] as string[],
  };

  // GitHub issue references (#123)
  const issueMatches = content.match(/#(\d+)/g);
  if (issueMatches) {
    refs.githubIssues = [...new Set(issueMatches.map((m) => m.slice(1)))];
  }

  // GitHub PR references (PR #123, pull request #123)
  const prMatches = content.match(/(?:PR|pull request)\s*#?(\d+)/gi);
  if (prMatches) {
    refs.githubPRs = [
      ...new Set(
        prMatches
          .map((m) => {
            const num = m.match(/\d+/)?.[0];
            return num || "";
          })
          .filter(Boolean)
      ),
    ];
  }

  // Notion page references (notion.so/xxx)
  const notionMatches = content.match(/notion\.so\/(\d+)/g);
  if (notionMatches) {
    refs.notionPages = [
      ...new Set(
        notionMatches
          .map((m) => {
            const id = m.match(/notion\.so\/(\d+)/)?.[1];
            return id || "";
          })
          .filter(Boolean)
      ),
    ];
  }

  // Fathom meeting references (by title)
  const meetingTitle = extractMeetingTitle(content);
  if (meetingTitle) {
    refs.fathomMeetings.push(meetingTitle);
  }

  return refs;
}

/**
 * Create workflow groups from records
 */
export function createGroupedOutput(combined: {
  github: {
    issues: GitHubIssue[];
    pullRequests: GitHubPullRequest[];
    user: any;
    organizationMembers: any[];
    repositories: any[];
  };
  slack: {
    messages: MessageElement[];
    channels: any[];
    users: any[];
  };
  notion: {
    pages: NotionPage[];
    users: any[];
    databases: any[];
    blocks: Map<string, any[]> | any[];
  };
  fathom: {
    meetings: FathomMeeting[];
    teams: any[];
    teamMembers: any[];
    transcripts: FathomTranscript[];
    summaries: FathomSummary[];
  };
}): GroupedOutputV2 {
  console.log("🔗 Creating improved grouped output format (v2)...");

  const workflows: WorkflowGroup[] = [];
  const usedRecords = new Set<string>();
  const slackThreads = groupSlackThreads(combined.slack.messages);

  // Index records for quick lookup
  const issuesByNumber = new Map(
    combined.github.issues.map((i) => [i.number.toString(), i])
  );
  const prsByNumber = new Map(
    combined.github.pullRequests.map((pr) => [pr.number.toString(), pr])
  );
  const notionPagesById = new Map(combined.notion.pages.map((p) => [p.id, p]));
  const meetingsByTitle = new Map<string, FathomMeeting>();
  for (const meeting of combined.fathom.meetings) {
    const titlePart = meeting.meeting_title || meeting.title;
    if (titlePart) {
      meetingsByTitle.set(titlePart, meeting);
    }
  }
  const meetingsById = new Map(
    combined.fathom.meetings.map((m) => [m.recording_id, m])
  );
  const transcriptsById = new Map(
    combined.fathom.transcripts.map((t) => [t.recording_id, t])
  );
  const summariesById = new Map(
    combined.fathom.summaries.map((s) => [s.recording_id, s])
  );

  // Strategy: Start with GitHub issues as anchors, then expand
  for (const issue of combined.github.issues) {
    const groupId = `workflow-issue-${issue.number}`;
    if (usedRecords.has(`issue-${issue.number}`)) continue;

    const group: WorkflowGroup = {
      groupId,
      title: issue.title,
      description: `GitHub Issue #${issue.number}`,
      timeline: {
        startDate: issue.created_at,
        endDate: issue.updated_at,
      },
      records: {
        githubIssues: [issue],
        githubPRs: [],
        notionPages: [],
        fathomMeetings: [],
        fathomTranscripts: [],
        fathomSummaries: [],
        slackThreads: [],
      },
      crossReferences: [],
      metrics: {
        totalRecords: 1,
        totalMessages: 0,
        participantCount: 0,
        servicesCovered: ["github"],
      },
    };

    usedRecords.add(`issue-${issue.number}`);

    // Find related PRs (that mention this issue)
    for (const pr of combined.github.pullRequests) {
      const refs = extractCrossReferences(pr, pr.number.toString(), "pr");
      if (refs.githubIssues.includes(issue.number.toString())) {
        group.records.githubPRs.push(pr);
        usedRecords.add(`pr-${pr.number}`);
        group.crossReferences.push({
          type: "pr-to-issue",
          from: `pr-${pr.number}`,
          to: `issue-${issue.number}`,
          context: "PR references issue in body",
        });
      }
    }

    // Find related Slack threads (that mention this issue)
    for (const [threadId, thread] of slackThreads) {
      const allMessages = [thread.parentMessage, ...thread.replies];
      const hasReference = allMessages.some((msg) => {
        const refs = extractCrossReferences(msg, msg.ts || "", "slack");
        return refs.githubIssues.includes(issue.number.toString());
      });

      if (hasReference) {
        group.records.slackThreads.push(thread);
        group.metrics.totalMessages += thread.totalMessages;
        usedRecords.add(`slack-thread-${threadId}`);
        group.crossReferences.push({
          type: "slack-to-issue",
          from: `slack-thread-${threadId}`,
          to: `issue-${issue.number}`,
          context: `Slack thread mentions issue #${issue.number}`,
        });
      }
    }

    // Find related Notion pages (that mention this issue)
    for (const page of combined.notion.pages) {
      const refs = extractCrossReferences(page, page.id, "notion");
      if (refs.githubIssues.includes(issue.number.toString())) {
        group.records.notionPages.push(page);
        usedRecords.add(`notion-${page.id}`);
        group.crossReferences.push({
          type: "notion-to-issue",
          from: `notion-${page.id}`,
          to: `issue-${issue.number}`,
          context: "Notion page references issue",
        });
      }
    }

    // Find related Fathom meetings (that mention this issue in transcript/summary)
    for (const meeting of combined.fathom.meetings) {
      const transcript = transcriptsById.get(meeting.recording_id);
      const summary = summariesById.get(meeting.recording_id);

      const meetingContent = JSON.stringify({ meeting, transcript, summary });
      const refs = extractCrossReferences(
        { content: meetingContent },
        meeting.recording_id.toString(),
        "meeting"
      );

      if (refs.githubIssues.includes(issue.number.toString())) {
        group.records.fathomMeetings.push(meeting);
        if (transcript) group.records.fathomTranscripts.push(transcript);
        if (summary) group.records.fathomSummaries.push(summary);
        usedRecords.add(`meeting-${meeting.recording_id}`);
        group.crossReferences.push({
          type: "meeting-to-issue",
          from: `meeting-${meeting.recording_id}`,
          to: `issue-${issue.number}`,
          context: "Meeting discusses issue",
        });
      }
    }

    // Update metrics
    group.metrics.totalRecords =
      group.records.githubIssues.length +
      group.records.githubPRs.length +
      group.records.notionPages.length +
      group.records.fathomMeetings.length +
      group.records.slackThreads.length;

    const services = new Set<string>(["github"]);
    if (group.records.githubPRs.length > 0) services.add("github-pr");
    if (group.records.slackThreads.length > 0) services.add("slack");
    if (group.records.notionPages.length > 0) services.add("notion");
    if (group.records.fathomMeetings.length > 0) services.add("fathom");
    group.metrics.servicesCovered = Array.from(services);

    // Calculate participants
    const participants = new Set<string>();
    group.records.slackThreads.forEach((t) => {
      [t.parentMessage, ...t.replies].forEach((m) => {
        if (m.user) participants.add(m.user);
      });
    });
    group.metrics.participantCount = participants.size;

    // Update timeline
    const dates: Date[] = [new Date(issue.created_at)];
    group.records.slackThreads.forEach((t) => {
      if (t.parentMessage.ts) {
        dates.push(new Date(parseFloat(t.parentMessage.ts) * 1000));
      }
    });
    group.records.fathomMeetings.forEach((m) => {
      dates.push(new Date(m.created_at));
    });
    group.records.notionPages.forEach((p) => {
      dates.push(new Date(p.created_time));
    });

    if (dates.length > 0) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      group.timeline.startDate = dates[0].toISOString();
      group.timeline.endDate = dates[dates.length - 1].toISOString();
    }

    // Only add if there are cross-references
    if (group.crossReferences.length > 0) {
      workflows.push(group);
    }
  }

  // Strategy: Create groups for Fathom meetings with Slack discussions
  for (const meeting of combined.fathom.meetings) {
    if (usedRecords.has(`meeting-${meeting.recording_id}`)) continue;

    const transcript = transcriptsById.get(meeting.recording_id);
    const summary = summariesById.get(meeting.recording_id);
    const meetingTitle = meeting.meeting_title || meeting.title;

    // Find related Slack threads discussing this meeting
    const relatedThreads: SlackThread[] = [];
    for (const [threadId, thread] of slackThreads) {
      if (usedRecords.has(`slack-thread-${threadId}`)) continue;

      const allMessages = [thread.parentMessage, ...thread.replies];
      const discussesMeeting = allMessages.some((msg) => {
        const text = msg.text || "";
        return meetingTitle && text.includes(meetingTitle);
      });

      if (discussesMeeting) {
        relatedThreads.push(thread);
        usedRecords.add(`slack-thread-${threadId}`);
      }
    }

    // Only create group if there's a Slack discussion
    if (relatedThreads.length > 0) {
      const groupId = `workflow-meeting-${meeting.recording_id}`;
      const group: WorkflowGroup = {
        groupId,
        title: meetingTitle,
        description: `Meeting: ${meetingTitle}`,
        timeline: {
          startDate: meeting.created_at,
          endDate: meeting.created_at,
        },
        records: {
          githubIssues: [],
          githubPRs: [],
          notionPages: [],
          fathomMeetings: [meeting],
          fathomTranscripts: transcript ? [transcript] : [],
          fathomSummaries: summary ? [summary] : [],
          slackThreads: relatedThreads,
        },
        crossReferences: relatedThreads.map((t) => ({
          type: "slack-to-meeting",
          from: `slack-thread-${t.threadId}`,
          to: `meeting-${meeting.recording_id}`,
          context: `Slack discussion about ${meetingTitle}`,
        })),
        metrics: {
          totalRecords: 1 + relatedThreads.length,
          totalMessages: relatedThreads.reduce(
            (sum, t) => sum + t.totalMessages,
            0
          ),
          participantCount: 0,
          servicesCovered: ["fathom", "slack"],
        },
      };

      usedRecords.add(`meeting-${meeting.recording_id}`);

      // Calculate participants
      const participants = new Set<string>();
      relatedThreads.forEach((t) => {
        [t.parentMessage, ...t.replies].forEach((m) => {
          if (m.user) participants.add(m.user);
        });
      });
      group.metrics.participantCount = participants.size;

      workflows.push(group);
    }
  }

  // Strategy: Create groups for Notion pages with Slack discussions
  for (const page of combined.notion.pages) {
    if (usedRecords.has(`notion-${page.id}`)) continue;

    // Find related Slack threads sharing/discussing this Notion page
    const relatedThreads: SlackThread[] = [];
    for (const [threadId, thread] of slackThreads) {
      if (usedRecords.has(`slack-thread-${threadId}`)) continue;

      const allMessages = [thread.parentMessage, ...thread.replies];
      const referencesPage = allMessages.some((msg) => {
        const refs = extractCrossReferences(msg, msg.ts || "", "slack");
        return (
          refs.notionPages.includes(page.id) ||
          (msg.text || "").includes(page.url) ||
          (msg.text || "").includes(
            page.properties?.title?.title?.[0]?.plain_text || ""
          )
        );
      });

      if (referencesPage) {
        relatedThreads.push(thread);
        usedRecords.add(`slack-thread-${threadId}`);
      }
    }

    // Only create group if there's a Slack discussion
    if (relatedThreads.length > 0) {
      const groupId = `workflow-notion-${page.id}`;
      const pageTitle =
        page.properties?.title?.title?.[0]?.plain_text || "Untitled";

      const group: WorkflowGroup = {
        groupId,
        title: pageTitle,
        description: `Notion Page: ${pageTitle}`,
        timeline: {
          startDate: page.created_time,
          endDate: page.last_edited_time,
        },
        records: {
          githubIssues: [],
          githubPRs: [],
          notionPages: [page],
          fathomMeetings: [],
          fathomTranscripts: [],
          fathomSummaries: [],
          slackThreads: relatedThreads,
        },
        crossReferences: relatedThreads.map((t) => ({
          type: "slack-to-notion",
          from: `slack-thread-${t.threadId}`,
          to: `notion-${page.id}`,
          context: `Slack discussion about ${pageTitle}`,
        })),
        metrics: {
          totalRecords: 1 + relatedThreads.length,
          totalMessages: relatedThreads.reduce(
            (sum, t) => sum + t.totalMessages,
            0
          ),
          participantCount: 0,
          servicesCovered: ["notion", "slack"],
        },
      };

      usedRecords.add(`notion-${page.id}`);

      // Calculate participants
      const participants = new Set<string>();
      relatedThreads.forEach((t) => {
        [t.parentMessage, ...t.replies].forEach((m) => {
          if (m.user) participants.add(m.user);
        });
      });
      group.metrics.participantCount = participants.size;

      workflows.push(group);
    }
  }

  // Sort workflows by number of cross-references (most connected first)
  workflows.sort((a, b) => b.crossReferences.length - a.crossReferences.length);

  // Create shared resources
  const standaloneThreads: SlackThread[] = [];
  const standaloneMessages: MessageElement[] = [];

  for (const [threadId, thread] of slackThreads) {
    if (!usedRecords.has(`slack-thread-${threadId}`)) {
      if (thread.totalMessages > 1) {
        standaloneThreads.push(thread);
      } else {
        standaloneMessages.push(thread.parentMessage);
      }
    }
  }

  const shared: SharedResources = {
    users: {
      github: [combined.github.user, ...combined.github.organizationMembers],
      slack: combined.slack.users,
      notion: combined.notion.users,
      fathom: combined.fathom.teamMembers,
    },
    infrastructure: {
      slackChannels: combined.slack.channels,
      githubRepositories: combined.github.repositories,
      notionDatabases: combined.notion.databases,
      fathomTeams: combined.fathom.teams,
    },
    standalone: {
      slackMessages: standaloneMessages,
      slackThreads: standaloneThreads,
    },
  };

  const totalRecordsInWorkflows = workflows.reduce(
    (sum, w) => sum + w.metrics.totalRecords,
    0
  );
  const totalStandaloneRecords =
    standaloneMessages.length + standaloneThreads.length;

  const allServices = new Set<string>();
  workflows.forEach((w) =>
    w.metrics.servicesCovered.forEach((s) => allServices.add(s))
  );

  console.log(`✅ Created ${workflows.length} workflow groups`);
  console.log(`✅ ${totalRecordsInWorkflows} records in workflows`);
  console.log(`✅ ${standaloneThreads.length} standalone threads`);
  console.log(`✅ ${standaloneMessages.length} standalone messages`);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "2.0",
      summary: {
        totalWorkflows: workflows.length,
        totalRecordsInWorkflows,
        totalStandaloneRecords,
        servicesCovered: Array.from(allServices),
      },
    },
    workflows,
    shared,
  };
}
