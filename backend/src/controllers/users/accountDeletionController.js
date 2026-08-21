import { disconnectUserSocketsBestEffort } from "../../services/auth/authInvalidationService.js";
import {
  AccountDeletionError,
  deleteAccountAtomically,
} from "../../services/users/accountDeletionService.js";
import { sendControllerError } from "../../utils/controllerError.js";

export const deleteMyAccount = async (req, res) => {
  try {
    await deleteAccountAtomically({ userId: req.user?._id });
    await disconnectUserSocketsBestEffort({
      userId: req.user?._id,
      event: "account.deleted.socket_disconnect_failed",
    });
    res.clearCookie?.("refreshToken");
    return res.status(204).send();
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return sendControllerError(res, error, "Could not delete account");
  }
};
