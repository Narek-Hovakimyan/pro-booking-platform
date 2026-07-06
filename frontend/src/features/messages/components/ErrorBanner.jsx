export default function ErrorBanner({ error }) {
  if (!error) return null;

  return (
    <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700 shadow-sm">
      {error}
    </p>
  );
}
