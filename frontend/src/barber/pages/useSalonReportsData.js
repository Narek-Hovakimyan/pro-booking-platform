import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";
import {
  exportSalonReportsCsv,
  getSalonReports,
} from "@/shared/api/salonReports";

import {
  get30DaysAgoString,
  getSalonId,
  getSalonList,
  getTodayString,
} from "./salonReportFormatters";

const buildReportParams = (fromDate, toDate, selectedBarberId) => {
  const params = { from: fromDate, to: toDate };
  if (selectedBarberId) {
    params.barberId = selectedBarberId;
  }
  return params;
};

export function useSalonReportsData() {
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [reports, setReports] = useState(null);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [exportError, setExportError] = useState("");
  const [fromDate, setFromDate] = useState(get30DaysAgoString);
  const [toDate, setToDate] = useState(getTodayString);
  const [selectedBarberId, setSelectedBarberId] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);

  const mountedRef = useRef(true);
  const salonsRequestId = useRef(0);
  const reportsRequestId = useRef(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const loadReports = useCallback(
    async (nextSalonId, nextFromDate, nextToDate, nextBarberId = "") => {
      if (!nextSalonId || !nextFromDate || !nextToDate) return;

      const requestId = ++reportsRequestId.current;

      await Promise.resolve();
      if (!mountedRef.current || requestId !== reportsRequestId.current) {
        return;
      }

      setLoadingReports(true);

      try {
        const data = await getSalonReports(
          nextSalonId,
          buildReportParams(nextFromDate, nextToDate, nextBarberId)
        );
        if (!mountedRef.current || requestId !== reportsRequestId.current) {
          return;
        }

        setReports(data);
        setError("");
        setErrorCode("");
        setExportError("");

        if (Array.isArray(data?.byStaff) && data.byStaff.length > 0) {
          setStaffOptions(
            data.byStaff.map((staff) => ({
              _id: staff.barberId,
              name: staff.barberName,
            }))
          );
        }
      } catch (requestError) {
        if (!mountedRef.current || requestId !== reportsRequestId.current) return;

        setReports(null);
        setError(
          requestError?.response?.data?.message || "Could not load reports."
        );
        setErrorCode(requestError?.response?.data?.code || "");
      } finally {
        if (mountedRef.current && requestId === reportsRequestId.current) {
          setLoadingReports(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    const requestId = ++salonsRequestId.current;

    async function fetchSalons() {
      setLoadingSalons(true);
      try {
        const { data } = await api.get("/salons/mine/manageable");
        const nextSalons = getSalonList(data);

        if (!mountedRef.current || requestId !== salonsRequestId.current) {
          return;
        }

        setSalons(nextSalons);
        if (nextSalons.length > 0) {
          setSelectedSalonId(getSalonId(nextSalons[0]));
        }
        setError("");
        setErrorCode("");
      } catch (requestError) {
        if (!mountedRef.current || requestId !== salonsRequestId.current) {
          return;
        }

        setError(
          requestError?.response?.data?.message || "Could not load salons."
        );
        setErrorCode("");
      } finally {
        if (mountedRef.current && requestId === salonsRequestId.current) {
          setLoadingSalons(false);
        }
      }
    }

    fetchSalons();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadReports(selectedSalonId, fromDate, toDate, selectedBarberId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadReports, selectedSalonId, fromDate, toDate, selectedBarberId]);

  const handleSalonChange = (salonId) => {
    setSelectedSalonId(salonId);
    setSelectedBarberId("");
    setReports(null);
    setStaffOptions([]);
    setErrorCode("");
    setExportError("");
  };

  const handleRefresh = () => {
    void loadReports(selectedSalonId, fromDate, toDate, selectedBarberId);
  };

  const handleExportCsv = async () => {
    if (!selectedSalonId || !fromDate || !toDate) return;

    setExportingCsv(true);
    setExportError("");

    try {
      const { data, filename } = await exportSalonReportsCsv(
        selectedSalonId,
        buildReportParams(fromDate, toDate, selectedBarberId)
      );
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export salon reports.");
    } finally {
      setExportingCsv(false);
    }
  };

  return {
    salons,
    selectedSalonId,
    reports,
    loadingSalons,
    loadingReports,
    exportingCsv,
    error,
    errorCode,
    exportError,
    fromDate,
    toDate,
    selectedBarberId,
    staffOptions,
    setFromDate,
    setToDate,
    setSelectedBarberId,
    handleSalonChange,
    handleRefresh,
    handleExportCsv,
  };
}
