export function BillingActionButton({ icon: Icon, label, onClick, variant = "default" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition";
  const variants = {
    default: "bg-neutral-950 text-white hover:bg-neutral-800",
    outline: "border border-neutral-300 text-neutral-700 hover:bg-neutral-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };

  return (
    <button
      onClick={onClick}
      className={`${base} ${variants[variant] || variants.default}`}
      type="button"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}