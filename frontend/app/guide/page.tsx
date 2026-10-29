"use client";

import AppShell from "@/components/AppShell";
import LabelGuide from "@/components/LabelGuide";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { User, logout, me } from "@/lib/api";

export default function GuidePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  if (!user) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell
      mode="user"
      user={user}
      active="learn"
      title="Label guide"
      subtitle="How to read Teji, Mandi, DT, DB and reactions"
    >
      <LabelGuide />
    </AppShell>
  );
}
