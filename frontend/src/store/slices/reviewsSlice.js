import { createSlice } from "@reduxjs/toolkit";

const reviewsSlice = createSlice({
  name: "reviews",
  initialState: [],
  reducers: {
    setReviews: (state, action) => {
      const reviews = Array.isArray(action.payload)
        ? action.payload
        : action.payload.reviews;
      const scopedBarberId = Array.isArray(action.payload)
        ? null
        : action.payload.barberId;
      const incomingReviews = reviews.map((review) => ({
        ...review,
        id: review.id || review._id,
      }));
      const barberIds = new Set(
        incomingReviews.map((review) => String(review.barberId))
      );
      const shouldRemoveReview = (review) =>
        scopedBarberId
          ? String(review.barberId) === String(scopedBarberId)
          : barberIds.has(String(review.barberId));
      const otherReviews = state.filter(
        (review) => !shouldRemoveReview(review)
      );

      return [...otherReviews, ...incomingReviews];
    },
    addReview: (state, action) => {
      const review = {
        ...action.payload,
        id: action.payload.id || action.payload._id,
      };
      const alreadyReviewed = state.some(
        (item) => String(item.bookingId) === String(review.bookingId)
      );

      if (!alreadyReviewed) {
        state.push(review);
      }
    },
  },
});

export const { addReview, setReviews } = reviewsSlice.actions;
export default reviewsSlice.reducer;
