import { redirect } from "next/navigation";

/** The verifier is a single page; this path is kept as a bookmark-friendly alias. */
export default function VerifyPage() {
  redirect("/");
}
