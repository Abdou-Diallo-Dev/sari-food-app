"use client";

import { useState } from "react";
import { IconCamera, IconImage } from "@/components/icons";

export function PhotoPicker({
  name,
  currentUrl,
  size = 72,
}: {
  name: string;
  currentUrl?: string | null;
  size?: number;
}) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);

  return (
    <label
      className="group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[12px] border border-dashed border-line bg-paper text-ink-soft transition hover:border-orange"
      style={{ width: size, height: size }}
      title="Changer la photo"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <IconImage className="h-6 w-6 opacity-40" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
        <IconCamera className="h-5 w-5" />
      </span>
      <input
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPreview(URL.createObjectURL(file));
        }}
      />
    </label>
  );
}
