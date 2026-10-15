import { redirect } from 'next/navigation';

/** The host site opens on the host area; its layout sends captains and new hosts where they belong. */
export default function HostHome() {
  redirect('/ops');
}
