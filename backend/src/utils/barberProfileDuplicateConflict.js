export const BARBER_PROFILE_UNIQUE_INDEX = "barberprofiles_barberId_unique";

export class BarberProfileConflictError extends Error {
  constructor() {
    super("Could not save barber profile");
    this.name = "BarberProfileConflictError";
    this.code = "BARBER_PROFILE_CONFLICT";
    this.statusCode = 409;
  }
}

export class BarberProfileWriteError extends Error {
  constructor() {
    super("Could not save barber profile");
    this.name = "BarberProfileWriteError";
  }
}

const hasExpectedKeyPattern = (error) => {
  const keyPattern = error?.keyPattern;

  return Boolean(
    keyPattern &&
      typeof keyPattern === "object" &&
      !Array.isArray(keyPattern) &&
      Object.keys(keyPattern).length === 1 &&
      keyPattern.barberId === 1
  );
};

const hasExpectedIndexName = (error) =>
  Boolean(
    error?.index === BARBER_PROFILE_UNIQUE_INDEX ||
      (typeof error?.message === "string" &&
        error.message.includes(`index: ${BARBER_PROFILE_UNIQUE_INDEX} `))
  );

export const isBarberProfileDuplicateConflict = (error) =>
  error?.code === 11000 && hasExpectedKeyPattern(error) && hasExpectedIndexName(error);

export const retryBarberProfileUpsertOnDuplicate = async ({
  BarberProfileModel,
  barberId,
  update,
  options,
  projection,
}) => {
  const executeUpdate = (retryOptions) => {
    const query = BarberProfileModel.findOneAndUpdate({ barberId }, update, retryOptions);
    return projection && typeof query?.select === "function" ? query.select(projection) : query;
  };

  try {
    return await executeUpdate(options);
  } catch (error) {
    if (!isBarberProfileDuplicateConflict(error)) throw new BarberProfileWriteError();

    const { upsert: _upsert, ...retryOptions } = options;
    try {
      return await executeUpdate(retryOptions);
    } catch {
      throw new BarberProfileWriteError();
    }
  }
};
