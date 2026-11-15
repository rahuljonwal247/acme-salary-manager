interface Props {
  id: string;
  label: string;
  error?: string[];
  hint?: string;
  children: React.ReactNode;
}

/** Label + control + inline error/hint, wired for screen readers via aria-describedby. */
export function Field({ id, label, error, hint, children }: Props) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error?.length ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error[0]}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
