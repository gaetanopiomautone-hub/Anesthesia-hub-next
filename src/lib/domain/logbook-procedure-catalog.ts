/** Voce foglia del catalogo procedure logbook (categoria → procedura → sottotipo opz.). */
export type LogbookCatalogLeaf = {
  category: string;
  procedure: string;
  subtype?: string | null;
};

export const LOGBOOK_PROCEDURE_CATALOG: LogbookCatalogLeaf[] = [
  { category: "Intubazione", procedure: "Laringoscopia diretta" },
  { category: "Intubazione", procedure: "Fibroscopica" },
  { category: "Intubazione", procedure: "Videolaringoscopia" },

  { category: "Accesso venoso centrale", procedure: "Femorale" },
  { category: "Accesso venoso centrale", procedure: "Giugulare" },
  { category: "Accesso venoso centrale", procedure: "Succlavia" },

  { category: "Accesso arterioso", procedure: "Femorale" },
  { category: "Accesso arterioso", procedure: "Radiale" },
  { category: "Accesso arterioso", procedure: "Omerale" },

  { category: "Anestesia neuroassiale", procedure: "Spinale" },
  { category: "Anestesia neuroassiale", procedure: "Peridurale" },
  { category: "Anestesia neuroassiale", procedure: "Spino-peridurale" },

  { category: "Monitoraggio emodinamico", procedure: "Swan Ganz" },

  { category: "Blocchi di fascia", procedure: "ESP Block" },
  { category: "Blocchi di fascia", procedure: "TAP Block" },
  { category: "Blocchi di fascia", procedure: "Rectus Sheath" },

  { category: "Blocchi perinervosi", procedure: "Interscalenico" },
  { category: "Blocchi perinervosi", procedure: "Sovraclaveare" },
  { category: "Blocchi perinervosi", procedure: "Ascellare" },
  { category: "Blocchi perinervosi", procedure: "Femorale" },
  { category: "Blocchi perinervosi", procedure: "PENG" },
  { category: "Blocchi perinervosi", procedure: "Fascia iliaca" },
  { category: "Blocchi perinervosi", procedure: "Sciatico", subtype: "Sottogluteo" },
  { category: "Blocchi perinervosi", procedure: "Sciatico", subtype: "Popliteo" },
  { category: "Blocchi perinervosi", procedure: "Sciatico", subtype: "Via anteriore" },
  { category: "Blocchi perinervosi", procedure: "Ankle Block" },
  { category: "Blocchi perinervosi", procedure: "Otturatorio" },
];

export function formatProcedureCatalogDisplayName(leaf: Pick<LogbookCatalogLeaf, "procedure" | "subtype">): string {
  const sub = leaf.subtype?.trim();
  return sub ? `${leaf.procedure} — ${sub}` : leaf.procedure;
}

export function formatProcedureCatalogPath(leaf: LogbookCatalogLeaf): string {
  const base = `${leaf.category} › ${formatProcedureCatalogDisplayName(leaf)}`;
  return base;
}

export type ProcedureCatalogGrouped = {
  category: string;
  procedures: {
    procedure: string;
    items: { id: string; subtype: string | null; displayName: string }[];
  }[];
};

/** Raggruppa righe DB per select a cascata. */
export function groupProcedureCatalogRows(
  rows: {
    id: string;
    category: string;
    procedure_name: string;
    subtype: string | null;
  }[],
): ProcedureCatalogGrouped[] {
  const byCategory = new Map<string, Map<string, { id: string; subtype: string | null; displayName: string }[]>>();

  for (const row of rows) {
    const catMap = byCategory.get(row.category) ?? new Map();
    const list = catMap.get(row.procedure_name) ?? [];
    list.push({
      id: row.id,
      subtype: row.subtype,
      displayName: formatProcedureCatalogDisplayName({
        procedure: row.procedure_name,
        subtype: row.subtype,
      }),
    });
    catMap.set(row.procedure_name, list);
    byCategory.set(row.category, catMap);
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "it"))
    .map(([category, procMap]) => ({
      category,
      procedures: [...procMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "it"))
        .map(([procedure, items]) => ({
          procedure,
          items: items.sort((a, b) => (a.subtype ?? "").localeCompare(b.subtype ?? "", "it")),
        })),
    }));
}
