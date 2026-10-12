import type { NotificationCategory } from './api';

export type NotificationChannel = 'push' | 'email' | 'sms';

export const NOTIFICATION_CHANNELS: { key: NotificationChannel; label: string; detail: string }[] = [
  { key: 'push', label: 'Push', detail: 'On your phone and browser.' },
  { key: 'email', label: 'Email', detail: 'To your account address.' },
  { key: 'sms', label: 'SMS', detail: 'Text messages for time-sensitive updates.' },
];

export const NOTIFICATION_TOPICS: { key: NotificationCategory; label: string; detail: string }[] = [
  { key: 'trips', label: 'Trips', detail: 'Bookings, pick-up/return, changes, reminders.' },
  { key: 'messages', label: 'Messages', detail: 'When your host or guest messages you.' },
  { key: 'payments', label: 'Payments & payouts', detail: 'Charges, refunds, receipts, earnings.' },
  { key: 'reviews', label: 'Reviews', detail: 'When a review is left or is due.' },
  { key: 'promotions', label: 'Promotions & tips', detail: 'Deals, credits, and product news.' },
];
