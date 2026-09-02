"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { clearStoredUser, getStoredUser, subscribeStoredUser } from "@/lib/auth-client";
import type { McqSummary } from "@/lib/types/mcq";
import { McqRowActions } from "@/components/mcq-row-actions";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function McqsPage() {
	const router = useRouter();
	const user = useSyncExternalStore(subscribeStoredUser, getStoredUser, () => null);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [mcqs, setMcqs] = useState<McqSummary[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [pendingDelete, setPendingDelete] = useState<McqSummary | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		fetch("/api/mcqs")
			.then(async (response) => {
				const data = (await response.json()) as { success?: boolean; mcqs?: McqSummary[]; error?: string };
				if (cancelled) {
					return;
				}
				if (!response.ok || !data.success) {
					setLoadError(data.error ?? "Failed to load questions");
					return;
				}
				setLoadError(null);
				setMcqs(data.mcqs ?? []);
			})
			.catch(() => {
				if (!cancelled) {
					setLoadError("Failed to load questions");
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	async function handleLogout() {
		setIsLoggingOut(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} finally {
			clearStoredUser();
			router.push("/login");
		}
	}

	async function handleDelete() {
		if (!pendingDelete) {
			return;
		}

		setIsDeleting(true);
		try {
			const response = await fetch(`/api/mcqs/${pendingDelete.id}`, { method: "DELETE" });
			if (!response.ok) {
				setLoadError("Failed to delete question");
				return;
			}
			setMcqs((current) => current.filter((mcq) => mcq.id !== pendingDelete.id));
			setPendingDelete(null);
		} catch {
			setLoadError("Failed to delete question");
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<div className="flex min-h-svh w-full justify-center p-6 md:p-10">
			<div className="flex w-full max-w-5xl flex-col gap-6">
				<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold">MCQ Test Bank</h1>
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
								You are viewing the MCQ workspace. Sign in from the login page to associate your session.
							</p>
						)}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => router.push("/mcqs/new")}>Create question</Button>
						<Button variant="outline" onClick={handleLogout} disabled={isLoggingOut}>
							{isLoggingOut ? "Logging out..." : "Log out"}
						</Button>
					</div>
				</header>

				{loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading questions...</p>
				) : mcqs.length === 0 ? (
					<p className="text-sm text-muted-foreground">No questions yet. Create a question to get started.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="w-16">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{mcqs.map((mcq) => (
								<TableRow key={mcq.id}>
									<TableCell className="font-medium whitespace-normal">{mcq.name}</TableCell>
									<TableCell className="max-w-md whitespace-normal text-muted-foreground">
										{mcq.description || "—"}
									</TableCell>
									<TableCell>
										<McqRowActions mcq={mcq} onDelete={setPendingDelete} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}

				<Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete question?</DialogTitle>
							<DialogDescription>
								This cannot be undone. The question, its choices, and its attempts will be removed.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={() => setPendingDelete(null)} disabled={isDeleting}>
								Cancel
							</Button>
							<Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
								{isDeleting ? "Deleting..." : "Delete"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}
