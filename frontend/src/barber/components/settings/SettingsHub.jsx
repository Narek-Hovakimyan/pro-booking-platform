import { Link } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, Calendar, Store, Clock, Award } from "lucide-react";

function SettingsHubCard({ title, description, to }) {
  const iconMap = {
    Profile: BriefcaseBusiness,
    Schedule: Calendar,
    "Salon Settings": Store,
    "Default Schedule": Clock,
    Certifications: Award,
  };
  const Icon = iconMap[title] || ArrowRight;

  return (
    <Link
      to={to}
      className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800">
        <Icon className="h-4 w-4 text-neutral-300" />
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs text-neutral-500">{description}</p>
    </Link>
  );
}

export default function SettingsHub({ error }) {
  return (
    <>
      <h2 className="text-xl font-bold sm:text-2xl">Settings</h2>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsHubCard
          title="Profile"
          description="Edit your name, city, phone, bio, photo and specialty."
          to="/admin/profile"
        />
        <SettingsHubCard
          title="Schedule"
          description="Manage your weekly availability and time off."
          to="/admin/schedule"
        />
        <SettingsHubCard
          title="Salon Settings"
          description="Create, join, or manage your salon memberships."
          to="/admin/settings/salon"
        />
        <SettingsHubCard
          title="Default Schedule"
          description="Set default working hours for each salon."
          to="/admin/settings/default-schedule"
        />
        <SettingsHubCard
          title="Certifications"
          description="Manage your specialist certifications and event certificates."
          to="/admin/settings/certifications"
        />
        <SettingsHubCard
          title="Deposit"
          description="Configure booking deposit / no-show protection settings."
          to="/admin/settings/deposit"
        />
      </div>
    </>
  );
}
