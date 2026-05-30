export const getControllerErrorStatusCode = (
  error,
  { duplicateKeyStatus = 409, fallbackStatus = 500 } = {}
) => {
  if (error?.code === 11000) return duplicateKeyStatus;
  if (error?.statusCode) return error.statusCode;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return 400;
  }
  return fallbackStatus;
};

export const sendControllerError = (
  res,
  error,
  fallbackMessage,
  { duplicateKeyMessage, duplicateKeyStatus = 409, fallbackStatus = 500 } = {}
) => {
  const statusCode = getControllerErrorStatusCode(error, {
    duplicateKeyStatus,
    fallbackStatus,
  });

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  const message =
    statusCode === 500
      ? fallbackMessage
      : error?.code === 11000 && duplicateKeyMessage
        ? duplicateKeyMessage
        : error?.message || fallbackMessage;

  return res.status(statusCode).json({ message });
};
