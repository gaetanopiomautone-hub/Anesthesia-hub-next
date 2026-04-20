insert into public.clinical_locations (id, name, area_type, specialty)
values
  ('00000000-0000-0000-0000-000000000101', 'S.O. 2 Ortopedia', 'sala_operatoria', 'Ortopedia'),
  ('00000000-0000-0000-0000-000000000102', 'S.O. 4 Cardiochirurgia', 'sala_operatoria', 'Cardiochirurgia'),
  ('00000000-0000-0000-0000-000000000103', 'Rianimazione', 'rianimazione', 'Terapia intensiva')
on conflict (id) do nothing;

insert into public.procedure_catalog (id, name, category, description)
values
  ('00000000-0000-0000-0000-000000000201', 'Intubazione orotracheale', 'Vie aeree', 'Gestione avanzata vie aeree'),
  ('00000000-0000-0000-0000-000000000202', 'Posizionamento arteriosa', 'Accessi', 'Cannulazione arteriosa invasiva'),
  ('00000000-0000-0000-0000-000000000203', 'Blocco periferico eco-guidato', 'Anestesia loco-regionale', 'Tecniche eco-guidate')
on conflict (id) do nothing;

-- Dopo la creazione degli utenti auth, sostituire gli UUID placeholder con quelli reali di auth.users.
insert into public.profiles (id, email, full_name, role, year_of_training)
values
  ('10000000-0000-0000-0000-000000000001', 'giulia.bianchi@policlinicosandonato.it', 'Giulia Bianchi', 'specializzando', 3),
  ('10000000-0000-0000-0000-000000000002', 'marco.rinaldi@policlinicosandonato.it', 'Marco Rinaldi', 'addetto_turni', null),
  ('10000000-0000-0000-0000-000000000003', 'laura.conti@policlinicosandonato.it', 'Laura Conti', 'admin', null),
  ('10000000-0000-0000-0000-000000000004', 'davide.sala@policlinicosandonato.it', 'Davide Sala', 'tutor_strutturato', null)
on conflict (id) do nothing;

insert into public.shifts (shift_date, shift_kind, location_id, assignee_profile_id, supervisor_profile_id, created_by)
values
  ('2026-04-13', 'mattina', '00000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002'),
  ('2026-04-15', 'mattina', '00000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002'),
  ('2026-04-16', 'notte', '00000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003');

insert into public.leave_requests (requester_profile_id, request_type, start_date, end_date, status, note, approved_by, approved_at)
values
  ('10000000-0000-0000-0000-000000000001', 'ferie', '2026-05-11', '2026-05-15', 'in_attesa', 'Richiesta ferie gia'' concordata con il tutor', null, null),
  ('10000000-0000-0000-0000-000000000001', 'desiderata', '2026-06-02', '2026-06-02', 'approvato', 'Preferenza per attivita'' di sala operatoria', '10000000-0000-0000-0000-000000000003', now());

insert into public.university_events (title, description, event_date, start_time, end_time, location, created_by)
values
  ('Lezione ECM - Airway Management', 'Modulo teorico-pratico sulle vie aeree difficili', '2026-04-21', '14:00', '18:00', 'Aula Magna', '10000000-0000-0000-0000-000000000003'),
  ('Seminario analgesia perioperatoria', 'Aggiornamento multidisciplinare', '2026-04-28', '09:00', '12:00', 'Universita Vita-Salute', '10000000-0000-0000-0000-000000000003');

-- PDF didattici: usare upload da app (bucket privato learning-pdfs); file_url = path oggetto, non URL pubblico.
insert into public.learning_resources (title, description, resource_type, file_url, external_url, visibility, created_by)
values
  ('Protocollo vie aeree difficili', 'Esempio link (sostituibile con PDF da Storage)', 'link', null, 'https://example.com/airway', array['specializzando','tutor_strutturato','admin']::public.app_role[], '10000000-0000-0000-0000-000000000003'),
  ('Linee guida sedazione in rianimazione', 'Riferimento esterno', 'link', null, 'https://example.com/sedazione', array['specializzando','tutor_strutturato','admin','addetto_turni']::public.app_role[], '10000000-0000-0000-0000-000000000003');

insert into public.logbook_entries (trainee_profile_id, procedure_catalog_id, performed_on, clinical_location_id, supervision_level, autonomy_level, confidence_level, supervisor_profile_id, notes)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '2026-04-15', '00000000-0000-0000-0000-000000000102', 'diretta', 'con_supervisione', 4, '10000000-0000-0000-0000-000000000004', 'Nessun dato identificativo paziente registrato'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', '2026-04-13', '00000000-0000-0000-0000-000000000101', 'indiretta', 'autonomo', 5, '10000000-0000-0000-0000-000000000004', 'Procedura eseguita in autonomia controllata');
