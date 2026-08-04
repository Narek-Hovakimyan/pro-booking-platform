const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const reportAppointmentDateField = "reportAppointmentDate";
export const reportAppointmentDateExpression = {
  $cond: [
    {
      $and: [
        { $ne: ["$bookingDate", null] },
        { $ne: ["$bookingDate", ""] },
      ],
    },
    "$bookingDate",
    "$dayKey",
  ],
};

export const isValidDateString = (value) => {
  if (!DATE_PATTERN.test(value || "")) return false;

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
};

export const parseDateRange = (from, to, ReportError) => {
  if (!from || !to) {
    throw new ReportError(400, "from and to query params are required (YYYY-MM-DD)");
  }

  if (!isValidDateString(from) || !isValidDateString(to)) {
    throw new ReportError(400, "Invalid date format. Use YYYY-MM-DD.");
  }

  if (from > to) {
    throw new ReportError(400, "from date must be before or equal to to date");
  }

  return { from, to };
};

export const appointmentDateQuery = (from, to) => ({
  $or: [
    {
      bookingDate: { $gte: from, $lte: to },
    },
    {
      $or: [
        { bookingDate: { $exists: false } },
        { bookingDate: null },
        { bookingDate: "" },
      ],
      dayKey: { $gte: from, $lte: to },
    },
  ],
});

// Reports are appointment-period views: prefer canonical bookingDate, with
// dayKey as a legacy fallback for old records that did not persist bookingDate.
export const appointmentDateAggregationStages = (from, to) => [
  {
    $addFields: {
      [reportAppointmentDateField]: reportAppointmentDateExpression,
    },
  },
  {
    $match: {
      [reportAppointmentDateField]: { $gte: from, $lte: to },
    },
  },
];
