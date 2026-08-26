// @vitest-environment node
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createUser,
	deleteUser,
	DuplicateUserError,
	getUserByEmail,
	getUserById,
	getUserByIdentifier,
	getUserByUsername,
	updateUser,
	verifyPassword,
} from "@/lib/services/user-service";
import type { UserRow } from "@/lib/types/user";

const input = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "sha256-digest-of-the-typed-password",
};

function sampleRow(overrides: Partial<UserRow> = {}): UserRow {
	return {
		id: "user-1",
		first_name: "Ada",
		last_name: "Lovelace",
		username: "ada",
		email: "ada@school.edu",
		password_hash: "$2b$10$existinghash",
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

type StatementCall = { sql: string; params: unknown[] };

function createMockDb(handlers: {
	all?: (sql: string, params: unknown[]) => { results: UserRow[] } | Promise<{ results: UserRow[] }>;
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
	};

	return { db: db as unknown as D1Database, calls };
}

function isLookup(sql: string, column: "username" | "email" | "id"): boolean {
	if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
		return false;
	}
	if (/\bOR\b/i.test(sql)) {
		return false;
	}
	if (column === "id") {
		return /WHERE id = \?1/i.test(sql);
	}
	if (column === "username") {
		return /WHERE username = \?1/i.test(sql);
	}
	return /WHERE email = \?1/i.test(sql);
}

describe("user service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("createUser inserts a user and returns a public user without password_hash", async () => {
		const inserted = sampleRow();
		const { db, calls } = createMockDb({
			all: (sql) => {
				if (/INSERT/i.test(sql)) {
					return { results: [inserted] };
				}
				return { results: [] };
			},
		});

		const user = await createUser(db, input);

		expect(user).toEqual({
			id: "user-1",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			createdAt: inserted.created_at,
			updatedAt: inserted.updated_at,
		});
		expect(user).not.toHaveProperty("password_hash");
		expect(calls.some((call) => /INSERT INTO users/i.test(call.sql))).toBe(true);
		expect(calls.find((call) => /INSERT/i.test(call.sql))?.sql).toMatch(/\?1/);
	});

	it("createUser bcrypt-hashes the incoming password and does not persist plaintext or the raw digest as password_hash", async () => {
		let boundHash = "";
		const { db } = createMockDb({
			all: (sql, params) => {
				if (/INSERT/i.test(sql)) {
					boundHash = String(params[4]);
					return {
						results: [sampleRow({ password_hash: boundHash })],
					};
				}
				return { results: [] };
			},
		});

		await createUser(db, input);

		expect(boundHash).not.toBe(input.password);
		expect(boundHash.startsWith("$2")).toBe(true);
		await expect(bcrypt.compare(input.password, boundHash)).resolves.toBe(true);
	});

	it("createUser throws DuplicateUserError for an existing username", async () => {
		const { db } = createMockDb({
			all: (sql) => {
				if (isLookup(sql, "username")) {
					return { results: [sampleRow()] };
				}
				return { results: [] };
			},
		});

		await expect(createUser(db, input)).rejects.toBeInstanceOf(DuplicateUserError);
		await expect(createUser(db, input)).rejects.toMatchObject({
			name: "DuplicateUserError",
			field: "username",
		});
	});

	it("createUser throws DuplicateUserError for an existing email", async () => {
		const { db } = createMockDb({
			all: (sql) => {
				if (isLookup(sql, "email")) {
					return { results: [sampleRow({ username: "other", email: input.email })] };
				}
				return { results: [] };
			},
		});

		await expect(createUser(db, input)).rejects.toMatchObject({
			name: "DuplicateUserError",
			field: "email",
		});
	});

	it("createUser allows username to equal email for the same user", async () => {
		const same = "ada@school.edu";
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (/INSERT/i.test(sql)) {
					return {
						results: [
							sampleRow({
								username: String(params[2]),
								email: String(params[3]),
							}),
						],
					};
				}
				return { results: [] };
			},
		});

		const user = await createUser(db, { ...input, username: same, email: same });

		expect(user.username).toBe(same);
		expect(user.email).toBe(same);
		const insert = calls.find((call) => /INSERT/i.test(call.sql));
		expect(insert?.params[2]).toBe(same);
		expect(insert?.params[3]).toBe(same);
	});

	it("getUserById returns the user when present and null when missing", async () => {
		const { db } = createMockDb({
			all: (sql, params) => {
				if (isLookup(sql, "id") && params[0] === "user-1") {
					return { results: [sampleRow()] };
				}
				return { results: [] };
			},
		});

		await expect(getUserById(db, "user-1")).resolves.toMatchObject({
			id: "user-1",
			firstName: "Ada",
			username: "ada",
		});
		await expect(getUserById(db, "missing")).resolves.toBeNull();
	});

	it("getUserByUsername and getUserByEmail look up by that column", async () => {
		const { db: usernameDb, calls: usernameCalls } = createMockDb({
			all: () => ({ results: [sampleRow()] }),
		});
		const { db: emailDb, calls: emailCalls } = createMockDb({
			all: () => ({ results: [sampleRow()] }),
		});

		await expect(getUserByUsername(usernameDb, "ada")).resolves.toMatchObject({ username: "ada" });
		await expect(getUserByEmail(emailDb, "ada@school.edu")).resolves.toMatchObject({
			email: "ada@school.edu",
		});

		expect(usernameCalls[0]?.sql).toMatch(/WHERE username = \?1/i);
		expect(usernameCalls[0]?.params).toEqual(["ada"]);
		expect(emailCalls[0]?.sql).toMatch(/WHERE email = \?1/i);
		expect(emailCalls[0]?.params).toEqual(["ada@school.edu"]);
	});

	it("getUserByIdentifier matches username or email", async () => {
		const { db, calls } = createMockDb({
			all: () => ({ results: [sampleRow()] }),
		});

		const byUsername = await getUserByIdentifier(db, "ada");
		const byEmail = await getUserByIdentifier(db, "ada@school.edu");

		expect(byUsername?.username).toBe("ada");
		expect(byEmail?.email).toBe("ada@school.edu");
		expect(calls).toHaveLength(2);
		expect(calls[0]?.sql).toMatch(/username = \?1 OR email = \?1/i);
		expect(calls[1]?.sql).toMatch(/username = \?1 OR email = \?1/i);
	});

	it("verifyPassword returns true for the original secret and false for a different secret", async () => {
		const hash = await bcrypt.hash(input.password, 10);

		await expect(verifyPassword(input.password, hash)).resolves.toBe(true);
		await expect(verifyPassword("different-digest", hash)).resolves.toBe(false);
	});

	it("updateUser changes provided fields and re-hashes when password is present", async () => {
		let updatedHash = "";
		const { db, calls } = createMockDb({
			all: (sql, params) => {
				if (isLookup(sql, "id")) {
					return { results: [sampleRow()] };
				}
				if (/UPDATE/i.test(sql)) {
					updatedHash = String(params[4]);
					return {
						results: [
							sampleRow({
								first_name: String(params[0]),
								last_name: String(params[1]),
								password_hash: updatedHash,
							}),
						],
					};
				}
				return { results: [] };
			},
		});

		const updated = await updateUser(db, "user-1", {
			firstName: "Ada",
			lastName: "Byron",
			password: "new-digest",
		});

		expect(updated).toMatchObject({ firstName: "Ada", lastName: "Byron" });
		expect(updated).not.toHaveProperty("password_hash");
		expect(updatedHash).not.toBe("new-digest");
		expect(updatedHash).not.toBe("$2b$10$existinghash");
		await expect(bcrypt.compare("new-digest", updatedHash)).resolves.toBe(true);
		expect(calls.some((call) => /UPDATE users/i.test(call.sql))).toBe(true);
	});

	it("updateUser returns null when the id does not exist", async () => {
		const { db } = createMockDb({
			all: () => ({ results: [] }),
		});

		await expect(updateUser(db, "missing", { firstName: "Ada" })).resolves.toBeNull();
	});

	it("updateUser throws DuplicateUserError when the new username or email belongs to someone else", async () => {
		const { db: usernameDb } = createMockDb({
			all: (sql) => {
				if (isLookup(sql, "id")) {
					return { results: [sampleRow()] };
				}
				if (isLookup(sql, "username")) {
					return { results: [sampleRow({ id: "other-user", username: "taken" })] };
				}
				return { results: [] };
			},
		});
		const { db: emailDb } = createMockDb({
			all: (sql) => {
				if (isLookup(sql, "id")) {
					return { results: [sampleRow()] };
				}
				if (isLookup(sql, "email")) {
					return { results: [sampleRow({ id: "other-user", email: "taken@school.edu" })] };
				}
				return { results: [] };
			},
		});

		await expect(updateUser(usernameDb, "user-1", { username: "taken" })).rejects.toMatchObject({
			field: "username",
		});
		await expect(updateUser(emailDb, "user-1", { email: "taken@school.edu" })).rejects.toMatchObject({
			field: "email",
		});
	});

	it("deleteUser returns true when a row was deleted and false when none was", async () => {
		const { db: deletedDb } = createMockDb({
			run: () => ({ meta: { changes: 1 } }),
		});
		const { db: missingDb } = createMockDb({
			run: () => ({ meta: { changes: 0 } }),
		});

		await expect(deleteUser(deletedDb, "user-1")).resolves.toBe(true);
		await expect(deleteUser(missingDb, "missing")).resolves.toBe(false);
	});
});
