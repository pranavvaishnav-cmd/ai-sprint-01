// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createAttempt,
	createMcq,
	deleteMcq,
	getMcqById,
	InvalidChoiceError,
	listAttempts,
	listMcqs,
	McqNotFoundError,
	McqValidationError,
	updateMcq,
} from "@/lib/services/mcq-service";
import type { McqAttemptRow, McqChoiceRow, McqRow } from "@/lib/types/mcq";

const validInput = {
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	choices: [
		{ text: "3", isCorrect: false },
		{ text: "4", isCorrect: true },
	],
};

function sampleMcqRow(overrides: Partial<McqRow> = {}): McqRow {
	return {
		id: "mcq-1",
		name: "What is 2 + 2?",
		description: "Basic arithmetic",
		created_at: "2026-09-02T00:00:00.000Z",
		updated_at: "2026-09-02T00:00:00.000Z",
		...overrides,
	};
}

function sampleChoiceRow(overrides: Partial<McqChoiceRow> = {}): McqChoiceRow {
	return {
		id: "choice-1",
		mcq_id: "mcq-1",
		text: "3",
		is_correct: 0,
		position: 0,
		created_at: "2026-09-02T00:00:00.000Z",
		updated_at: "2026-09-02T00:00:00.000Z",
		...overrides,
	};
}

function sampleAttemptRow(overrides: Partial<McqAttemptRow> = {}): McqAttemptRow {
	return {
		id: "attempt-1",
		mcq_id: "mcq-1",
		choice_id: "choice-2",
		is_correct: 1,
		created_at: "2026-09-02T00:00:00.000Z",
		...overrides,
	};
}

type StatementCall = { sql: string; params: unknown[] };

function createMockDb(handlers: {
	all?: (sql: string, params: unknown[]) => { results: unknown[] };
	run?: (sql: string, params: unknown[]) => { meta: { changes: number } };
}) {
	const calls: StatementCall[] = [];

	const db = {
		prepare(sql: string) {
			let params: unknown[] = [];
			const statement = {
				bind(...bound: unknown[]) {
					params = bound;
					return statement;
				},
				async all() {
					calls.push({ sql, params });
					return handlers.all?.(sql, params) ?? { results: [] };
				},
				async run() {
					calls.push({ sql, params });
					return handlers.run?.(sql, params) ?? { meta: { changes: 0 } };
				},
			};
			return statement;
		},
		async batch(statements: Array<{ all: () => Promise<{ results: unknown[] }> }>) {
			const results = [];
			for (const statement of statements) {
				results.push(await statement.all());
			}
			return results;
		},
	};

	return { db: db as unknown as D1Database, calls };
}

