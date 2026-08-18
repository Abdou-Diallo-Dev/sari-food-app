"use client";

import { useState } from "react";
import { ROLES, LABELS_ROLE, POLES, ROLES_AVEC_POLE, type RoleUtilisateur } from "@/lib/roles";

export function RolePoleSelect({
  roleDefaultValue = "",
  poleDefaultValue = "",
  rolePlaceholder,
  selectClassName,
}: {
  roleDefaultValue?: RoleUtilisateur | "";
  poleDefaultValue?: string;
  rolePlaceholder?: string;
  selectClassName: string;
}) {
  const [role, setRole] = useState<string>(roleDefaultValue);
  const avecPole = ROLES_AVEC_POLE.includes(role as RoleUtilisateur);

  return (
    <>
      <select
        name="role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className={selectClassName}
      >
        {rolePlaceholder && (
          <option value="" disabled>
            {rolePlaceholder}
          </option>
        )}
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {LABELS_ROLE[r]}
          </option>
        ))}
      </select>
      {avecPole && (
        <select name="pole" defaultValue={poleDefaultValue} className={selectClassName}>
          <option value="">Pôle</option>
          {POLES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
