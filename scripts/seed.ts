// seed.ts writes the starter routine into Firestore. Run once after the GCP
// setup:
//
//   GOOGLE_CLOUD_PROJECT=your-project npx tsx seed.ts
//
// It uses Application Default Credentials (gcloud auth application-default
// login, or a service account). Existing exercises are left untouched unless
// --force is passed, in which case the exercises collection is cleared first.

import { Firestore } from "@google-cloud/firestore";
import { seedRoutine } from "./routine";

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (!projectId) {
    console.error("Set GOOGLE_CLOUD_PROJECT to your GCP project id.");
    process.exit(1);
  }
  const databaseId = process.env.FIRESTORE_DATABASE || "(default)";
  const force = process.argv.includes("--force");

  const db = new Firestore({ projectId, databaseId });
  const col = db.collection("exercises");

  const existing = await col.get();
  if (!existing.empty && !force) {
    console.log(`exercises collection already has ${existing.size} docs; pass --force to overwrite.`);
    return;
  }
  if (force) {
    const batch = db.batch();
    existing.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`cleared ${existing.size} existing exercises.`);
  }

  const routine = seedRoutine();
  const batch = db.batch();
  for (const ex of routine) {
    batch.set(col.doc(), ex);
  }
  await batch.commit();
  console.log(`seeded ${routine.length} exercises into project ${projectId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
