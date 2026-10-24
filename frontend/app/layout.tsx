import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ServiceWorkerRegistration } from "@/components/providers/ServiceWorkerRegistration";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "AI Fitness Platform — Your Personal AI Coach",
  description:
    "Offline-first fitness platform: personalised workout plans, smart nutrition logging, progress analytics and a local AI coach.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} font-sans antialiased min-h-screen`}>
        <ThemeProvider>
          <AuthProvider>
            <ServiceWorkerRegistration />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
