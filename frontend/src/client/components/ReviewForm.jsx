import { useState } from "react";
import { Star } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function ReviewForm({ onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const submitReview = (event) => {
    event.preventDefault();
    onSubmit({ rating, comment });
    setComment("");
  };

  return (
    <form className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4" onSubmit={submitReview}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            aria-label={`${value} star rating`}
            className="text-amber-500"
            key={value}
            onClick={() => setRating(value)}
            type="button"
          >
            <Star
              className={`h-5 w-5 ${value <= rating ? "fill-amber-400" : ""}`}
            />
          </button>
        ))}
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        Review
        <textarea
          className="w-full rounded-2xl border bg-white p-3 font-normal"
          placeholder="Write your review"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      <Button type="submit">Submit review</Button>
    </form>
  );
}
