import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Coevolution of Physics and Life',
  icons: { icon: '/favicon.svg' },
  description:
    'A WebGPU laboratory for embodied organisms and evolving local physical laws.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
