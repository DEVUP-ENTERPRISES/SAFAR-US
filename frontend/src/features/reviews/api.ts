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

/** How a host's ratings spread across one to five stars. */
export interface RatingDistribution {
  total: number;
  avg: number;
  counts: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export const reviewsApi = {
  /** Public reviews about a host (or guest). */
  forSubject: (subjectId: string) => api.get<Review[]>('/reviews', { subjectId }, false),
  distribution: (subjectId: string) => api.get<RatingDistribution>('/reviews/distribution', { subjectId }, false),
  /** Both directions of review on a booking - to know who has reviewed. */
  forBooking: (bookingId: string) =>
    api.get<Review[]>(`/reviews/booking/${bookingId}`),
  create: (bookingId: string, rating: number, comment: string) =>
    api.post<Review>("/reviews", { bookingId, rating, comment }),
};