describe("mcq service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("listMcqs returns questions without choices, newest updated_at first", async () => {
		const newer = sampleMcqRow({
			id: "mcq-2",
			name: "Newer",
			updated_at: "2026-09-03T00:00:00.000Z",
		});
		const older = sampleMcqRow({ updated_at: "2026-09-01T00:00:00.000Z" });
		const { db, calls } = createMockDb({
			all: () => ({ results: [newer, older] }),
		});

		const mcqs = await listMcqs(db);

		expect(mcqs).toEqual([
			{
				id: "mcq-2",
				name: "Newer",
				description: "Basic arithmetic",
				createdAt: newer.created_at,
				updatedAt: newer.updated_at,
			},
			{
				id: "mcq-1",
				name: "What is 2 + 2?",
				description: "Basic arithmetic",
				createdAt: older.created_at,
				updatedAt: older.updated_at,
			},
		]);
		expect(mcqs[0]).not.toHaveProperty("choices");
		expect(calls[0]?.sql).toMatch(/FROM mcqs/i);
		expect(calls[0]?.sql).toMatch(/ORDER BY updated_at DESC/i);
	});

	it("getMcqById returns the question with choices ordered by position", async () => {
		const { db, calls } = createMockDb({
			all: (sql) => {
				if (/FROM mcqs/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				if (/FROM mcq_choices/i.test(sql)) {
					return {
						results: [
							sampleChoiceRow({ id: "choice-1", text: "3", is_correct: 0, position: 0 }),
							sampleChoiceRow({ id: "choice-2", text: "4", is_correct: 1, position: 1 }),
						],
					};
				}
				return { results: [] };
			},
		});

		const mcq = await getMcqById(db, "mcq-1");

		expect(mcq).toMatchObject({
			id: "mcq-1",
			name: "What is 2 + 2?",
			description: "Basic arithmetic",
			choices: [
				{ id: "choice-1", text: "3", isCorrect: false, position: 0 },
				{ id: "choice-2", text: "4", isCorrect: true, position: 1 },
			],
		});
		expect(calls.find((call) => /FROM mcq_choices/i.test(call.sql))?.sql).toMatch(/ORDER BY position ASC/i);
	});

	it("getMcqById throws McqNotFoundError when missing", async () => {
		const { db } = createMockDb({
			all: () => ({ results: [] }),
		});

		await expect(getMcqById(db, "missing")).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("createMcq inserts the question and its choices and returns them with generated ids", async () => {
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (/INSERT INTO mcqs/i.test(sql)) {
					return {
						results: [sampleMcqRow({ name: String(params[0]), description: String(params[1]) })],
					};
				}
				if (/INSERT INTO mcq_choices/i.test(sql)) {
					return {
						results: [
							sampleChoiceRow({
								id: `choice-${Number(params[3]) + 1}`,
								mcq_id: String(params[0]),
								text: String(params[1]),
								is_correct: Number(params[2]),
								position: Number(params[3]),
							}),
						],
					};
				}
				return { results: [] };
			},
		});

		const mcq = await createMcq(db, validInput);

		expect(mcq.id).toBe("mcq-1");
		expect(mcq.name).toBe("What is 2 + 2?");
		expect(mcq.choices).toEqual([
			{ id: "choice-1", text: "3", isCorrect: false, position: 0 },
			{ id: "choice-2", text: "4", isCorrect: true, position: 1 },
		]);
		expect(calls.some((call) => /INSERT INTO mcqs/i.test(call.sql))).toBe(true);
		expect(calls.filter((call) => /INSERT INTO mcq_choices/i.test(call.sql))).toHaveLength(2);
		expect(calls.find((call) => /INSERT INTO mcqs/i.test(call.sql))?.sql).toMatch(/\?1/);
	});

	it("createMcq persists description as empty string when omitted", async () => {
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (/INSERT INTO mcqs/i.test(sql)) {
					return { results: [sampleMcqRow({ description: String(params[1]) })] };
				}
				if (/INSERT INTO mcq_choices/i.test(sql)) {
					return {
						results: [
							sampleChoiceRow({
								text: String(params[1]),
								is_correct: Number(params[2]),
								position: Number(params[3]),
							}),
						],
					};
				}
				return { results: [] };
			},
		});

		const mcq = await createMcq(db, {
			name: validInput.name,
			choices: validInput.choices,
		});

		expect(mcq.description).toBe("");
		expect(calls.find((call) => /INSERT INTO mcqs/i.test(call.sql))?.params[1]).toBe("");
	});

	it("createMcq throws McqValidationError when name is empty", async () => {
		const { db } = createMockDb({});

		await expect(createMcq(db, { ...validInput, name: "   " })).rejects.toBeInstanceOf(McqValidationError);
	});

	it("createMcq throws McqValidationError when there are fewer than 2 or more than 6 choices", async () => {
		const { db } = createMockDb({});

		await expect(
			createMcq(db, { ...validInput, choices: [{ text: "only", isCorrect: true }] }),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			createMcq(db, {
				...validInput,
				choices: Array.from({ length: 7 }, (_, index) => ({
					text: `Choice ${index + 1}`,
					isCorrect: index === 0,
				})),
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("createMcq throws McqValidationError when zero or more than one choice is correct", async () => {
		const { db } = createMockDb({});

		await expect(
			createMcq(db, {
				...validInput,
				choices: [
					{ text: "3", isCorrect: false },
					{ text: "4", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			createMcq(db, {
				...validInput,
				choices: [
					{ text: "3", isCorrect: true },
					{ text: "4", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("createMcq throws McqValidationError when a choice text is empty", async () => {
		const { db } = createMockDb({});

		await expect(
			createMcq(db, {
				...validInput,
				choices: [
					{ text: "   ", isCorrect: false },
					{ text: "4", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("updateMcq replaces name, description, and choices", async () => {
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (/SELECT/i.test(sql) && /FROM mcqs/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				if (/UPDATE mcqs/i.test(sql)) {
					return {
						results: [sampleMcqRow({ name: String(params[0]), description: String(params[1]) })],
					};
				}
				if (/INSERT INTO mcq_choices/i.test(sql)) {
					return {
						results: [
							sampleChoiceRow({
								id: `choice-${Number(params[3]) + 1}`,
								text: String(params[1]),
								is_correct: Number(params[2]),
								position: Number(params[3]),
							}),
						],
					};
				}
				return { results: [] };
			},
			run: () => ({ meta: { changes: 2 } }),
		});

		const updated = await updateMcq(db, "mcq-1", {
			name: "What is 3 + 1?",
			description: "Still arithmetic",
			choices: [
				{ text: "5", isCorrect: false },
				{ text: "4", isCorrect: true },
			],
		});

		expect(updated).toMatchObject({
			id: "mcq-1",
			name: "What is 3 + 1?",
			description: "Still arithmetic",
			choices: [
				{ text: "5", isCorrect: false, position: 0 },
				{ text: "4", isCorrect: true, position: 1 },
			],
		});
		expect(calls.some((call) => /UPDATE mcqs/i.test(call.sql))).toBe(true);
		expect(calls.some((call) => /DELETE FROM mcq_choices/i.test(call.sql))).toBe(true);
	});

	it("updateMcq throws McqNotFoundError when the id does not exist", async () => {
		const { db } = createMockDb({
			all: () => ({ results: [] }),
		});

		await expect(updateMcq(db, "missing", validInput)).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("updateMcq throws McqValidationError for the same choice rules as create", async () => {
		const { db } = createMockDb({
			all: (sql) => {
				if (/FROM mcqs/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				return { results: [] };
			},
		});

		await expect(updateMcq(db, "mcq-1", { ...validInput, name: "" })).rejects.toBeInstanceOf(McqValidationError);
	});

	it("deleteMcq returns true when a row was deleted and false when none was", async () => {
		const { db: deletedDb } = createMockDb({
			run: () => ({ meta: { changes: 1 } }),
		});
		const { db: missingDb } = createMockDb({
			run: () => ({ meta: { changes: 0 } }),
		});

		await expect(deleteMcq(deletedDb, "mcq-1")).resolves.toBe(true);
		await expect(deleteMcq(missingDb, "missing")).resolves.toBe(false);
	});

	it("createAttempt records the selected choice and copies is_correct from that choice, ignoring any client-supplied correctness", async () => {
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (/FROM mcqs/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				if (/FROM mcq_choices/i.test(sql)) {
					return {
						results: [sampleChoiceRow({ id: "choice-2", text: "4", is_correct: 1, position: 1 })],
					};
				}
				if (/INSERT INTO mcq_attempts/i.test(sql)) {
					return {
						results: [
							sampleAttemptRow({
								mcq_id: String(params[0]),
								choice_id: String(params[1]),
								is_correct: Number(params[2]),
							}),
						],
					};
				}
				return { results: [] };
			},
		});

		const attempt = await createAttempt(db, "mcq-1", "choice-2");

		expect(attempt).toMatchObject({
			mcqId: "mcq-1",
			choiceId: "choice-2",
			isCorrect: true,
		});
		const insert = calls.find((call) => /INSERT INTO mcq_attempts/i.test(call.sql));
		expect(insert?.params[2]).toBe(1);
		expect(insert?.sql).toMatch(/\?1/);
	});

	it("createAttempt throws McqNotFoundError when the question is missing", async () => {
		const { db } = createMockDb({
			all: () => ({ results: [] }),
		});

		await expect(createAttempt(db, "missing", "choice-2")).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("createAttempt throws InvalidChoiceError when the choice does not belong to the question", async () => {
		const { db } = createMockDb({
			all: (sql) => {
				if (/FROM mcqs/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				return { results: [] };
			},
		});

		await expect(createAttempt(db, "mcq-1", "other-choice")).rejects.toBeInstanceOf(InvalidChoiceError);
	});

	it("listAttempts returns attempts for that mcq_id, newest first", async () => {
		const newer = sampleAttemptRow({ id: "attempt-2", created_at: "2026-09-03T00:00:00.000Z" });
		const older = sampleAttemptRow({ created_at: "2026-09-01T00:00:00.000Z", is_correct: 0 });
		const { db, calls } = createMockDb({
			all: (sql) => {
				if (/FROM mcqs/i.test(sql) && /SELECT/i.test(sql) && !/mcq_attempts/i.test(sql)) {
					return { results: [sampleMcqRow()] };
				}
				if (/FROM mcq_attempts/i.test(sql)) {
					return { results: [newer, older] };
				}
				return { results: [] };
			},
		});

		const attempts = await listAttempts(db, "mcq-1");

		expect(attempts).toEqual([
			{
				id: "attempt-2",
				mcqId: "mcq-1",
				choiceId: "choice-2",
				isCorrect: true,
				createdAt: newer.created_at,
			},
			{
				id: "attempt-1",
				mcqId: "mcq-1",
				choiceId: "choice-2",
				isCorrect: false,
				createdAt: older.created_at,
			},
		]);
		expect(calls.find((call) => /FROM mcq_attempts/i.test(call.sql))?.sql).toMatch(/ORDER BY created_at DESC/i);
	});

	it("listAttempts throws McqNotFoundError when the question is missing", async () => {
		const { db } = createMockDb({
			all: () => ({ results: [] }),
		});

		await expect(listAttempts(db, "missing")).rejects.toBeInstanceOf(McqNotFoundError);
	});
});
