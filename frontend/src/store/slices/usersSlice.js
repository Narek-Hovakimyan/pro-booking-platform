import { createSlice } from "@reduxjs/toolkit";

const usersSlice = createSlice({
  name: "users",
  initialState: [],
  reducers: {
    addUser: {
      reducer: (state, action) => {
        state.push(action.payload);
      },
      prepare: ({ name, phone, role }) => ({
        payload: {
          id: Date.now(),
          name,
          phone,
          role,
          bio: "",
          city: "",
          address: "",
          instagram: "",
          imageUrl: "",
          galleryImages: [],
          defaultSchedule: {
            startTime: "09:00",
            endTime: "18:00",
            hasBreak: false,
            breakStart: "",
            breakEnd: "",
          },
          createdAt: new Date().toISOString(),
        },
      }),
    },
    updateBarberProfile: (state, action) => {
      const { barberId, profile } = action.payload;
      const barber = state.find(
        (user) => user.role === "barber" && user.id === barberId
      );

      if (barber) {
        barber.name = profile.name ?? barber.name;
        barber.phone = profile.phone ?? barber.phone;
        barber.bio = profile.bio;
        barber.city = profile.city;
        barber.address = profile.address;
        barber.instagram = profile.instagram;
        barber.imageUrl = profile.imageUrl;
        barber.avatarUrl = profile.avatarUrl ?? barber.avatarUrl;
        barber.salon = profile.salon ?? barber.salon;
        barber.salonStatus = profile.salonStatus ?? barber.salonStatus;
        barber.workHistory = profile.workHistory ?? barber.workHistory;
        barber.galleryImages = profile.galleryImages || [];
        barber.defaultSchedule = profile.defaultSchedule ?? barber.defaultSchedule;
      }
    },
    setBarbers: (state, action) => {
      const nonBarbers = state.filter((user) => user.role !== "barber");
      const barbers = action.payload.map((barber) => ({
        ...barber,
        id: barber.id || barber._id,
      }));

      return [...nonBarbers, ...barbers];
    },
  },
});

export const { addUser, setBarbers, updateBarberProfile } = usersSlice.actions;
export default usersSlice.reducer;
