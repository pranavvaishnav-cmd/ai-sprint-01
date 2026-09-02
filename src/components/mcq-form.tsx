"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import type { Mcq } from "@/lib/types/mcq";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ChoiceDraft {
	key: string;
	text: string;
	isCorrect: boolean;
}

interface McqFormProps {
	mcqId?: string;
}

function emptyChoices(): ChoiceDraft[] {
	return [
		{ key: "choice-a", text: "", isCorrect: false },
		{ key: "choice-b", text: "", isCorrect: false },
	];
}

export function McqForm({ mcqId }: McqFormProps) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [choices, setChoices] = useState<ChoiceDraft[]>(emptyChoices);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isLoading, setIsLoading] = useState(Boolean(mcqId));
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		if (!mcqId) {
			return;
		}

		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const data = (await response.json()) as { success?: boolean; mcq?: Mcq; error?: string };
				if (cancelled) {
					return;
				}
				if (!response.ok || !data.mcq) {
					setNotFound(true);
					setError(data.error ?? "Question not found");
					return;
				}
				setName(data.mcq.name);
				setDescription(data.mcq.description);
				setChoices(
					data.mcq.choices.map((choice, index) => ({
						key: choice.id || `choice-${index}`,
						text: choice.text,
						isCorrect: choice.isCorrect,
					})),
				);
			} catch {
				if (!cancelled) {
					setError("Failed to load question");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}
		setChoices((current) => [...current, { key: `choice-${current.length + 1}`, text: "", isCorrect: false }]);
	}

	function removeChoice(key: string) {
		if (choices.length <= 2) {
			return;
		}
		setChoices((current) => current.filter((choice) => choice.key !== key));
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const trimmedName = name.trim();
		if (!trimmedName) {
			setError("Name is required");
			return;
		}

		const normalizedChoices = choices.map((choice) => ({
			text: choice.text.trim(),
			isCorrect: choice.isCorrect,
		}));

		if (normalizedChoices.some((choice) => !choice.text)) {
			setError("Each choice must have text");
			return;
		}

		if (normalizedChoices.filter((choice) => choice.isCorrect).length !== 1) {
			setError("Exactly one choice must be marked correct");
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await fetch(mcqId ? `/api/mcqs/${mcqId}` : "/api/mcqs", {
				method: mcqId ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: trimmedName,
					description: description.trim(),
					choices: normalizedChoices,
				}),
			});
			const data = (await response.json()) as { success?: boolean; error?: string };
			if (!response.ok || !data.success) {
				setError(data.error ?? "Unable to save question");
				return;
			}
			router.push("/mcqs");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	if (notFound) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Question not found</CardTitle>
					<CardDescription>This question may have been deleted.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button variant="outline" onClick={() => router.push("/mcqs")}>
						Back to questions
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>{mcqId ? "Edit question" : "Create question"}</CardTitle>
				<CardDescription>
					Add a name, optional description, and two to six choices. Mark exactly one as correct.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading question...</p>
				) : (
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
								<Input
									id="mcq-name"
									name="name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									maxLength={200}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcq-description">Description</FieldLabel>
								<Textarea
									id="mcq-description"
									name="description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									maxLength={2000}
								/>
							</Field>
							{choices.map((choice, index) => (
								<Field key={choice.key}>
									<FieldLabel htmlFor={`choice-${index + 1}`}>Choice {index + 1}</FieldLabel>
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
										<Input
											id={`choice-${index + 1}`}
											value={choice.text}
											onChange={(event) =>
												setChoices((current) =>
													current.map((item) =>
														item.key === choice.key ? { ...item, text: event.target.value } : item,
													),
												)
											}
											maxLength={500}
										/>
										<label className="flex items-center gap-2 text-sm whitespace-nowrap">
											<input
												type="radio"
												name="correct-choice"
												checked={choice.isCorrect}
												aria-label={`Correct answer for choice ${index + 1}`}
												onChange={() =>
													setChoices((current) =>
														current.map((item) => ({ ...item, isCorrect: item.key === choice.key })),
													)
												}
											/>
											Correct answer
										</label>
										{choices.length > 2 ? (
											<Button
												type="button"
												variant="ghost"
												onClick={() => removeChoice(choice.key)}
											>
												Remove choice {index + 1}
											</Button>
										) : null}
									</div>
								</Field>
							))}
							{choices.length < 6 ? (
								<Button type="button" variant="outline" onClick={addChoice}>
									Add choice
								</Button>
							) : null}
							{error ? <FieldError errors={[{ message: error }]} /> : null}
							<div className="flex flex-wrap gap-2">
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Saving..." : "Save"}
								</Button>
								<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
									Cancel
								</Button>
							</div>
						</FieldGroup>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
