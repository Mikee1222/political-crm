import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppFrame } from "@/components/app-frame";
import { PwaServiceWorkerRegister } from "@/components/pwa-service-worker-register";
import { ProfileProvider } from "@/contexts/profile-context";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeProfileSync } from "@/components/theme-profile-sync";
import { AlexandraChatProvider } from "@/components/alexandra/alexandra-chat-provider";
import { AlexandraPageProvider } from "@/contexts/alexandra-page-context";
import { FormToastProvider } from "@/contexts/form-toast-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Καραγκούνης CRM",
  title: { default: "Καραγκούνης CRM", template: "%s · KK CRM" },
  description: "Political Campaign HQ",
  manifest: "/manifest.json",
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KK CRM",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050D1A",
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="el"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full min-h-full min-h-[100dvh] w-full antialiased`}
    >
      <body
        className="m-0 flex min-h-full min-h-screen min-h-[100dvh] min-h-[-webkit-fill-available] w-full max-w-full flex-col overflow-x-hidden bg-[var(--bg-primary)] p-0 text-[var(--text-primary)] leading-[1.6]"
        suppressHydrationWarning
      >
        <Script id="crm-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('crm-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`}
        </Script>
        <div className="flex min-h-screen min-h-[100dvh] w-screen max-w-screen min-w-0 flex-1 flex-col overflow-x-hidden">
          <PwaServiceWorkerRegister />
          <ThemeProvider>
            <FormToastProvider>
              <ProfileProvider>
                <ThemeProfileSync />
                <AlexandraPageProvider>
                  <AlexandraChatProvider>
                    <AppFrame>{children}</AppFrame>
                  </AlexandraChatProvider>
                </AlexandraPageProvider>
              </ProfileProvider>
            </FormToastProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
