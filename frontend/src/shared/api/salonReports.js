import api from "@/shared/api/axios";

/**
 * Fetch salon reports with date-range analytics.
 * @param {string} salonId
 * @param {object} params - { from: YYYY-MM-DD, to: YYYY-MM-DD, barberId?: string }
 * @returns {Promise<object>} Report data
 */
export async function getSalonReports(salonId, params) {
  const { data } = await api.get(`/salons/${salonId}/reports`, { params });
  return data;
}

/**
 * Export salon reports as backend-generated CSV.
 * @param {string} salonId
 * @param {object} params - { format: "csv", from: YYYY-MM-DD, to: YYYY-MM-DD, barberId?: string }
 * @returns {Promise<{ data: Blob, filename: string }>}
 */
export async function exportSalonReportsCsv(salonId, params) {
  const response = await api.get(`/salons/${salonId}/reports/export`, {
    params: { ...params, format: "csv" },
    responseType: "blob",
  });
  const contentDisposition = response.headers?.["content-disposition"] || "";
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);

  return {
    data: response.data,
    filename: filenameMatch?.[1] || "salon-reports.csv",
  };
}
