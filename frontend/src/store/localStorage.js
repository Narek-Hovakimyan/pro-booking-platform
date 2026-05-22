const STORAGE_KEY = "hairbook-redux-state";
const PERSISTED_SLICES = ["users", "auth"];
const API_DATA_SLICES = ["services", "schedule", "bookings", "reviews"];

function normalizeState(state) {
  if (!state) return state;

  const nextState = { ...state };

  API_DATA_SLICES.forEach((sliceName) => {
    delete nextState[sliceName];
  });

  if (nextState.auth) {
    const hasSession = Boolean(nextState.auth.token && nextState.auth.currentUser);

    nextState.auth = {
      currentUser: hasSession ? nextState.auth.currentUser : null,
      token: hasSession ? nextState.auth.token : null,
      isAuthenticated: hasSession,
    };
  }

  return nextState;
}

export function loadState() {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);

    if (!serializedState) {
      return undefined;
    }

    return normalizeState(JSON.parse(serializedState));
  } catch (error) {
    console.warn("Could not load saved app state.", error);
    return undefined;
  }
}

export function saveState(state) {
  try {
    const persistedState = PERSISTED_SLICES.reduce((result, sliceName) => {
      result[sliceName] = state[sliceName];
      return result;
    }, {});

    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
  } catch (error) {
    console.warn("Could not save app state.", error);
  }
}
