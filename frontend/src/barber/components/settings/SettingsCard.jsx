export default function SettingsCard({ title, description, children }) {
  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">{title}</h3>
        <p className="text-sm text-neutral-500">{description}</p>
      </div>

      {children}
    </section>
  );
}
