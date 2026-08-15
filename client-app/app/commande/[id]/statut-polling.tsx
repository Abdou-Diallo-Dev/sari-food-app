"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function StatutPolling({ enAttente }: { enAttente: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enAttente) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [enAttente, router]);

  return null;
}
