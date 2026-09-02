export interface McqChoice {
	id: string;
	text: string;
	isCorrect: boolean;
	position: number;
}

export interface McqSummary {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
}

export interface Mcq extends McqSummary {
	choices: McqChoice[];
}

export interface McqAttempt {
	id: string;
	mcqId: string;
	choiceId: string;
	isCorrect: boolean;
	createdAt: string;
}

export interface McqChoiceInput {
	text: string;
	isCorrect: boolean;
}

export interface CreateMcqInput {
	name: string;
	description?: string;
	choices: McqChoiceInput[];
}

export type UpdateMcqInput = CreateMcqInput;

export interface McqRow {
	id: string;
	name: string;
	description: string;
	created_at: string;
	updated_at: string;
}

export interface McqChoiceRow {
	id: string;
	mcq_id: string;
	text: string;
	is_correct: number;
	position: number;
	created_at: string;
	updated_at: string;
}

export interface McqAttemptRow {
	id: string;
	mcq_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
}
