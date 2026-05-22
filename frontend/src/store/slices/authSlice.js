import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  currentUser: null,
  token: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    registerUser: (state, action) => {
      state.currentUser = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = Boolean(action.payload.token && action.payload.user);
    },
    loginUser: (state, action) => {
      state.currentUser = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = Boolean(action.payload.token && action.payload.user);
    },
    logoutUser: (state) => {
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

export const { registerUser, loginUser, logoutUser, updateCurrentUser } =
  authSlice.actions;
export default authSlice.reducer;
