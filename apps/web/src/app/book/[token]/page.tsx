import type { Metadata } from 'next';
import { BookingPage } from '@/components/scheduler/booking-page';

export const metadata: Metadata = {
  title: 'Choose your interview time',
  // The address works like a password, so it must not reach search engines or other sites.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function BookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BookingPage token={token} />;
}
