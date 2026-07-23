import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  currentUser: null,
  token: null,
  isAuthenticated: false,
};

function applyAuthSession(state, payload = {}) {
  state.currentUser = payload.user;
  state.token = payload.token;
  state.isAuthenticated = Boolean(payload.token && payload.user);
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    registerUser: (state, action) => {
      applyAuthSession(state, action.payload);
    },
    loginUser: (state, action) => {
      applyAuthSession(state, action.payload);
    },
    restoreAuthSession: (state, action) => {
      applyAuthSession(state, action.payload);
    },
    logoutUser: (state) => {
      state.currentUser = null;
      state.token = null;
      state.isAuthenticated = false;
    },
    expireAuthSession: (state) => {
      state.currentUser = null;
      state.token = null;
      state.isAuthenticated = false;
    },
    updateCurrentUser: (state, action) => {
      if (state.currentUser) {
        const hasChanges = Object.entries(action.payload).some(
          ([key, value]) => !Object.is(state.currentUser[key], value)
        );

        if (hasChanges) {
          Object.assign(state.currentUser, action.payload);
        }
      }
    },
  },
});

export const {
  registerUser,
  loginUser,
  restoreAuthSession,
  logoutUser,
  expireAuthSession,
  updateCurrentUser,
} = authSlice.actions;
export default authSlice.reducer;
