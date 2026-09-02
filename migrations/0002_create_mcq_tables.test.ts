// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = join(dirname(fileURLToPath(import.meta.url)), "0002_create_mcq_tables.sql");

function readMigration(): string {
	return readFileSync(migrationPath, "utf8");
}

function tableBody(sql: string, table: string): string {
	const match = sql.match(new RegExp(`CREATE TABLE ${table}\\s*\\(([\\s\\S]*?)\\)\\s*;`, "i"));
	if (!match?.[1]) {
		throw new Error(`Could not find CREATE TABLE ${table} body`);
	}
	return match[1];
}

function columnLine(tableSql: string, column: string): string | undefined {
	return tableSql
		.split(",")
		.map((line) => line.trim())
		.find((line) => line.startsWith(`${column} `) || line.startsWith(`${column}\t`));
}

describe("mcq tables migration", () => {
	it("creates mcqs, mcq_choices, and mcq_attempts tables", () => {
		const sql = readMigration();

		expect(sql).toMatch(/CREATE TABLE mcqs\s*\(/i);
		expect(sql).toMatch(/CREATE TABLE mcq_choices\s*\(/i);
		expect(sql).toMatch(/CREATE TABLE mcq_attempts\s*\(/i);
	});

	it("defines mcqs id as TEXT PRIMARY KEY and requires name", () => {
		const body = tableBody(readMigration(), "mcqs");
		const id = columnLine(body, "id");
		const name = columnLine(body, "name");

		expect(id).toBeDefined();
		expect(id).toMatch(/TEXT/i);
		expect(id).toMatch(/PRIMARY KEY/i);
		expect(name).toBeDefined();
		expect(name).toMatch(/NOT NULL/i);
	});

	it("defaults mcqs created_at and updated_at to CURRENT_TIMESTAMP", () => {
		const body = tableBody(readMigration(), "mcqs");

		expect(columnLine(body, "created_at")).toMatch(/DEFAULT CURRENT_TIMESTAMP/i);
		expect(columnLine(body, "updated_at")).toMatch(/DEFAULT CURRENT_TIMESTAMP/i);
	});

	it("references mcq_choices.mcq_id to mcqs(id) with ON DELETE CASCADE", () => {
		const body = tableBody(readMigration(), "mcq_choices");

		expect(body).toMatch(/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i);
	});

	it("stores mcq_choices.is_correct as INTEGER and requires text and position", () => {
		const body = tableBody(readMigration(), "mcq_choices");
		const isCorrect = columnLine(body, "is_correct");
		const text = columnLine(body, "text");
		const position = columnLine(body, "position");

		expect(isCorrect).toBeDefined();
		expect(isCorrect).toMatch(/INTEGER/i);
		expect(isCorrect).toMatch(/NOT NULL/i);
		expect(text).toBeDefined();
		expect(text).toMatch(/NOT NULL/i);
		expect(position).toBeDefined();
		expect(position).toMatch(/NOT NULL/i);
	});

	it("references mcq_attempts to mcqs(id) and mcq_choices(id) with ON DELETE CASCADE", () => {
		const body = tableBody(readMigration(), "mcq_attempts");

		expect(body).toMatch(/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*choice_id\s*\)\s*REFERENCES\s+mcq_choices\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i,
		);
	});

	it("records choice_id and is_correct on mcq_attempts", () => {
		const body = tableBody(readMigration(), "mcq_attempts");
		const choiceId = columnLine(body, "choice_id");
		const isCorrect = columnLine(body, "is_correct");

		expect(choiceId).toBeDefined();
		expect(choiceId).toMatch(/NOT NULL/i);
		expect(isCorrect).toBeDefined();
		expect(isCorrect).toMatch(/INTEGER/i);
		expect(isCorrect).toMatch(/NOT NULL/i);
	});

	it("creates indexes on mcq_choices.mcq_id and mcq_attempts.mcq_id", () => {
		const sql = readMigration();

		expect(sql).toMatch(/CREATE INDEX \w+ ON mcq_choices\s*\(\s*mcq_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+ ON mcq_attempts\s*\(\s*mcq_id\s*\)/i);
	});
});
