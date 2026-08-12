"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IconBell } from "@/components/icons";
import { marquerNotificationLue, marquerToutesLues } from "@/lib/notifications-actions";

export type NotificationItem = {
  id: string;
  message: string;
  lien: string | null;
  lu: boolean;
  created_at: string;
};

function tempsEcoule(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function NotificationBell({ notifications }: { notifications: NotificationItem[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [, startTransition] = useTransition();
  const nonLues = notifications.filter((n) => !n.lu).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-[9px] p-2 text-ink-soft hover:bg-paper hover:text-ink"
      >
        <IconBell className="h-5 w-5" />
        {nonLues > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[.65rem] font-bold text-white">
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <button
            aria-label="Fermer"
            onClick={() => setOuvert(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto rounded-card border border-line bg-surface p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-ink">Notifications</span>
              {nonLues > 0 && (
                <button
                  onClick={() => startTransition(() => marquerToutesLues())}
                  className="text-xs font-bold text-orange hover:underline"
                >
                  Tout marquer lu
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft opacity-70">
                Aucune notification.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.lien ?? "#"}
                      onClick={() => {
                        setOuvert(false);
                        if (!n.lu) startTransition(() => marquerNotificationLue(n.id));
                      }}
                      className={`block rounded-[10px] px-2.5 py-2 text-sm hover:bg-paper ${
                        n.lu ? "text-ink-soft" : "font-bold text-ink"
                      }`}
                    >
                      <span className="flex items-start gap-1.5">
                        {!n.lu && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />}
                        <span>
                          {n.message}
                          <span className="block text-xs font-normal text-ink-soft opacity-70">
                            {tempsEcoule(n.created_at)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
