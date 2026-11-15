import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { InsightsService } from '../services/insightsService';
import { breakdownRow, InMemoryCountryRepository, StubInsightsRepository, TEST_COUNTRIES } from '../testing/fakes';
import { AnalyticsExecutor } from './analytics';
import { AssistantService, buildTools, type MessagesClient } from './assistantService';
import { parseQuestion } from './ruleParser';

const countries = TEST_COUNTRIES;
const parse = (q: string) => parseQuestion(q, countries);

describe('parseQuestion (offline engine)', () => {
  it.each([
    [
      'What is the median salary of a Software Engineer in Germany?',
      { kind: 'summary', filter: { country: 'DE', jobTitle: 'Software Engineer' } },
    ],
    ['Which department has the highest average salary?', { kind: 'breakdown', by: 'department', metric: 'average', order: 'desc' }],
    ['Show payroll by country', { kind: 'breakdown', by: 'country', metric: 'payroll' }],
    ['Which country has the lowest median pay?', { kind: 'breakdown', by: 'country', metric: 'median', order: 'asc' }],
    ['Who are the top 5 highest paid employees in India?', { kind: 'top_earners', limit: 5, filter: { country: 'IN' } }],
    ['What is the pay band for Recruiters in the US?', { kind: 'benchmark', country: 'US', jobTitle: 'Recruiter' }],
    ['How many employees are in Sales?', { kind: 'summary', filter: { department: 'Sales' } }],
    ['Show the salary distribution in Engineering', { kind: 'distribution', filter: { department: 'Engineering' } }],
    ['headcount by job title in the UK', { kind: 'breakdown', by: 'jobTitle', metric: 'headcount' }],
    ['Average pay per department in India', { kind: 'breakdown', by: 'department', metric: 'average', filter: { country: 'IN' } }],
  ])('%s', (question, expected) => {
    expect(parse(question)).toMatchObject(expected);
  });

  it('prefers the longest job title', () => {
    expect(parse('median pay for Senior Software Engineers in the US')).toMatchObject({
      filter: { jobTitle: 'Senior Software Engineer', country: 'US' },
    });
  });

  it('does not read the pronoun "us" as the United States', () => {
    expect(parse('tell us the average salary')).toEqual({ kind: 'summary', filter: {} });
  });

  it('returns null for questions it cannot map', () => {
    expect(parse('What is the weather in Paris?')).toBeNull();
    expect(parse('')).toBeNull();
  });
});

describe('AnalyticsExecutor', () => {
  let repo: StubInsightsRepository;
  let executor: AnalyticsExecutor;

  beforeEach(() => {
    repo = new StubInsightsRepository();
    const countriesRepo = new InMemoryCountryRepository();
    executor = new AnalyticsExecutor(new InsightsService(repo, countriesRepo), () => countriesRepo.list());
  });

  it('ranks a breakdown by the requested metric and builds the summary from the data', async () => {
    repo.breakdownRows = [
      breakdownRow('Sales', 80_000, { avgUsd: 90_000 }),
      breakdownRow('Engineering', 150_000, { avgUsd: 140_000 }),
    ];
    const r = await executor.run({ kind: 'breakdown', by: 'department', metric: 'average', order: 'desc', filter: {} });
    expect(r.table.rows.map((x) => [x.label, x.value])).toEqual([
      ['Engineering', 140_000],
      ['Sales', 90_000],
    ]);
    expect(r.summary).toBe('Highest average base salary (usd): Engineering at $140,000; 2 groups shown.');
    expect(r.chart).toBeDefined();
  });

  it('applies limit and ascending order', async () => {
    repo.breakdownRows = [breakdownRow('A', 3), breakdownRow('B', 1), breakdownRow('C', 2)];
    const r = await executor.run({ kind: 'breakdown', by: 'department', metric: 'median', order: 'asc', limit: 2, filter: {} });
    expect(r.table.rows.map((x) => x.label)).toEqual(['B', 'C']);
  });

  it('rejects invalid or unknown parameters instead of running them', async () => {
    await expect(executor.run({ kind: 'drop_tables' })).rejects.toThrow();
    await expect(executor.run({ kind: 'summary', filter: { country: 'ZZ' } })).rejects.toThrow(/Unknown country/);
    await expect(executor.run({ kind: 'summary', filter: { department: 'Wizards' } })).rejects.toThrow();
    await expect(executor.run({ kind: 'summary', filter: { sql: '1=1' } })).rejects.toThrow();
  });

  it('summarises an empty scope honestly', async () => {
    const r = await executor.run({ kind: 'summary', filter: { country: 'DE', department: 'Sales' } });
    expect(r.summary).toBe('There are no active employees in Sales in Germany.');
  });
});

