const CSV_INJECTION_PATTERN = /^\s*[=+\-@]/;

const csvCell = (value) => {
  const stringValue = value === null || value === undefined ? "" : String(value);
  const safeValue = CSV_INJECTION_PATTERN.test(stringValue)
    ? `'${stringValue}`
    : stringValue;

  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  return safeValue;
};

const csvRow = (values) => values.map(csvCell).join(",");

const getPaymentTypeLabel = (staff) => {
  if (staff.paymentType === "commission") {
    const staffPercent = staff.commissionStaffPercent;
    const salonPercent = staff.commissionSalonPercent;

    if (
      staffPercent !== null &&
      staffPercent !== undefined &&
      salonPercent !== null &&
      salonPercent !== undefined
    ) {
      return `Commission ${staffPercent}/${salonPercent}`;
    }

    return "Commission";
  }

  if (staff.paymentType === "fixed") {
    return "Fixed - prorated estimate";
  }

  return "Not configured";
};

export const safeFilenamePart = (value) =>
  String(value || "salon")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "salon";

export const buildSalonReportCsv = (report) => {
  const summary = report.summary || {};
  const range = report.range || {};
  const salon = report.salon || {};
  const rows = [];

  rows.push(csvRow(["Report Summary"]));
  rows.push(csvRow(["Metric", "Value"]));
  rows.push(csvRow(["Salon name", salon.name || ""]));
  rows.push(csvRow(["Salon ID", salon.id || ""]));
  rows.push(csvRow(["From", range.from || ""]));
  rows.push(csvRow(["To", range.to || ""]));
  rows.push(csvRow(["Total bookings", summary.totalBookings || 0]));
  rows.push(csvRow(["Completed bookings", summary.completedBookings || 0]));
  rows.push(csvRow(["Gross revenue", summary.grossRevenue || 0]));
  rows.push(csvRow(["Staff earnings total", summary.staffEarningsTotal || 0]));
  rows.push(csvRow(["Salon earnings total", summary.salonEarningsTotal || 0]));
  rows.push(csvRow(["Fixed pay prorated count", summary.fixedPayProratedCount || 0]));
  rows.push("");

  rows.push(csvRow(["Staff Earnings"]));
  rows.push(
    csvRow([
      "Staff name",
      "Booking count",
      "Completed count",
      "Gross revenue",
      "Staff earnings",
      "Salon earnings",
      "Payment type label/status",
      "Commission staff percent",
      "Commission salon percent",
      "Fixed amount",
      "Fixed period",
      "Earnings calculation status",
    ])
  );
  for (const staff of report.byStaff || []) {
    rows.push(
      csvRow([
        staff.barberName,
        staff.totalBookings || 0,
        staff.completed || 0,
        staff.grossRevenue || 0,
        staff.staffEarnings || 0,
        staff.salonEarnings || 0,
        getPaymentTypeLabel(staff),
        staff.commissionStaffPercent,
        staff.commissionSalonPercent,
        staff.fixedAmount,
        staff.fixedPeriod,
        staff.earningsCalculationStatus,
      ])
    );
  }
  rows.push("");

  rows.push(csvRow(["Revenue by Day"]));
  rows.push(csvRow(["Date", "Total bookings", "Completed", "Cancelled", "No-show", "Pending", "Revenue"]));
  for (const day of report.byDay || []) {
    rows.push(
      csvRow([
        day._id,
        day.total || 0,
        day.completed || 0,
        day.cancelled || 0,
        day.noShow || 0,
        day.pending || 0,
        day.revenue || 0,
      ])
    );
  }
  rows.push("");

  rows.push(csvRow(["Bookings by Status"]));
  rows.push(csvRow(["Status", "Count"]));
  for (const status of report.byStatus || []) {
    rows.push(csvRow([status.status, status.count || 0]));
  }
  rows.push("");

  rows.push(csvRow(["Top Services"]));
  rows.push(csvRow(["Service", "Bookings", "Revenue"]));
  for (const service of report.topServices || []) {
    rows.push(csvRow([service._id, service.count || 0, service.revenue || 0]));
  }

  return `${rows.join("\r\n")}\r\n`;
};
