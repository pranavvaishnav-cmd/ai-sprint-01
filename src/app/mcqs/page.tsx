"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { clearStoredUser, getStoredUser, subscribeStoredUser } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function McqsPage() {
	const router = useRouter();
	const user = useSyncExternalStore(subscribeStoredUser, getStoredUser, () => null);
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	async function handleLogout() {
		setIsLoggingOut(true);

		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} finally {
			clearStoredUser();
			router.push("/login");
		}
	}

	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<Card className="w-full max-w-lg">
				<CardHeader>
					<CardTitle>MCQ Test Bank</CardTitle>
					<CardDescription>Coming soon — collaborative multiple-choice question management.</CardDescription>
				</CardHeader>
				<CardContent>
					{user ? (
						<p className="text-sm">
							Signed in as{" "}
							<span className="font-medium">
								{user.firstName} {user.lastName}
							</span>{" "}
							({user.username})
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							You are viewing the MCQ workspace stub. Sign in from the login page to associate your session.
						</p>
					)}
				</CardContent>
				<CardFooter>
					<Button variant="outline" onClick={handleLogout} disabled={isLoggingOut}>
						{isLoggingOut ? "Logging out..." : "Log out"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