/** A scripted stand-in for the Anthropic client: returns queued responses and records requests. */
function scriptedClient(responses: Partial<Anthropic.Beta.BetaMessage>[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        create: async (params) => {
          requests.push(structuredClone(params));
          const next = responses.shift();
          if (!next) throw new Error('no scripted response left');
          return next as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, requests };
}

describe('AssistantService', () => {
  let repo: StubInsightsRepository;
  let executor: AnalyticsExecutor;
  const countriesFn = async () => countries;

  beforeEach(() => {
    repo = new StubInsightsRepository();
    repo.summaryRow = { headcount: 3, totalGrossUsd: 300_000, avgUsd: 95_000, medianUsd: 90_000, avgGrossUsd: 100_000 };
    executor = new AnalyticsExecutor(new InsightsService(repo, new InMemoryCountryRepository()), countriesFn);
  });

  it('rules engine answers from the data and returns the verified result', async () => {
    const svc = new AssistantService(executor, countriesFn, null, 'unused');
    const a = await svc.ask('How many employees are in Sales?');
    expect(a.engine).toBe('rules');
    expect(a.answer).toContain('3 active employees in Sales');
    expect(a.results).toHaveLength(1);
    expect(repo.calls[0]).toEqual({ method: 'summary', args: [{ department: 'Sales' }] });
  });

  it('rules engine explains what it supports when it cannot answer', async () => {
    const a = await new AssistantService(executor, countriesFn, null, 'unused').ask('Tell me a joke');
    expect(a.results).toEqual([]);
    expect(a.suggestions?.length).toBeGreaterThan(0);
  });

  it('Claude engine: runs the requested vetted query and returns the model answer plus verified results', async () => {
    const { client, requests } = scriptedClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'pay_summary', input: { filter: { department: 'Sales' } } } as Anthropic.Beta.BetaToolUseBlock,
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Sales has 3 active employees with a median base salary of $90,000.' } as Anthropic.Beta.BetaTextBlock],
      },
    ]);
    const svc = new AssistantService(executor, countriesFn, client, 'claude-opus-5-5');
    const a = await svc.ask('How big is sales and what do they earn?');

    expect(a).toMatchObject({ engine: 'claude', answer: 'Sales has 3 active employees with a median base salary of $90,000.' });
    expect(a.results[0]?.query).toEqual({ kind: 'summary', filter: { department: 'Sales' } });
    expect(repo.calls[0]?.args[0]).toEqual({ department: 'Sales' });

    // request shape: model, strict tools, refusal fallbacks; tool result returned in one user message
    expect(requests[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', tool_choice: { type: 'auto' } });
    expect(requests[0]?.tools?.every((t) => 'strict' in t && t.strict)).toBe(true);
    const lastMsg = requests[1]?.messages.at(-1);
    expect(lastMsg?.role).toBe('user');
    expect(JSON.stringify(lastMsg?.content)).toContain('"tool_use_id":"tu_1"');
  });

  it('Claude engine: an invalid tool call is reported back as an error, never executed', async () => {
    const { client, requests } = scriptedClient([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_x', name: 'pay_band', input: { country: 'ZZ', jobTitle: 'Wizard' } } as Anthropic.Beta.BetaToolUseBlock],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry, I could not find that role.' } as Anthropic.Beta.BetaTextBlock] },
    ]);
    const a = await new AssistantService(executor, countriesFn, client, 'm').ask('band for wizards');
    expect(repo.calls).toEqual([]);
    expect(a.results).toEqual([]);
    expect(JSON.stringify(requests[1]?.messages.at(-1)?.content)).toContain('"is_error":true');
  });

  it('falls back to the rules engine when the LLM call fails', async () => {
    const failing: MessagesClient = {
      beta: { messages: { create: async () => Promise.reject(new Error('overloaded')) } },
    };
    const a = await new AssistantService(executor, countriesFn, failing, 'm').ask('How many employees are in Sales?');
    expect(a.engine).toBe('rules');
    expect(a.results).toHaveLength(1);
  });

  it('exposes one strict tool per vetted query with enumerated countries', () => {
    const tools = buildTools(['US', 'DE']);
    expect(tools.map((t) => t.name)).toEqual(['pay_summary', 'pay_breakdown', 'top_earners', 'pay_band', 'salary_distribution']);
    expect(JSON.stringify(tools[3]?.input_schema)).toContain('"enum":["US","DE"]');
  });
});
