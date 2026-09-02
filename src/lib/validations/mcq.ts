import { z } from "zod";

const choiceSchema = z.object({
	text: z.string().trim().min(1, "Each choice must have text").max(500),
	isCorrect: z.boolean(),
});

export const mcqWriteSchema = z
	.object({
		name: z.string().trim().min(1, "Name is required").max(200),
		description: z.string().trim().max(2000).optional(),
		choices: z
			.array(choiceSchema)
			.min(2, "Questions must have between 2 and 6 choices")
			.max(6, "Questions must have between 2 and 6 choices"),
	})
	.refine((data) => data.choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be marked correct",
		path: ["choices"],
	});

export const attemptSchema = z.object({
	choiceId: z.string().trim().min(1, "choiceId is required"),
});

export type McqWriteInput = z.infer<typeof mcqWriteSchema>;
export type AttemptInput = z.infer<typeof attemptSchema>;
