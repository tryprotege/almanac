import "dotenv/config";

import fs from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schema for validating generated test queries
const QueryGenerationSchema = z.object({
  testCases: z
    .array(
      z.object({
        query: z.string().describe("The search query to test"),
        evaluationCriteria: z.object({
          mustInclude: z
            .array(z.string())
            .describe("Key facts, names or details that must be in the answer"),
        }),
      })
    )
    .length(3)
    .describe("Exactly 3 test cases per group"),
});

const QUERY_SCHEMA = zodToJsonSchema(QueryGenerationSchema, {
  target: "openAi",
});

const SYSTEM_PROMPT = `You are an expert test query generator for AI agent benchmarking. Create realistic, specific queries for searching large datasets (100+ meetings, 1000+ messages).

CRITICAL RULES:
- Generate EXACTLY 3 queries per group
- Each query MUST include 2-3 specific identifiers: full names, metrics, technical terms, or unique IDs
- Queries must be specific enough to avoid ambiguous matches in large datasets
- For each query, provide comprehensive evaluation criteria that can be used to assess AI agent responses
- Output valid JSON matching the provided schema

QUERY EXAMPLES:
✅ "What did Priya Patel commit to in the GRagger retrospective on December 10th, 2025 regarding texture atlases?"
✅ "What frame rate did Taylor Morgan mention during the Unity ECS discussion?"

EVALUATION CRITERIA GUIDELINES:
- mustInclude: Specific facts, names, metrics, or decisions that MUST appear in a correct answer
- mustNotInclude: Common misconceptions, unrelated information, or facts from other contexts
- acceptableVariations: Alternative phrasings, synonyms, or equivalent expressions
- contextRequirements: The level of understanding the agent should demonstrate (e.g., "understand the relationship between X and Y", "recognize the urgency of the issue")

BAD EXAMPLES:
❌ "What did Priya say?" (too vague)
❌ "Action items?" (no context)`;

const generateUserPrompt = (
  data: any
) => `Generate EXACTLY 3 specific test queries with comprehensive evaluation criteria from the data below.

QUERY DISTRIBUTION REQUIREMENTS:
- Query types: Mix of factual, analytical, temporal, action-item, and cross-source queries
- Complexity: 1 simple, 1 medium, 1 complex
- Ensure queries span different aspects of the workflow data

EVALUATION CRITERIA REQUIREMENTS:
For each query, you must provide:
- mustInclude: 3-5 specific facts/details that must be present

DATA:
${JSON.stringify(data, null, 2)}`;

const main = async () => {
  const dataPath = path.join(
    __dirname,
    "../../benchmarking/output/combined/grouped.json"
  );

  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found at ${dataPath}`);
    process.exit(1);
  }

  // Load grouped workflow data
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const LLM_API_KEY = process.env.LLM_API_KEY;
  const LLM_BASE_URL = process.env.LLM_BASE_URL;

  const LLM_CHAT_MODEL = "x-ai/grok-4.1-fast";

  // Initialize OpenAI client
  const llm = new OpenAI({
    baseURL: LLM_BASE_URL,
    apiKey: LLM_API_KEY,
  });

  // Filter workflows that have Slack threads + at least one other data source
  const groups = data.workflows.filter(
    (w: any) =>
      w.records.slackThreads.length &&
      (w.records.fathomTranscripts.length ||
        w.records.githubPRs.length ||
        w.records.notionPages.length)
  );

  // Randomly select 5 groups
  const shuffled = [...groups].sort(() => Math.random() - 0.5);
  const selectedGroups = shuffled.slice(0, Math.min(5, groups.length));

  console.log(
    `Found ${groups.length} workflow groups, randomly selected ${selectedGroups.length}`
  );

  const allGroups: any[] = [];

  // Process selected groups sequentially to avoid rate limiting
  for (let index = 0; index < selectedGroups.length; index++) {
    const g = selectedGroups[index];
    console.log(`\nProcessing group ${index + 1}/${selectedGroups.length}...`);

    // Inject workflow data into prompt template
    const userPrompt = generateUserPrompt(g.records);

    try {
      // Generate test queries using LLM with structured output
      const response = await llm.chat.completions.create({
        model: LLM_CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "query_generation",
            strict: true,
            schema: QUERY_SCHEMA,
          },
        },
      });

      const content = response.choices[0].message.content;
      const parsedResult = JSON.parse(content || "{}");

      // Validate exactly 3 queries were generated
      if (!parsedResult.testCases || parsedResult.testCases.length !== 3) {
        console.error(
          `⚠️  Group ${index + 1} did not generate exactly 3 queries, got ${
            parsedResult.testCases?.length || 0
          }`
        );
        continue;
      }

      // Package test cases with workflow ID
      const testCases = {
        workflow: g,
        testCases: parsedResult.testCases,
      };

      allGroups.push(testCases);
      console.log(`✅ Generated 3 queries for group ${index + 1}`);
    } catch (err) {
      console.error(
        `❌ Failed to generate queries for group ${index + 1}:`,
        err
      );
    }
  }

  // Save all groups with queries to file
  const outputPath = path.join(__dirname, "../generated-queries.json");
  fs.writeFileSync(outputPath, JSON.stringify(allGroups, null, 2));

  console.log(`\n✅ Generated queries for ${allGroups.length} workflow groups`);
  console.log(`📁 Saved to: ${outputPath}`);
  console.log(
    `\n📊 Total test cases: ${allGroups.reduce(
      (sum, g) => sum + g.testCases.length,
      0
    )}`
  );
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
