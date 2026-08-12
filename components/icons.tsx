type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconChart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
      <path d="M2.5 20.5h19" />
    </svg>
  );
}

export function IconCart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2.2l1.9 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L20.8 7H6" />
    </svg>
  );
}

export function IconChefHat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 13.5V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5.5" />
      <path d="M6 10.2a3.3 3.3 0 0 1 2.6-5.4c.3-1.6 1.7-2.8 3.4-2.8s3.1 1.2 3.4 2.8a3.3 3.3 0 0 1 2.6 5.4 3 3 0 0 1-.2 4.3H6.2A3 3 0 0 1 6 10.2Z" />
    </svg>
  );
}

export function IconWallet({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="M15.5 12.5h3a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-3a1.5 1.5 0 0 1 0-3Z" />
      <path d="M6.5 6 15 3.5" />
    </svg>
  );
}

export function IconBox({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 7v10l8.5 4 8.5-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

export function IconBook({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M12 3h6.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H12" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.7 19.5a6.3 6.3 0 0 1 12.6 0" />
      <path d="M15.5 5a3.2 3.2 0 0 1 0 6.3M18 13.2a6.3 6.3 0 0 1 3.8 6.3" />
    </svg>
  );
}

export function IconLogOut({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function IconPrinter({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 8.5V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v4.5" />
      <path d="M5.5 17H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1.5" />
      <path d="M6.5 13.5h11V21a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}
