"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — send everyone to the Today board. */
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/today");
  }, [router]);
  return (
    <div className="app-shell">
      <p className="muted">Opening Today…</p>
    </div>
  );
}
