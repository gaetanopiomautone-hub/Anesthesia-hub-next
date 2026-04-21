import type { AppRole } from "@/lib/auth/roles";

export type DemoUser = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  residencyYear: number | null;
};

export const demoUsers: DemoUser[] = [
  {
    id: "usr-sp1",
    fullName: "Giulia Bianchi",
    email: "giulia.bianchi@policlinicosandonato.it",
    role: "specializzando",
    residencyYear: 3,
  },
  {
    id: "usr-turni-1",
    fullName: "Marco Rinaldi",
    email: "marco.rinaldi@policlinicosandonato.it",
    role: "tutor",
    residencyYear: null,
  },
  {
    id: "usr-admin-1",
    fullName: "Laura Conti",
    email: "laura.conti@policlinicosandonato.it",
    role: "admin",
    residencyYear: null,
  },
  {
    id: "usr-tutor-1",
    fullName: "Davide Sala",
    email: "davide.sala@policlinicosandonato.it",
    role: "tutor",
    residencyYear: null,
  },
];

export const demoShifts = [
  { date: "2026-04-13", unit: "S.O. 2 Ortopedia", area: "Sala operatoria", shift: "Mattina", assignedTo: "Giulia Bianchi" },
  { date: "2026-04-14", unit: "Rianimazione", area: "Terapia intensiva", shift: "Giornaliero", assignedTo: "Giulia Bianchi" },
  { date: "2026-04-15", unit: "S.O. 4 Cardiochirurgia", area: "Sala operatoria", shift: "Mattina", assignedTo: "Giulia Bianchi" },
  { date: "2026-04-16", unit: "Rianimazione", area: "Terapia intensiva", shift: "Notte", assignedTo: "Marco Rinaldi" },
];

export const demoLeaveRequests = [
  { id: "lv1", requester: "Giulia Bianchi", from: "2026-05-11", to: "2026-05-15", type: "Ferie", status: "Da approvare" },
  { id: "lv2", requester: "Giulia Bianchi", from: "2026-06-02", to: "2026-06-02", type: "Desiderata", status: "Approvato" },
];

export const demoUniversityEvents = [
  { id: "ev1", date: "2026-04-21", title: "Lezione ECM - Airway Management", location: "Aula Magna", category: "Lezione" },
  { id: "ev2", date: "2026-04-28", title: "Seminario analgesia perioperatoria", location: "Universita Vita-Salute", category: "Seminario" },
];

export const demoResources = [
  { id: "res1", title: "Protocollo vie aeree difficili", type: "PDF", href: "#", audience: "Tutti" },
  { id: "res2", title: "Linee guida sedazione in rianimazione", type: "Link", href: "#", audience: "Tutor / Specializzandi" },
];

export const demoLogbook = [
  { id: "log1", date: "2026-04-15", procedure: "Intubazione orotracheale", supervision: "Diretta", autonomy: "Eseguita con supervisione", confidence: 4 },
  { id: "log2", date: "2026-04-13", procedure: "Posizionamento arteriosa", supervision: "Indiretta", autonomy: "Autonomo", confidence: 5 },
  { id: "log3", date: "2026-04-10", procedure: "Blocco periferico eco-guidato", supervision: "Diretta", autonomy: "Assistito", confidence: 3 },
];

export const demoReports = {
  week: [
    { label: "Intubazioni", value: 4 },
    { label: "CVC", value: 2 },
    { label: "Blocchi periferici", value: 1 },
  ],
  month: [
    { label: "Intubazioni", value: 18 },
    { label: "CVC", value: 8 },
    { label: "Blocchi periferici", value: 12 },
  ],
  rollingTwoMonths: [
    { label: "Intubazioni", value: 31 },
    { label: "CVC", value: 15 },
    { label: "Blocchi periferici", value: 21 },
  ],
};
