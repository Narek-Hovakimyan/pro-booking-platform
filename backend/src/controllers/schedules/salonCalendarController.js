import {
  getSalonCalendar,
  SalonCalendarError,
} from "../../services/salon/salonCalendarService.js";
import { sendControllerError } from "../../utils/controllerError.js";

export const getCalendar = async (req, res) => {
  try {
    const { salonId } = req.params;
    const { date, view, barberId } = req.query;
    const userId = req.user?._id;

    const calendarData = await getSalonCalendar(salonId, userId, {
      date,
      view,
      barberId,
    });

    return res.json(calendarData);
  } catch (error) {
    if (error instanceof SalonCalendarError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return sendControllerError(res, error, "Could not fetch salon calendar");
  }
};
