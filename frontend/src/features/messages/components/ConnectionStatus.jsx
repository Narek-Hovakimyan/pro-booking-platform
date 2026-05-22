import { Wifi, WifiOff } from "lucide-react";

export default function ConnectionStatus({ socketConnected = false, isRefreshing = false }) {
  return (
    <p className="text-xs font-medium text-neutral-500">
      {socketConnected ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <Wifi className="h-3 w-3" />
          Live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <WifiOff className="h-3 w-3" />
          Reconnecting...
          {isRefreshing ? " · Refreshing..." : ""}
        </span>
      )}
    </p>
  );
}
