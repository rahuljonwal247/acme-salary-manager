export function ErrorState({ title = 'Something went wrong', message }: { title?: string; message: string }) {
  return (
    <div role="alert" className="card border-red-200 bg-red-50 p-6 text-sm text-red-800">
      <p className="font-medium">{title}</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
