import { api } from "@/lib/api/client";

export interface Review {
  _id: string;
  bookingId: string;
  direction: "guest_to_host" | "host_to_guest";
  authorId: string;
  subjectId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const reviewsApi = {
  /** Both directions of review on a booking — to know who has reviewed. */
  forBooking: (bookingId: string) =>
    api.get<Review[]>(`/reviews/booking/${bookingId}`),
  create: (bookingId: string, rating: number, comment: string) =>
    api.post<Review>("/reviews", { bookingId, rating, comment }),
};
