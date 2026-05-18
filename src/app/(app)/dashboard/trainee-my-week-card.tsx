"use client";

import { format, startOfWeek } from "date-fns";
import Link from "next/link";

import { TraineeWeekCalendar } from "@/app/(app)/turni/trainee-week-calendar";
import { Card } from "@/components/ui/card";
import type { TraineeDashboardWeekPayload } from "@/lib/data/trainee-dashboard-week";

function currentWeekStartMonday(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function TraineeMyWeekCard({ payload }: { payload: TraineeDashboardWeekPayload }) {
  const currentWeekStart = currentWeekStartMonday();

  return (
    <Card
      title="La mia settimana"
      description={payload.weekLabel}
    >
      {!payload.planAvailable ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Nessun planning mensile attivo per questo mese.</p>
          <p>
            <Link href="/turni" className="text-primary underline-offset-2 hover:underline">
              Apri il planning turni
            </Link>
          </p>
        </div>
      ) : payload.week ? (
        <TraineeWeekCalendar week={payload.week} highlightWeekStart={currentWeekStart} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun dato per la settimana corrente nel planning del mese.{" "}
          <Link href="/turni" className="text-primary underline-offset-2 hover:underline">
            Vedi il mese completo
          </Link>
        </p>
      )}
    </Card>
  );
}
