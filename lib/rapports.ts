export type TypePeriode = "jour" | "semaine" | "mois" | "annee" | "personnalise";

export const PERIODES: { value: TypePeriode; label: string }[] = [
  { value: "jour", label: "Aujourd'hui" },
  { value: "semaine", label: "Cette semaine" },
  { value: "mois", label: "Ce mois-ci" },
  { value: "annee", label: "Cette année" },
  { value: "personnalise", label: "Période personnalisée" },
];

function debutJour(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function debutSemaine(d: Date): Date {
  const x = debutJour(d);
  const jour = x.getDay();
  const decalage = jour === 0 ? 6 : jour - 1;
  x.setDate(x.getDate() - decalage);
  return x;
}

function debutMois(d: Date): Date {
  const x = debutJour(d);
  x.setDate(1);
  return x;
}

function debutAnnee(d: Date): Date {
  const x = debutJour(d);
  x.setMonth(0, 1);
  return x;
}

export function resoudrePeriode(
  type: TypePeriode,
  personnaliseDebut?: string,
  personnaliseFin?: string,
): { debut: Date; fin: Date; label: string } {
  const maintenant = new Date();

  if (type === "semaine") {
    const debut = debutSemaine(maintenant);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 7);
    return { debut, fin, label: "Cette semaine" };
  }
  if (type === "mois") {
    const debut = debutMois(maintenant);
    const fin = new Date(debut);
    fin.setMonth(fin.getMonth() + 1);
    return { debut, fin, label: "Ce mois-ci" };
  }
  if (type === "annee") {
    const debut = debutAnnee(maintenant);
    const fin = new Date(debut);
    fin.setFullYear(fin.getFullYear() + 1);
    return { debut, fin, label: "Cette année" };
  }
  if (
    type === "personnalise" &&
    personnaliseDebut &&
    personnaliseFin &&
    /^\d{4}-\d{2}-\d{2}$/.test(personnaliseDebut) &&
    /^\d{4}-\d{2}-\d{2}$/.test(personnaliseFin)
  ) {
    const debut = new Date(`${personnaliseDebut}T00:00:00`);
    const fin = new Date(`${personnaliseFin}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    if (fin > debut) {
      return { debut, fin, label: `Du ${personnaliseDebut} au ${personnaliseFin}` };
    }
  }

  const debut = debutJour(maintenant);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin, label: "Aujourd'hui" };
}
