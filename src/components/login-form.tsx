"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { setStoredUser } from "@/lib/auth-client";
import { hashPasswordForWire } from "@/lib/hash-password";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);

		const formData = new FormData(event.currentTarget);
		const identifier = String(formData.get("identifier") ?? "");
		const password = String(formData.get("password") ?? "");

		try {
			const digest = await hashPasswordForWire(password);
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ identifier, password: digest }),
			});

			const data = (await response.json()) as {
				success?: boolean;
				error?: string;
				user?: {
					id: string;
					firstName: string;
					lastName: string;
					username: string;
					email: string;
				};
			};

			if (!response.ok || !data.success || !data.user) {
				setError(data.error ?? "Invalid credentials");
				return;
			}

			setStoredUser(data.user);
			router.push("/mcqs");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>Enter your username or email below to login to your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="identifier">Username or email</FieldLabel>
								<Input
									id="identifier"
									name="identifier"
									type="text"
									placeholder="ada or ada@school.edu"
									required
									autoComplete="username"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									required
									minLength={8}
									autoComplete="current-password"
								/>
							</Field>
							{error ? <FieldError errors={[{ message: error }]} /> : null}
							<Field>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Logging in..." : "Login"}
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
