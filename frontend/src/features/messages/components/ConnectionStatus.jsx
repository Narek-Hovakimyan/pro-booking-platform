import { Wifi, WifiOff } from "lucide-react";

export default function ConnectionStatus({ socketConnected = false, isRefreshing = false }) {
  return (
    <p className="text-xs font-medium text-neutral-500">
      {socketConnected ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          <Wifi className="h-3 w-3" />
          Live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          <WifiOff className="h-3 w-3" />
          Reconnecting...
          {isRefreshing ? " · Refreshing..." : ""}
        </span>
      )}
    </p>
  );
}
