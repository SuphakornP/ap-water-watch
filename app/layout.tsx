import type { Metadata } from "next";
import "./globals.css";
import "./water-watch.css";
import "./decision-support.css";
export const metadata: Metadata = {
  title: "AP Water Watch | ความเสี่ยงและการรับมือน้ำรอบโครงการ",
  description:
    "สรุปความเสี่ยง เหตุผล ผลกระทบที่ต้องตรวจ และสิ่งที่ควรทำสำหรับแต่ละโครงการ พร้อมแผนที่พื้นที่และ Snapshot สำหรับส่งต่อ",
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
