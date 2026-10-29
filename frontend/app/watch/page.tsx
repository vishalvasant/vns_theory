"use client";

import { Suspense } from "react";
import WatchClient from "./WatchClient";

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <p className="muted">Loading Watch…</p>
        </div>
      }
    >
      <WatchClient />
    </Suspense>
  );
}
