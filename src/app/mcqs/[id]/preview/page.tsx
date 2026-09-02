"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import type { Mcq } from "@/lib/types/mcq";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";

export default function PreviewPage() {
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const id = params.id;
	const [mcq, setMcq] = useState<Mcq | null>(null);
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
	const [result, setResult] = useState<"Correct" | "Incorrect" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${id}`);
				const data = (await response.json()) as { success?: boolean; mcq?: Mcq; error?: string };
				if (cancelled) {
					return;
				}
				if (!response.ok || !data.mcq) {
					setNotFound(true);
					setError(data.error ?? "Question not found");
					return;
				}
				setMcq(data.mcq);
			} catch {
				if (!cancelled) {
					setError("Failed to load question");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [id]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		if (!selectedChoiceId) {
			setError("Select a choice to submit");
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await fetch(`/api/mcqs/${id}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: selectedChoiceId }),
			});
			const data = (await response.json()) as {
				success?: boolean;
				attempt?: { isCorrect: boolean };
				error?: string;
			};
			if (!response.ok || !data.attempt) {
				setError(data.error ?? "Unable to record attempt");
				return;
			}
			setResult(data.attempt.isCorrect ? "Correct" : "Incorrect");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	if (notFound) {
		return (
			<div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10">
				<Card className="w-full max-w-2xl">
					<CardHeader>
						<CardTitle>Question not found</CardTitle>
						<CardDescription>This question may have been deleted.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="outline" onClick={() => router.push("/mcqs")}>
							Back
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10">
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>{mcq?.name ?? "Preview question"}</CardTitle>
					{mcq?.description ? <CardDescription>{mcq.description}</CardDescription> : null}
				</CardHeader>
				<CardContent>
					{!mcq ? (
						<p className="text-sm text-muted-foreground">Loading question...</p>
					) : (
						<form onSubmit={handleSubmit}>
							<FieldGroup>
								<Field>
									<div className="flex flex-col gap-3">
										{mcq.choices.map((choice) => (
											<label key={choice.id} className="flex items-center gap-2 text-sm">
												<input
													type="radio"
													name="preview-choice"
													value={choice.id}
													checked={selectedChoiceId === choice.id}
													onChange={() => setSelectedChoiceId(choice.id)}
												/>
												{choice.text}
											</label>
										))}
									</div>
								</Field>
								{result ? (
									<p className="text-sm font-medium" aria-live="polite">
										{result}
									</p>
								) : null}
								{error ? <FieldError errors={[{ message: error }]} /> : null}
								<div className="flex flex-wrap gap-2">
									<Button type="submit" disabled={isSubmitting || result !== null}>
										{isSubmitting ? "Submitting..." : "Submit answer"}
									</Button>
									<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
										Back
									</Button>
								</div>
							</FieldGroup>
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
