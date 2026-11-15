'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AssistantAnswer } from '@/lib/types';
import { ResultView } from './ResultView';

export const EXAMPLE_QUESTIONS = [
  'Which department has the highest average salary?',
  'Show payroll by country',
  'Who are the top 5 highest paid employees in India?',
  'What is the pay band for Software Engineers in Germany?',
  'How many employees are in Sales?',
  'Show the salary distribution in Engineering',
];

interface Turn {
  id: number;
  question: string;
  answer?: AssistantAnswer;
  error?: string;
}

export function AssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: text }]);
    setQuestion('');
    setBusy(true);
    try {
      const answer = await api.ask(text);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer } : x)));
    } catch (err) {
      const error = err instanceof ApiError ? err.message : 'Something went wrong';
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {turns.length === 0 && (
        <div className="card p-5">
          <p className="mb-3 text-sm font-medium text-slate-700">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button key={q} type="button" className="btn-secondary text-left" onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-4" aria-live="polite">
        {turns.map((t) => (
          <li key={t.id} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
              {t.question}
            </div>
            {!t.answer && !t.error && (
              <div className="card w-fit px-4 py-3 text-sm text-slate-500" role="status">
                Analysing…
              </div>
            )}
            {t.error && (
              <div role="alert" className="card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {t.error}
              </div>
            )}
            {t.answer && (
              <div className="card space-y-4 p-4" data-testid="assistant-answer">
                <p className="text-sm whitespace-pre-line text-slate-900">{t.answer.answer}</p>
                {t.answer.results.map((r, i) => (
                  <ResultView key={i} result={r} />
                ))}
                {t.answer.suggestions && (
                  <div className="flex flex-wrap gap-2">
                    {t.answer.suggestions.slice(0, 4).map((s) => (
                      <button key={s} type="button" className="btn-secondary text-left text-xs" onClick={() => ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      <form
        className="card sticky bottom-4 flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Ask a question
        </label>
        <input
          id="question"
          className="input"
          placeholder="e.g. What is the median salary of a Recruiter in the UK?"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || question.trim().length < 3}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
