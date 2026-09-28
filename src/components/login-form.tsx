"use client";

import { useActionState } from "react";

import { loginAction } from "@/lib/actions/auth";
import type { LoginState } from "@/lib/action-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>دخول لوحة التحكم</CardTitle>
        <CardDescription>هذه المنطقة مخصصة للمشرفين</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              aria-invalid={Boolean(state.error)}
              aria-describedby={state.error ? "login-error" : undefined}
            />
            {state.error ? (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
