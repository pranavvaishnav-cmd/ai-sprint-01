"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { setStoredUser } from "@/lib/auth-client";
import { hashPasswordForWire } from "@/lib/hash-password";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const formData = new FormData(event.currentTarget);
		const password = String(formData.get("password") ?? "");
		const confirmPassword = String(formData.get("confirmPassword") ?? "");

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		setIsSubmitting(true);

		try {
			const digest = await hashPasswordForWire(password);
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName: formData.get("firstName"),
					lastName: formData.get("lastName"),
					username: formData.get("username"),
					email: formData.get("email"),
					password: digest,
				}),
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
				setError(data.error ?? "Registration failed");
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
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>Enter your information below to create your account</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="firstName">First name</FieldLabel>
							<Input id="firstName" name="firstName" type="text" placeholder="Ada" required autoComplete="given-name" />
						</Field>
						<Field>
							<FieldLabel htmlFor="lastName">Last name</FieldLabel>
							<Input
								id="lastName"
								name="lastName"
								type="text"
								placeholder="Lovelace"
								required
								autoComplete="family-name"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input id="username" name="username" type="text" required autoComplete="username" minLength={3} />
							<FieldDescription>Letters, numbers, underscores, and hyphens. May match your email.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="m@example.com"
								required
								autoComplete="email"
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email with anyone else.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
							/>
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirmPassword"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
						</Field>
						{error ? <FieldError errors={[{ message: error }]} /> : null}
						<FieldGroup>
							<Field>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Creating account..." : "Create Account"}
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account? <Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
