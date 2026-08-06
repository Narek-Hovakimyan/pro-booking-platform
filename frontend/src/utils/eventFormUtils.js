export const EMPTY_EVENT_FORM = {
  title: "",
  description: "",
  type: "training",
  instructor: "",
  instructorBio: "",
  date: "",
  time: "",
  duration: "",
  price: "",
  maxParticipants: "20",
  location: "",
  locationType: "salon",
  salonId: "",
  imageUrl: "",
  visibility: "public",
  certificatesEnabled: false,
};

export const normalizeSalonList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.salons) ? data.salons : [];

export const getSalonId = (salon) => salon?._id || salon?.id || "";
export const getSalonAddress = (salon) => salon?.address || "";
export const getSalonLocation = (salon) =>
  getSalonAddress(salon) || salon?.name || "";

export const getCreateEventInitialForm = (manageableSalons = []) => {
  const singleSalon = manageableSalons.length === 1 ? manageableSalons[0] : null;

  return {
    ...EMPTY_EVENT_FORM,
    salonId: singleSalon ? getSalonId(singleSalon) : "",
    location: singleSalon ? getSalonLocation(singleSalon) : "",
  };
};

export const validateCreateEventForm = (form, manageableSalons = []) => {
  const { title, instructor, date, time, duration, location, locationType, salonId } =
    form || {};

  if (!title || !instructor || !date || !time || !duration) {
    return "Please fill in all required fields";
  }

  if (locationType === "salon") {
    if (manageableSalons.length > 0 && !salonId) {
      return "Please select a salon";
    }
  } else if (!location) {
    return "Please enter the venue / location";
  }

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return "Time must be in HH:mm format (e.g., 09:30, 14:00)";
  }

  return "";
};

export const buildCreateEventPayload = (form, eventImageFile) => {
  const payload = {
    ...form,
    duration: Number(form.duration),
    price: Number(form.price) || 0,
    maxParticipants: Number(form.maxParticipants) || 20,
  };

  if (!eventImageFile) {
    return payload;
  }

  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, value ?? "");
  });
  formData.append("eventImage", eventImageFile);
  return formData;
};

