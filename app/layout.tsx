import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LearnOS — 互动式学习平台",
    template: "%s · LearnOS",
  },
  description: "LearnOS 是一个支持图文课程、交互实验与服务端测验的学习平台。",
  icons: {
    icon: [
      {
        url: "/icon-light.png",
        type: "image/png",
        sizes: "128x128",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark.png",
        type: "image/png",
        sizes: "128x128",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('learnos-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
