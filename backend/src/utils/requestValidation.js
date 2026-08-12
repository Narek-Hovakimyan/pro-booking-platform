import mongoose from "mongoose";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

const isPlainPositiveIntegerInput = (value) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 1
    : typeof value === "string" && POSITIVE_INTEGER_PATTERN.test(value.trim());

const parsePositiveIntegerInput = (value) => {
  if (!isPlainPositiveIntegerInput(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const isValidObjectIdString = (value) =>
  typeof value === "string" &&
  OBJECT_ID_PATTERN.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

export const parseOptionalPagination = (
  query = {},
  { defaultLimit = 20, maxLimit = 100 } = {}
) => {
  const params = query && typeof query === "object" ? query : {};
  const hasPage = params.page !== undefined;
  const hasLimit = params.limit !== undefined;

  if (!hasPage && !hasLimit) {
    return { ok: true, value: { enabled: false, page: 1, limit: defaultLimit, skip: 0 } };
  }

  const page = hasPage ? parsePositiveIntegerInput(params.page) : 1;
  const requestedLimit = hasLimit
    ? parsePositiveIntegerInput(params.limit)
    : defaultLimit;

  if (!page || !requestedLimit) {
    return { ok: false, error: "Pagination page and limit must be positive integers" };
  }

  const limit = Math.min(requestedLimit, maxLimit);

  return {
    ok: true,
    value: {
      enabled: true,
      page,
      limit,
      skip: (page - 1) * limit,
    },
  };
};
