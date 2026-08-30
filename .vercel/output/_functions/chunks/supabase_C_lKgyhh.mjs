import { createClient } from "@supabase/supabase-js";
//#region src/lib/supabase.ts
var client = null;
function getServiceClient() {
	if (client) return client;
	const url = process.env.SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceRoleKey) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno");
	client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
	return client;
}
//#endregion
export { getServiceClient as t };
