export default function ErrorBanner({ error }) {
  if (!error) return null;

  return (
    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  );
}
