"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";
import { NotificationBell, type NotificationItem } from "@/components/NotificationBell";
import { NotificationSound } from "@/components/NotificationSound";
import { GlobalSearch } from "@/components/GlobalSearch";
import { IconHome, IconLogOut, IconMenu, IconClose, IconArrowLeft } from "@/components/icons";
import { navItemsPour } from "@/lib/nav";
import { LABELS_ROLE } from "@/lib/roles";

export function AppShell({
  profile,
  restaurantNom,
  notifications,
  children,
}: {
  profile: Profile;
  restaurantNom: string | null;
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const items = [{ href: "/", label: "Accueil", icon: IconHome }, ...navItemsPour(profile.role)];

  return (
    <div className="min-h-screen lg:flex">
      <NotificationSound utilisateurId={profile.id} />
      <header className="sticky top-0 z-30 flex flex-col gap-2.5 border-b border-line bg-surface px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/sari-logo.png" alt="Sari Food" width={100} height={44} className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell notifications={notifications} />
            <button
              onClick={() => setMenuOuvert((v) => !v)}
              aria-label="Menu"
              className="rounded-[9px] border border-line p-2 text-ink-soft"
            >
              {menuOuvert ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <GlobalSearch role={profile.role} />
      </header>

      <aside
        className={`z-20 flex w-full flex-col overflow-y-auto border-r border-line bg-surface px-4 py-6 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 ${
          menuOuvert ? "fixed inset-0 block" : "hidden"
        } lg:block`}
      >
        <div className="mb-6 hidden items-center justify-between px-2 lg:flex">
          <Image src="/sari-logo.png" alt="Sari Food" width={130} height={56} className="h-9 w-auto" />
          <NotificationBell notifications={notifications} />
        </div>

        <div className="mb-5 rounded-[14px] bg-paper px-3.5 py-3">
          <p className="text-[.68rem] font-bold uppercase tracking-[.1em] text-orange">
            {LABELS_ROLE[profile.role] ?? profile.role}
          </p>
          <p className="font-display font-extrabold text-ink">{profile.nom}</p>
          {restaurantNom && <p className="text-xs text-ink-soft opacity-70">{restaurantNom}</p>}
        </div>

        <div className="mb-4">
          <GlobalSearch role={profile.role} />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const actif = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOuvert(false)}
                className={`flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-sm font-bold transition ${
                  actif
                    ? "bg-orange text-white"
                    : "text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="mt-4 flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-sm font-bold text-ink-soft transition hover:bg-paper hover:text-red-600"
          >
            <IconLogOut className="h-[18px] w-[18px]" />
            Déconnexion
          </button>
        </form>
      </aside>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        {pathname !== "/" && (
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-1.5 text-sm font-bold text-ink-soft transition hover:text-orange"
          >
            <IconArrowLeft className="h-4 w-4" />
            Retour
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
