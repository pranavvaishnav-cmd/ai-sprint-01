// @vitest-environment node
import { describe, expect, it } from "vitest";

import { attemptSchema, mcqWriteSchema } from "@/lib/validations/mcq";

const validWrite = {
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	choices: [
		{ text: "3", isCorrect: false },
		{ text: "4", isCorrect: true },
	],
};

describe("mcqWriteSchema", () => {
	it("accepts a valid name, optional description, and 2–6 choices with exactly one correct", () => {
		expect(mcqWriteSchema.safeParse(validWrite).success).toBe(true);
		expect(
			mcqWriteSchema.safeParse({
				name: "Untitled",
				choices: validWrite.choices,
			}).success,
		).toBe(true);
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: [
					{ text: "A", isCorrect: true },
					{ text: "B", isCorrect: false },
					{ text: "C", isCorrect: false },
					{ text: "D", isCorrect: false },
					{ text: "E", isCorrect: false },
					{ text: "F", isCorrect: false },
				],
			}).success,
		).toBe(true);
	});

	it("rejects an empty name", () => {
		expect(mcqWriteSchema.safeParse({ ...validWrite, name: "" }).success).toBe(false);
		expect(mcqWriteSchema.safeParse({ ...validWrite, name: "   " }).success).toBe(false);
	});

	it("rejects fewer than 2 or more than 6 choices", () => {
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: [{ text: "only", isCorrect: true }],
			}).success,
		).toBe(false);
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: Array.from({ length: 7 }, (_, index) => ({
					text: `Choice ${index + 1}`,
					isCorrect: index === 0,
				})),
			}).success,
		).toBe(false);
	});

	it("rejects zero or multiple correct choices", () => {
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: [
					{ text: "3", isCorrect: false },
					{ text: "4", isCorrect: false },
				],
			}).success,
		).toBe(false);
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: [
					{ text: "3", isCorrect: true },
					{ text: "4", isCorrect: true },
				],
			}).success,
		).toBe(false);
	});

	it("rejects an empty choice text", () => {
		expect(
			mcqWriteSchema.safeParse({
				...validWrite,
				choices: [
					{ text: "   ", isCorrect: false },
					{ text: "4", isCorrect: true },
				],
			}).success,
		).toBe(false);
	});
});

describe("attemptSchema", () => {
	it("requires choiceId", () => {
		expect(attemptSchema.safeParse({ choiceId: "choice-2" }).success).toBe(true);
		expect(attemptSchema.safeParse({}).success).toBe(false);
		expect(attemptSchema.safeParse({ choiceId: "" }).success).toBe(false);
		expect(attemptSchema.safeParse({ choiceId: "   " }).success).toBe(false);
	});
});
