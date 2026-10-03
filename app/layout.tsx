import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AP Water Watch | เฝ้าระวังน้ำรอบโครงการ",
  description:
    "ติดตามสถานการณ์น้ำและฝนรอบโครงการ AP Thailand พร้อมข้อมูลสถานีและแนวทางเตรียมรับมือ",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
