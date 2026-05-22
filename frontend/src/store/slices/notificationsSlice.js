import { createSlice } from "@reduxjs/toolkit";

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: [],
  reducers: {
    addNotification: {
      reducer: (state, action) => {
        state.push(action.payload);
      },
      prepare: ({ message, type = "info" }) => ({
        payload: {
          id: Date.now() + Math.random(),
          message,
          type,
          createdAt: new Date().toISOString(),
        },
      }),
    },
    removeNotification: (state, action) =>
      state.filter((notification) => notification.id !== action.payload),
  },
});

export const { addNotification, removeNotification } =
  notificationsSlice.actions;
export default notificationsSlice.reducer;
