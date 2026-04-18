export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: string;
          email: string;
          residency_year: number | null;
          created_at: string;
        };
      };
      shifts: {
        Row: {
          id: string;
          shift_date: string;
          area_type: string;
          location_name: string;
          shift_kind: string;
          assignee_profile_id: string | null;
          supervisor_profile_id: string | null;
        };
      };
      leave_requests: {
        Row: {
          id: string;
          requester_profile_id: string;
          request_type: string;
          start_date: string;
          end_date: string;
          status: string;
          note: string | null;
        };
      };
      university_events: {
        Row: {
          id: string;
          title: string;
          event_date: string;
          start_time: string | null;
          end_time: string | null;
          location: string | null;
        };
      };
      learning_resources: {
        Row: {
          id: string;
          title: string;
          resource_type: string;
          file_url: string | null;
          external_url: string | null;
          visibility: string;
        };
      };
      logbook_entries: {
        Row: {
          id: string;
          trainee_profile_id: string;
          procedure_catalog_id: string;
          performed_on: string;
          supervision_level: string;
          autonomy_level: string;
          confidence_level: number;
          notes: string | null;
        };
      };
    };
  };
};
