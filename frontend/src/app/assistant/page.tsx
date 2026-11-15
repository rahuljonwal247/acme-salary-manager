import { AssistantChat } from '@/components/assistant/AssistantChat';
import { serverApi as api } from '@/lib/server-api';

export const metadata = { title: 'AI Assistant · ACME Salary Manager' };

export default async function AssistantPage() {
  const meta = await api.meta();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI salary assistant</h1>
        <p className="text-sm text-slate-500">
          Ask about how ACME pays people. Answers are computed by vetted database queries — every number comes from your data.
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" data-testid="engine">
            {meta.assistantEngine === 'claude' ? 'Powered by Claude' : 'Offline query engine'}
          </span>
        </p>
      </div>
      <AssistantChat />
    </div>
  );
}
