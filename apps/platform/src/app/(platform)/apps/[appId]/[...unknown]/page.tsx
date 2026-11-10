import { notFound } from "next/navigation";

/** Only destinations declared in the record config are real routes. */
export default function AppRecordUnknownPage() {
  notFound();
}
