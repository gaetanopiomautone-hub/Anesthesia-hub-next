import { format } from "date-fns";
import { it } from "date-fns/locale";

import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getLogbookPortfolioReport, normalizePortfolioQuery } from "@/lib/data/logbook-portfolio";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import { renderLogbookPortfolioPdfToBuffer } from "@/lib/pdf/logbook-portfolio-pdf-render";

export const runtime = "nodejs";

function paramString(url: URL, key: string): string | undefined {
  const v = url.searchParams.get(key);
  return v?.trim() || undefined;
}

export async function GET(req: Request) {
  const profile = await requireSection("report");
  const url = new URL(req.url);

  const query = normalizePortfolioQuery(
    {
      from: paramString(url, "from"),
      to: paramString(url, "to"),
      trainee: paramString(url, "trainee"),
      category: paramString(url, "category"),
    },
    profile,
  );

  const { report, subjectLabel, annoSpecialita, resolvedQuery } = await getLogbookPortfolioReport(profile, query);

  const generatedAtLabel = format(new Date(), "dd/MM/yyyy HH:mm", { locale: it });
  const orgLine = process.env.NEXT_PUBLIC_PLANNING_ORG_LABEL?.trim() || null;

  const buffer = await renderLogbookPortfolioPdfToBuffer(report, {
    orgLine,
    traineeLabel: subjectLabel,
    annoSpecialita,
    periodFromLabel: formatDateItalian(resolvedQuery.from),
    periodToLabel: formatDateItalian(resolvedQuery.to),
    categoryFilter: resolvedQuery.category ?? null,
    generatedAtLabel,
  });

  const slug = subjectLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const filename = `portfolio-logbook-${resolvedQuery.from}_${resolvedQuery.to}${slug ? `-${slug}` : ""}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
