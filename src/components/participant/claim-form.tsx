"use client";

import { useActionState } from "react";

import { ClaimPanel } from "@/components/participant/claim-panel";
import { claimCertificateAction } from "@/lib/actions/participant";
import { idle } from "@/lib/action-state";
import type { Gender } from "@/lib/gender-text";

/**
 * Client shell for the claim form. Owns the useActionState so the panel itself
 * stays a pure presentational component.
 */
export function ClaimForm({
  programId,
  templateId,
  programName,
  defaultName,
  defaultGender,
}: {
  programId: number;
  templateId: number;
  programName: string | null;
  defaultName: string;
  defaultGender: Gender;
}) {
  const [state, formAction, pending] = useActionState(claimCertificateAction, idle);

  return (
    <ClaimPanel
      programId={programId}
      templateId={templateId}
      programName={programName}
      defaultName={defaultName}
      defaultGender={defaultGender}
      formAction={formAction}
      pending={pending}
      state={state}
    />
  );
}
