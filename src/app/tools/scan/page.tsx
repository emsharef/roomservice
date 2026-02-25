import { createAdminClient } from "@/lib/supabase/admin";
import ScanDashboard from "./ScanDashboard";

export default async function ScanPage() {
  const admin = createAdminClient();

  // Fetch staged contacts (without source_images for performance)
  const { data: stagedContacts } = await admin
    .from("staged_contacts")
    .select(
      "id, first_name, last_name, display_name, email, phone, phone_mobile, type, website, company, primary_street, primary_city, primary_state, primary_zip, primary_country, tags, notes, ocr_confidence, duplicate_candidates, status, arternal_contact_id, error_message, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  return <ScanDashboard initialContacts={stagedContacts || []} />;
}
