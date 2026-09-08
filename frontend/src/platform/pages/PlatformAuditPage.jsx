import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getPlatformAuditLogs } from "@/shared/api/platformAudit";
import { Card, CardContent } from "@/shared/components/ui/card";

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime()) && value.includes("T")) {
    return formatDate(value);
  }
  return String(value);
};

function Changes({ changes }) {
  if (!changes) return <span className="text-neutral-400">No safe change details available</span>;

  const keys = [...new Set([
    ...Object.keys(changes.before || {}),
    ...Object.keys(changes.after || {}),
  ])];
  if (!keys.length) return <span className="text-neutral-400">No safe change details available</span>;

  return (
    <dl className="space-y-1">
      {keys.map((key) => (
        <div key={key} className="flex gap-1 text-xs text-neutral-600">
          <dt className="font-medium text-neutral-700">{key}:</dt>
          <dd>{formatValue(changes.before?.[key])} → {formatValue(changes.after?.[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

const referenceLabel = (reference, fallback) => {
  if (!reference) return "—";
  return reference.name || (reference.missing ? `Deleted ${fallback}` : fallback);
};

export default function PlatformAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [auditLogs, setAuditLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [action, setAction] = useState(() => searchParams.get("action") || "");
  const [from, setFrom] = useState(() => searchParams.get("from") || "");
  const [to, setTo] = useState(() => searchParams.get("to") || "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRevision = useRef(0);
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    const requestId = ++requestRevision.current;
    let isMounted = true;

    async function fetchAuditLogs() {
      setIsLoading(true);
      setError("");
      try {
        const params = { page, limit };
        if (action.trim()) params.action = action.trim();
        if (from) params.from = from;
        if (to) params.to = to;
        const result = await getPlatformAuditLogs(params);
        if (!isMounted || requestRevision.current !== requestId) return;
        setAuditLogs(result.auditLogs || []);
        setTotal(result.total || 0);
      } catch (err) {
        if (!isMounted || requestRevision.current !== requestId) return;
        setAuditLogs([]);
        if (err.response?.status === 403) {
          setError("Access denied. Audit access is required.");
        } else {
          setError(err.response?.data?.message || "Failed to load platform audit history.");
        }
      } finally {
        if (isMounted && requestRevision.current === requestId) setIsLoading(false);
      }
    }

    void fetchAuditLogs();
    return () => { isMounted = false; };
  }, [action, from, page, to]);

  useEffect(() => {
    const params = {};
    if (page > 1) params.page = String(page);
    if (action.trim()) params.action = action.trim();
    if (from) params.from = from;
    if (to) params.to = to;
    setSearchParams(params, { replace: true });
  }, [action, from, page, setSearchParams, to]);

  const updateFilter = (setter) => (event) => {
    setPage(1);
    setter(event.target.value);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Platform Audit</h1>
        <p className="text-sm text-neutral-500">Read-only history of platform billing operations.</p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-sm text-neutral-600">
          Action
          <input value={action} onChange={updateFilter(setAction)} placeholder="Exact action" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2" />
        </label>
        <label className="text-sm text-neutral-600">
          From
          <input type="date" value={from} onChange={updateFilter(setFrom)} className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2" />
        </label>
        <label className="text-sm text-neutral-600">
          To
          <input type="date" value={to} onChange={updateFilter(setTo)} className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2" />
        </label>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>}

      {!isLoading && !error && auditLogs.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><ShieldCheck className="h-10 w-10 text-neutral-300" /><p className="text-sm text-neutral-500">No audit records match these filters.</p></CardContent></Card>
      )}

      {!isLoading && auditLogs.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-3">Timestamp</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Context / Target</th><th className="p-3">Changes</th><th className="p-3">Note</th></tr></thead>
            <tbody>{auditLogs.map((log) => (
              <tr key={log.id} className="border-b align-top last:border-0">
                <td className="p-3 text-xs text-neutral-600">{formatDate(log.createdAt)}</td>
                <td className="p-3"><div>{referenceLabel(log.actor, "user")}</div><div className="text-xs text-neutral-400">{log.actor?.id}</div></td>
                <td className="p-3 font-mono text-xs text-neutral-700">{log.action}</td>
                <td className="p-3 text-xs text-neutral-600"><div>{referenceLabel(log.salon, "salon")}</div>{log.targetUser && <div>Target: {referenceLabel(log.targetUser, "user")}</div>}</td>
                <td className="p-3"><Changes changes={log.changes} /></td>
                <td className="max-w-xs whitespace-pre-wrap break-words p-3 text-neutral-600">{log.note || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && <div className="flex items-center justify-center gap-3"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm disabled:opacity-30"><ChevronLeft className="h-4 w-4" />Previous</button><span className="text-xs text-neutral-500">Page {page} of {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm disabled:opacity-30">Next<ChevronRight className="h-4 w-4" /></button></div>}
    </div>
  );
}
