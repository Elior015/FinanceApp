/**
 * One-off bootstrap: creates the minimum real rows the schema requires
 * before a `connections` row can exist (owner_user_id has a NOT NULL
 * FK to auth.users), so the real `agent sync` path can be exercised
 * end-to-end for Max. Not part of the permanent CLI surface — this is
 * a stand-in for what will eventually be a proper signup flow in the
 * web app.
 *
 * Creates the auth user WITHOUT a password (email_confirm: true) so a
 * real login password is never generated or seen by anything other
 * than the user themselves, via Supabase's standard password-reset
 * email flow whenever the web app login is actually tested.
 *
 * Run once: `pnpm exec tsx scripts/bootstrap-max-connection.ts`
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

import { getSupabaseClient } from "../src/supabaseClient.js";

const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";
const ELIOR_EMAIL = "elior015@gmail.com";
const CREDENTIAL_REF = "max-main";

async function main() {
  const supabase = getSupabaseClient();

  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email: ELIOR_EMAIL,
    email_confirm: true,
  });
  if (createUserError) throw new Error(`createUser failed: ${createUserError.message}`);
  const userId = created.user.id;
  console.log(`created auth user ${userId} for ${ELIOR_EMAIL}`);

  const { error: memberError } = await supabase
    .from("household_members")
    .insert({ household_id: HOUSEHOLD_ID, user_id: userId, role: "admin" });
  if (memberError) throw new Error(`household_members insert failed: ${memberError.message}`);
  console.log("added household_members row");

  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .insert({
      household_id: HOUSEHOLD_ID,
      provider: "max",
      display_name: "Max",
      owner_user_id: userId,
      credential_ref: CREDENTIAL_REF,
    })
    .select("id")
    .single();
  if (connectionError) throw new Error(`connections insert failed: ${connectionError.message}`);

  console.log(`created connection ${connection.id} (provider=max, credential_ref=${CREDENTIAL_REF})`);
  console.log(`\nRun: pnpm exec tsx src/cli.ts sync ${connection.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
