const STORAGE_KEY = "hairbook-redux-state";

export function clearLegacyReduxState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    console.warn("Could not clear legacy app state.");
    return false;
  }

  return true;
}
