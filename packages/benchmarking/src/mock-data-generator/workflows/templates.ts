import type { WorkflowTemplate } from "./types.js";

/**
 * Common workflow patterns that occur in real software development teams
 * These create deterministic cross-service connections
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "bug-fix",
    name: "Bug Report → Fix",
    description: "Bug reported, discussed, fixed via PR",
    frequency: 30,
    stages: [
      {
        order: 1,
        service: "github",
        type: "issue",
        delayFromPrevious: { min: 0, max: 0 },
        references: [],
      },
      {
        order: 2,
        service: "slack",
        type: "thread",
        delayFromPrevious: { min: 1, max: 24 },
        references: ["1"], // References the issue
      },
      {
        order: 3,
        service: "fathom",
        type: "meeting-mention",
        delayFromPrevious: { min: 24, max: 72 },
        references: ["1", "2"], // References issue and slack discussion
      },
      {
        order: 4,
        service: "github",
        type: "pull-request",
        delayFromPrevious: { min: 24, max: 168 },
        references: ["1"], // Fixes the issue
      },
      {
        order: 5,
        service: "slack",
        type: "message",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["4"], // Announces the PR
      },
    ],
  },
  {
    id: "feature-development",
    name: "Feature Spec → Implementation",
    description: "Feature discussed, documented, implemented",
    frequency: 25,
    stages: [
      {
        order: 1,
        service: "slack",
        type: "thread",
        delayFromPrevious: { min: 0, max: 0 },
        references: [],
      },
      {
        order: 2,
        service: "fathom",
        type: "meeting",
        delayFromPrevious: { min: 24, max: 72 },
        references: ["1"],
      },
      {
        order: 3,
        service: "notion",
        type: "spec-page",
        delayFromPrevious: { min: 4, max: 48 },
        references: ["1", "2"],
      },
      {
        order: 4,
        service: "github",
        type: "issue",
        delayFromPrevious: { min: 1, max: 24 },
        references: ["3"], // Links to Notion spec
      },
      {
        order: 5,
        service: "slack",
        type: "message",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["3", "4"], // Shares spec and issue
      },
      {
        order: 6,
        service: "github",
        type: "pull-request",
        delayFromPrevious: { min: 48, max: 336 },
        references: ["4"], // Implements the issue
      },
    ],
  },
  {
    id: "meeting-followup",
    name: "Meeting → Documentation → Actions",
    description: "Meeting held, notes taken, actions tracked",
    frequency: 20,
    stages: [
      {
        order: 1,
        service: "slack",
        type: "message",
        delayFromPrevious: { min: 0, max: 0 },
        references: [],
      },
      {
        order: 2,
        service: "fathom",
        type: "meeting",
        delayFromPrevious: { min: 1, max: 48 },
        references: ["1"],
      },
      {
        order: 3,
        service: "notion",
        type: "meeting-notes",
        delayFromPrevious: { min: 1, max: 24 },
        references: ["2"],
      },
      {
        order: 4,
        service: "slack",
        type: "thread",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["2", "3"], // Shares meeting notes
      },
      {
        order: 5,
        service: "github",
        type: "issue",
        delayFromPrevious: { min: 4, max: 48 },
        references: ["2", "3"], // Action item from meeting
      },
    ],
  },
  {
    id: "incident-response",
    name: "Incident → Investigation → Resolution",
    description: "Production incident handled across all channels",
    frequency: 10,
    stages: [
      {
        order: 1,
        service: "slack",
        type: "urgent-thread",
        delayFromPrevious: { min: 0, max: 0 },
        references: [],
      },
      {
        order: 2,
        service: "fathom",
        type: "incident-call",
        delayFromPrevious: { min: 0, max: 2 },
        references: ["1"],
      },
      {
        order: 3,
        service: "github",
        type: "issue",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["1", "2"],
      },
      {
        order: 4,
        service: "github",
        type: "pull-request",
        delayFromPrevious: { min: 2, max: 24 },
        references: ["3"],
      },
      {
        order: 5,
        service: "notion",
        type: "incident-report",
        delayFromPrevious: { min: 24, max: 72 },
        references: ["1", "2", "3", "4"],
      },
      {
        order: 6,
        service: "slack",
        type: "message",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["5"], // Shares postmortem
      },
    ],
  },
  {
    id: "design-review",
    name: "Design → Feedback → Implementation",
    description: "Design shared, discussed, implemented",
    frequency: 15,
    stages: [
      {
        order: 1,
        service: "notion",
        type: "design-doc",
        delayFromPrevious: { min: 0, max: 0 },
        references: [],
      },
      {
        order: 2,
        service: "slack",
        type: "thread",
        delayFromPrevious: { min: 1, max: 4 },
        references: ["1"],
      },
      {
        order: 3,
        service: "fathom",
        type: "design-review",
        delayFromPrevious: { min: 24, max: 120 },
        references: ["1", "2"],
      },
      {
        order: 4,
        service: "notion",
        type: "page-update",
        delayFromPrevious: { min: 4, max: 24 },
        references: ["1", "3"], // Updates based on feedback
      },
      {
        order: 5,
        service: "github",
        type: "issue",
        delayFromPrevious: { min: 1, max: 48 },
        references: ["1", "4"],
      },
    ],
  },
];
