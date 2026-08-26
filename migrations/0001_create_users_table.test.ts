// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = join(dirname(fileURLToPath(import.meta.url)), "0001_create_users_table.sql");

function readMigration(): string {
	return readFileSync(migrationPath, "utf8");
}

function usersTableBody(sql: string): string {
	const match = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);
	if (!match?.[1]) {
		throw new Error("Could not find CREATE TABLE users body");
	}
	return match[1];
}

function columnNames(tableBody: string): string[] {
	return tableBody
		.split(",")
		.map((line) => line.trim().split(/\s+/)[0])
		.filter((name): name is string => Boolean(name));
}

function columnLine(tableBody: string, column: string): string | undefined {
	return tableBody
		.split(",")
		.map((line) => line.trim())
		.find((line) => line.startsWith(`${column} `) || line.startsWith(`${column}\t`));
}

describe("users migration", () => {
	it("creates a users table", () => {
		expect(readMigration()).toMatch(/CREATE TABLE users\s*\(/i);
	});

	it("defines id as TEXT PRIMARY KEY", () => {
		const id = columnLine(usersTableBody(readMigration()), "id");
		expect(id).toBeDefined();
		expect(id).toMatch(/TEXT/i);
		expect(id).toMatch(/PRIMARY KEY/i);
	});

	it("requires first_name, last_name, username, email, and password_hash", () => {
		const body = usersTableBody(readMigration());

		for (const column of ["first_name", "last_name", "username", "email", "password_hash"]) {
			const line = columnLine(body, column);
			expect(line, `${column} should exist`).toBeDefined();
			expect(line, `${column} should be NOT NULL`).toMatch(/NOT NULL/i);
		}
	});

	it("makes username and email each UNIQUE", () => {
		const body = usersTableBody(readMigration());
		expect(columnLine(body, "username")).toMatch(/UNIQUE/i);
		expect(columnLine(body, "email")).toMatch(/UNIQUE/i);
	});

	it("stores password as password_hash, not password", () => {
		const names = columnNames(usersTableBody(readMigration()));
		expect(names).toContain("password_hash");
		expect(names).not.toContain("password");
	});

	it("defaults created_at and updated_at to CURRENT_TIMESTAMP", () => {
		const body = usersTableBody(readMigration());
		expect(columnLine(body, "created_at")).toMatch(/DEFAULT CURRENT_TIMESTAMP/i);
		expect(columnLine(body, "updated_at")).toMatch(/DEFAULT CURRENT_TIMESTAMP/i);
	});

	it("creates indexes on username and email", () => {
		const sql = readMigration();
		expect(sql).toMatch(/CREATE INDEX \w+ ON users\s*\(\s*username\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+ ON users\s*\(\s*email\s*\)/i);
	});
});
