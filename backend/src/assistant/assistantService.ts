import Anthropic from '@anthropic-ai/sdk';
import { DEPARTMENT_NAMES, JOB_TITLES } from '../domain/reference';
import type { Country } from '../domain/types';
import { analyticsQuerySchema, type AnalyticsExecutor, type AnalyticsResult } from './analytics';
import { parseQuestion, SUPPORTED_QUESTIONS } from './ruleParser';

export interface AssistantAnswer {
  answer: string;
  /** verified results, straight from the analytics queries — the UI renders these as tables/charts */
  results: AnalyticsResult[];
  engine: 'claude' | 'rules';
  suggestions?: string[];
}

/** The slice of the SDK we use — lets tests inject a scripted client. */
export interface MessagesClient {
  beta: { messages: { create: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } };
}

const MAX_TOOL_ROUNDS = 4;

function filterProps(countryCodes: string[]) {
  return {
    country: { type: 'string', enum: countryCodes, description: 'ISO country code' },
    department: { type: 'string', enum: [...DEPARTMENT_NAMES] },
    jobTitle: { type: 'string', enum: [...JOB_TITLES], description: 'Designation' },
  };
}

/** One strict tool per vetted query; enums mean the model cannot invent countries, titles or SQL. */
export function buildTools(countryCodes: string[]): Anthropic.Beta.BetaTool[] {
  const filter = {
    type: 'object',
    description: 'Optional scope. Omit fields that the question does not restrict.',
    properties: filterProps(countryCodes),
    additionalProperties: false,
  };
  return [
    {
      name: 'pay_summary',
      description: 'Headcount, median and average base salary, average gross pay and total payroll (USD) for active employees in an optional scope.',
      strict: true,
      input_schema: { type: 'object', properties: { filter }, required: [], additionalProperties: false },
    },
    {
      name: 'pay_breakdown',
      description:
        'Compare groups (country, department or jobTitle) by a metric: median/average/max/min base salary (USD), payroll = total gross pay (USD), or headcount. Use for "which X has the highest…", "by country" and comparisons.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          by: { type: 'string', enum: ['country', 'department', 'jobTitle'] },
          metric: { type: 'string', enum: ['median', 'average', 'payroll', 'headcount', 'max', 'min'] },
          order: { type: 'string', enum: ['desc', 'asc'] },
          limit: { type: 'integer', description: '1-30; omit for all groups' },
          filter,
        },
        required: ['by', 'metric', 'order'],
        additionalProperties: false,
      },
    },
    {
      name: 'top_earners',
      description: 'Highest-paid active employees by annual gross pay converted to USD, in an optional scope.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: '1-50, default 10' }, filter },
        required: [],
        additionalProperties: false,
      },
    },
    {
      name: 'pay_band',
      description: 'Base-salary band (min, p25, median, p75, max) in local currency for one job title in one country.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { country: { type: 'string', enum: countryCodes }, jobTitle: { type: 'string', enum: [...JOB_TITLES] } },
        required: ['country', 'jobTitle'],
        additionalProperties: false,
      },
    },
    {
      name: 'salary_distribution',
      description: 'Histogram of base salaries (USD, $20K bands) in an optional scope.',
      strict: true,
      input_schema: { type: 'object', properties: { filter }, required: [], additionalProperties: false },
    },
  ];
}

const TOOL_KIND: Record<string, string> = {
  pay_summary: 'summary',
  pay_breakdown: 'breakdown',
  top_earners: 'top_earners',
  pay_band: 'benchmark',
  salary_distribution: 'distribution',
};

const SYSTEM_PROMPT = `You are ACME's compensation analyst assistant for HR managers.
Answer questions about how ACME pays its active employees by calling the provided analytics tools.
Rules:
- Every number in your answer must come from a tool result in this conversation. Never estimate, extrapolate or recall figures.
- If the tools cannot answer the question (e.g. it is about individuals' private details, future predictions, or data we don't hold), say so briefly and suggest a question the tools can answer.
- Base salary is "salary"; gross pay = base + allowances + bonus; payroll = total gross pay. Cross-country figures are in USD at budget FX rates.
- Reply in 1-4 short sentences of plain text. The user also sees the tool result tables, so don't repeat whole tables.`;

export class AssistantService {
  constructor(
    private readonly executor: AnalyticsExecutor,
    private readonly countries: () => Promise<Country[]>,
    private readonly client: MessagesClient | null,
    private readonly model: string,
  ) {}

  get engine(): 'claude' | 'rules' {
    return this.client ? 'claude' : 'rules';
  }

  async ask(question: string): Promise<AssistantAnswer> {
    if (this.client) {
      try {
        return await this.askClaude(question);
      } catch (err) {
        // Degrade gracefully: an LLM outage must not take the feature down.
        console.error('Assistant LLM call failed, falling back to rules:', err instanceof Error ? err.message : err);
      }
    }
    return this.askRules(question);
  }

  async askRules(question: string): Promise<AssistantAnswer> {
    const query = parseQuestion(question, await this.countries());
    if (!query) {
      return {
        engine: 'rules',
        results: [],
        answer:
          "I couldn't map that to one of the supported salary analyses. Try asking about pay by country, department or job title, top earners, pay bands, headcount or salary distribution.",
        suggestions: SUPPORTED_QUESTIONS,
      };
    }
    const result = await this.executor.run(query);
    return { engine: 'rules', results: [result], answer: result.summary };
  }

  private async askClaude(question: string): Promise<AssistantAnswer> {
    const client = this.client!;
    const countries = await this.countries();
    const tools = buildTools(countries.map((c) => c.code));
    const countryList = countries.map((c) => `${c.code}=${c.name} (${c.currency})`).join(', ');
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: question }];
    const results: AnalyticsResult[] = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        // Q&A over small tool results: medium effort balances latency and accuracy.
        output_config: { effort: 'medium' },
        // On a policy refusal the API retries on a fallback model inside the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: `${SYSTEM_PROMPT}\nCountries: ${countryList}.`,
        tools,
        tool_choice: { type: 'auto' },
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return { engine: 'claude', results, answer: 'I can only help with questions about ACME compensation data.' };
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return {
          engine: 'claude',
          results,
          answer: text || results.at(-1)?.summary || "I couldn't find an answer to that.",
          ...(results.length === 0 ? { suggestions: SUPPORTED_QUESTIONS } : {}),
        };
      }

      messages.push({ role: 'assistant', content: response.content });
      // All tool results go back in ONE user message.
      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of toolUses) {
        try {
          const input = (call.input ?? {}) as Record<string, unknown>;
          const query = analyticsQuerySchema.parse({ ...input, kind: TOOL_KIND[call.name] });
          const result = await this.executor.run(query);
          results.push(result);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ title: result.title, summary: result.summary, rows: result.table.rows.slice(0, 30) }),
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: `Invalid query: ${err instanceof Error ? err.message : 'unknown error'}`,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
    // unreachable: the loop returns on the last round
    return { engine: 'claude', results, answer: results.at(-1)?.summary ?? '' };
  }
}

export function createAnthropicClient(apiKey: string | undefined): MessagesClient | null {
  return apiKey ? new Anthropic({ apiKey }) : null;
}
