'use client';

import { ErrorState } from '@/components/ErrorState';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorState
        title="We couldn't load this page"
        message={`${error.message}. Check that the API is running and try again.`}
      />
      <button className="btn-secondary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
