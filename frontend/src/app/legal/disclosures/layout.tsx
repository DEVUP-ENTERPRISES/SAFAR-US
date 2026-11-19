import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Website disclosures · CatoDrive',
  description: 'How to read the figures, examples, forecasts and service descriptions on the CatoDrive website.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
