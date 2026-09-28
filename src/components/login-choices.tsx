"use client";

import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * The participant path: sign in with GitHub, which is also what runs the
 * eligibility check. The admin keeps the password form above.
 */
export function LoginChoices({ notice }: { notice?: string }) {
  return (
    <div className="space-y-4">
      <Separator>
        <span className="text-xs text-muted-foreground">أو</span>
      </Separator>

      {notice ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
          {notice}
        </p>
      ) : null}

      <Button asChild variant="outline" className="h-11 w-full">
        <a href="/auth/github/start">
          <Github className="size-4" />
          استلام الشهادة عبر GitHub
        </a>
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        يتم التحقق من مساهمتك في مستودعات الحملة تلقائيًا
      </p>
    </div>
  );
}
