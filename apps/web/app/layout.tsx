import type { Metadata } from "next";

import { FirebaseAuthGate } from "../components/firebase-auth-gate";
import { AppQueryProvider } from "../lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tendyy | Dashboard",
  description: "Dashboard-first tender workspace for pipeline, reviews, submissions, knowledge, and analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppQueryProvider>
          <FirebaseAuthGate>{children}</FirebaseAuthGate>
        </AppQueryProvider>
      </body>
    </html>
  );
}
