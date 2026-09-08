import { listPlatformAuditLogs } from "../../services/platform/platformAuditReadService.js";

export const listPlatformAuditLogsHandler = async (req, res, next) => {
  try {
    return res.json(await listPlatformAuditLogs(req.query));
  } catch (error) {
    next(error);
  }
};
