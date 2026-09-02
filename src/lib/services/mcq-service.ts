import type {
	CreateMcqInput,
	Mcq,
	McqAttempt,
	McqAttemptRow,
	McqChoice,
	McqChoiceRow,
	McqRow,
	McqSummary,
	UpdateMcqInput,
} from "@/lib/types/mcq";

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const CHOICE_TEXT_MAX = 500;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

export class McqNotFoundError extends Error {
	constructor(message = "Question not found") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

export class McqValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McqValidationError";
	}
}

export class InvalidChoiceError extends Error {
	constructor(message = "Choice does not belong to this question") {
		super(message);
		this.name = "InvalidChoiceError";
	}
}

function mapMcqSummary(row: McqRow): McqSummary {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapChoice(row: McqChoiceRow): McqChoice {
	return {
		id: row.id,
		text: row.text,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

function mapAttempt(row: McqAttemptRow): McqAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

function normalizeWrite(input: CreateMcqInput | UpdateMcqInput): {
	name: string;
	description: string;
	choices: Array<{ text: string; isCorrect: boolean }>;
} {
	const name = input.name.trim();
	if (!name) {
		throw new McqValidationError("Name is required");
	}
	if (name.length > NAME_MAX) {
		throw new McqValidationError(`Name must be at most ${NAME_MAX} characters`);
	}

	const description = (input.description ?? "").trim();
	if (description.length > DESCRIPTION_MAX) {
		throw new McqValidationError(`Description must be at most ${DESCRIPTION_MAX} characters`);
	}

	const choices = input.choices.map((choice) => ({
		text: choice.text.trim(),
		isCorrect: choice.isCorrect,
	}));

	if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
		throw new McqValidationError(`Questions must have between ${MIN_CHOICES} and ${MAX_CHOICES} choices`);
	}

	if (choices.some((choice) => !choice.text)) {
		throw new McqValidationError("Each choice must have text");
	}

	if (choices.some((choice) => choice.text.length > CHOICE_TEXT_MAX)) {
		throw new McqValidationError(`Choice text must be at most ${CHOICE_TEXT_MAX} characters`);
	}

	const correctCount = choices.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new McqValidationError("Exactly one choice must be marked correct");
	}

	return { name, description, choices };
}

async function getMcqRow(db: D1Database, id: string): Promise<McqRow> {
	const result = await db
		.prepare(
			`SELECT id, name, description, created_at, updated_at
       FROM mcqs WHERE id = ?1`,
		)
		.bind(id)
		.all<McqRow>();

	const row = result.results[0];
	if (!row) {
		throw new McqNotFoundError();
	}

	return row;
}

async function listChoicesForMcq(db: D1Database, mcqId: string): Promise<McqChoice[]> {
	const result = await db
		.prepare(
			`SELECT id, mcq_id, text, is_correct, position, created_at, updated_at
       FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC`,
		)
		.bind(mcqId)
		.all<McqChoiceRow>();

	return result.results.map(mapChoice);
}

async function insertChoices(
	db: D1Database,
	mcqId: string,
	choices: Array<{ text: string; isCorrect: boolean }>,
): Promise<McqChoice[]> {
	const statements = choices.map((choice, position) =>
		db
			.prepare(
				`INSERT INTO mcq_choices (mcq_id, text, is_correct, position)
         VALUES (?1, ?2, ?3, ?4)
         RETURNING id, mcq_id, text, is_correct, position, created_at, updated_at`,
			)
			.bind(mcqId, choice.text, choice.isCorrect ? 1 : 0, position),
	);

	const batchResults = await db.batch<McqChoiceRow>(statements);
	return batchResults.flatMap((result) => result.results.map(mapChoice));
}

export async function listMcqs(db: D1Database): Promise<McqSummary[]> {
	const result = await db
		.prepare(
			`SELECT id, name, description, created_at, updated_at
       FROM mcqs ORDER BY updated_at DESC`,
		)
		.all<McqRow>();

	return result.results.map(mapMcqSummary);
}

export async function getMcqById(db: D1Database, id: string): Promise<Mcq> {
	const row = await getMcqRow(db, id);
	const choices = await listChoicesForMcq(db, id);
	return { ...mapMcqSummary(row), choices };
}

export async function createMcq(db: D1Database, input: CreateMcqInput): Promise<Mcq> {
	const { name, description, choices } = normalizeWrite(input);

	const result = await db
		.prepare(
			`INSERT INTO mcqs (name, description)
       VALUES (?1, ?2)
       RETURNING id, name, description, created_at, updated_at`,
		)
		.bind(name, description)
		.all<McqRow>();

	const row = result.results[0];
	if (!row) {
		throw new Error("Failed to create question");
	}

	const createdChoices = await insertChoices(db, row.id, choices);
	return { ...mapMcqSummary(row), choices: createdChoices };
}

export async function updateMcq(db: D1Database, id: string, input: UpdateMcqInput): Promise<Mcq> {
	const { name, description, choices } = normalizeWrite(input);
	await getMcqRow(db, id);

	const result = await db
		.prepare(
			`UPDATE mcqs
       SET name = ?1, description = ?2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3
       RETURNING id, name, description, created_at, updated_at`,
		)
		.bind(name, description, id)
		.all<McqRow>();

	const row = result.results[0];
	if (!row) {
		throw new McqNotFoundError();
	}

	await db.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1").bind(id).run();
	const updatedChoices = await insertChoices(db, id, choices);
	return { ...mapMcqSummary(row), choices: updatedChoices };
}

export async function deleteMcq(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function createAttempt(db: D1Database, mcqId: string, choiceId: string): Promise<McqAttempt> {
	await getMcqRow(db, mcqId);

	const choiceResult = await db
		.prepare(
			`SELECT id, mcq_id, text, is_correct, position, created_at, updated_at
       FROM mcq_choices WHERE id = ?1 AND mcq_id = ?2`,
		)
		.bind(choiceId, mcqId)
		.all<McqChoiceRow>();

	const choice = choiceResult.results[0];
	if (!choice) {
		throw new InvalidChoiceError();
	}

	const result = await db
		.prepare(
			`INSERT INTO mcq_attempts (mcq_id, choice_id, is_correct)
       VALUES (?1, ?2, ?3)
       RETURNING id, mcq_id, choice_id, is_correct, created_at`,
		)
		.bind(mcqId, choiceId, choice.is_correct)
		.all<McqAttemptRow>();

	const row = result.results[0];
	if (!row) {
		throw new Error("Failed to record attempt");
	}

	return mapAttempt(row);
}

export async function listAttempts(db: D1Database, mcqId: string): Promise<McqAttempt[]> {
	await getMcqRow(db, mcqId);

	const result = await db
		.prepare(
			`SELECT id, mcq_id, choice_id, is_correct, created_at
       FROM mcq_attempts WHERE mcq_id = ?1 ORDER BY created_at DESC`,
		)
		.bind(mcqId)
		.all<McqAttemptRow>();

	return result.results.map(mapAttempt);
}
