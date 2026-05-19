import { redirect } from "next/navigation";

import { getMonthContext } from "@/lib/dates/getMonthContext";

type TurniFeriePageProps = {
  searchParams?: Promise<{ month?: string; m?: string }>;
};

/** Vista legacy: reindirizza al planning turni del mese. */
export default async function TurniFeriePage({ searchParams }: TurniFeriePageProps) {
  const sp = (await searchParams) ?? {};
  const monthParam = sp.month ?? sp.m;
  const monthContext = getMonthContext(monthParam);
  const query = new URLSearchParams({ month: monthContext.yearMonth });
  redirect(`/turni?${query.toString()}`);
}
