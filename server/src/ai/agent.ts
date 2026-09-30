import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env';

/**
 * AI Agent Core — MCP-Style Tool-Use Architecture
 * 
 * The AI agent has access to structured tools that interact with the system.
 * Key principle: AI suggests, humans decide.
 * 
 * Graceful degradation: If no API key or API failure, 
 * all AI features simply don't appear. Core CRUD works perfectly.
 */

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!config.GEMINI_API_KEY) {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

export function isAIAvailable(): boolean {
  return !!config.GEMINI_API_KEY;
}

/**
 * Tool: Classify Item
 * Analyzes work item content and suggests type, priority, and tags
 */
export async function classifyItem(title: string, description: string): Promise<{
  suggestedPriority: string;
  priorityReason: string;
  suggestedType: string;
  typeReason: string;
  suggestedTags: string[];
  urgencyScore: number;
  summary: string;
} | null> {
  const ai = getModel();
  if (!ai) return null;

  try {
    const prompt = `You are an operations triage agent. Analyze this work item and provide classification.

Title: ${title}
Description: ${description}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "suggestedPriority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "priorityReason": "Brief explanation of priority assessment",
  "suggestedType": "INCIDENT" | "CUSTOMER_ISSUE" | "TASK" | "INVESTIGATION" | "COMPLIANCE" | "APPROVAL",
  "typeReason": "Brief explanation of type classification",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "urgencyScore": 1-10,
  "summary": "One-sentence summary of what this item is about"
}`;

    const result = await ai.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Clean any markdown formatting
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('[AI Agent] Classification failed:', error);
    return null;
  }
}

/**
 * Tool: Suggest Assignee
 * Based on item content and team member expertise
 */
export async function suggestAssignee(
  title: string,
  description: string,
  teamMembers: { id: string; displayName: string; role: string }[]
): Promise<{ suggestedId: string; reason: string } | null> {
  const ai = getModel();
  if (!ai || teamMembers.length === 0) return null;

  try {
    const membersStr = teamMembers
      .map((m) => `- ${m.displayName} (${m.role})`)
      .join('\n');

    const prompt = `Given this work item, suggest the best person to assign it to.

Title: ${title}
Description: ${description}

Team Members:
${membersStr}

Respond ONLY with valid JSON:
{
  "suggestedName": "Display name of the suggested person",
  "reason": "Brief reason for this suggestion"
}`;

    const result = await ai.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Find the matching member
    const match = teamMembers.find(
      (m) => m.displayName.toLowerCase() === parsed.suggestedName?.toLowerCase()
    );

    if (match) {
      return { suggestedId: match.id, reason: parsed.reason };
    }
    return null;
  } catch (error) {
    console.error('[AI Agent] Assignee suggestion failed:', error);
    return null;
  }
}

/**
 * Tool: Summarize History
 * Creates a concise summary of a work item's history
 */
export async function summarizeHistory(
  title: string,
  description: string,
  activities: { action: string; user: string; detail: string; date: string }[],
  comments: { author: string; content: string; date: string }[]
): Promise<string | null> {
  const ai = getModel();
  if (!ai) return null;

  try {
    const activityStr = activities
      .map((a) => `[${a.date}] ${a.user}: ${a.action} ${a.detail}`)
      .join('\n');

    const commentStr = comments
      .map((c) => `[${c.date}] ${c.author}: ${c.content}`)
      .join('\n');

    const prompt = `Summarize this work item's complete history concisely (3-5 bullet points).
Focus on: key decisions, ownership changes, current status, and what needs to happen next.

Title: ${title}
Description: ${description}

Activity Log:
${activityStr || 'No activity yet'}

Comments:
${commentStr || 'No comments yet'}

Respond with a plain text summary using bullet points (•).`;

    const result = await ai.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('[AI Agent] Summary failed:', error);
    return null;
  }
}

/**
 * Tool: Find Similar (text-based fallback when embeddings unavailable)
 */
export async function findSimilarByText(
  title: string,
  description: string,
  existingItems: { id: string; identifier: string; title: string; description: string }[]
): Promise<{ id: string; identifier: string; title: string; similarity: string }[]> {
  const ai = getModel();
  if (!ai || existingItems.length === 0) return [];

  try {
    const itemsList = existingItems
      .slice(0, 20) // Limit context window usage
      .map((item) => `ID: ${item.id} | ${item.identifier} | ${item.title}`)
      .join('\n');

    const prompt = `Given this new work item, find similar existing items from the list.

New Item:
Title: ${title}
Description: ${description}

Existing Items:
${itemsList}

Respond ONLY with valid JSON array of similar items (empty array if none are similar):
[{"id": "item-id", "identifier": "OPS-XXXX", "title": "title", "similarity": "high|medium"}]

Only include items that are genuinely similar (same problem, duplicate report, related issue).`;

    const result = await ai.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('[AI Agent] Similarity search failed:', error);
    return [];
  }
}
