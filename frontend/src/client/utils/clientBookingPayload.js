const SALON_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export function normalizeClientBookingSalonId(value) {
  if (value === undefined || value === null) return "";

  const candidate = String(value).trim();
  return SALON_ID_PATTERN.test(candidate) ? candidate : "";
}

export function getClientBookingSalonData(salonEntry) {
  return salonEntry?.salon || salonEntry || null;
}

export function getClientBookingSalonId(salonEntry) {
  const salonData = getClientBookingSalonData(salonEntry);
  return salonData?.id || salonData?._id || "";
}

export function getClientBookingSalonName(salonEntry) {
  return getClientBookingSalonData(salonEntry)?.name || "";
}

export function getApprovedClientBookingSalons(barber) {
  return (barber?.approvedSalons || barber?.salons || []).filter(
    (salonEntry) => salonEntry?.status === "approved" || salonEntry?.status === undefined
  );
}

export function getClientBookingSelectedSalon(barber, selectedSalonId) {
  const approvedSalons = getApprovedClientBookingSalons(barber);

  if (!selectedSalonId) {
    return (
      barber?.primarySalon ||
      approvedSalons.find((salonEntry) => salonEntry?.isPrimary) ||
      approvedSalons[0] ||
      null
    );
  }

  return (
    approvedSalons.find(
      (salonEntry) => String(getClientBookingSalonId(salonEntry)) === String(selectedSalonId)
    ) ||
    barber?.primarySalon ||
    approvedSalons.find((salonEntry) => salonEntry?.isPrimary) ||
    approvedSalons[0] ||
    null
  );
}

export function withClientBookingSalonContext(payload, selectedSalonId) {
  const salonId = normalizeClientBookingSalonId(selectedSalonId);
  return salonId ? { ...payload, salonId } : payload;
}

export function buildClientBookingQuotePayload({
  barberId,
  serviceId,
  bookingDate,
  dayKey,
  time,
  voucherCode,
  selectedSalonId,
}) {
  return withClientBookingSalonContext(
    {
      barberId,
      serviceId,
      bookingDate,
      dayKey,
      time,
      voucherCode,
    },
    selectedSalonId
  );
}

export function buildClientBookingSubmissionPayload({
  barberId,
  clientId,
  serviceId,
  serviceName,
  duration,
  dayKey,
  bookingDate,
  time,
  clientName,
  phone,
  note,
  referenceFiles = [],
  consultation = null,
  consent = null,
  voucherCode = "",
  selectedSalonId,
}) {
  const payload = {
    barberId,
    clientId,
    serviceId,
    serviceName,
    duration,
    dayKey,
    bookingDate,
    time,
    status: "pending",
    clientName,
    phone,
    note,
  };

  if (referenceFiles.length > 0) {
    payload.files = referenceFiles;
  }

  if (consultation) {
    payload.consultation = consultation;
  }

  if (consent) {
    payload.consent = consent;
  }

  if (voucherCode) {
    payload.voucherCode = voucherCode;
  }

  return withClientBookingSalonContext(payload, selectedSalonId);
}
