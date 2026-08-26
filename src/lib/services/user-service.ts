import bcrypt from "bcryptjs";

import type { CreateUserInput, UpdateUserInput, User, UserRow } from "@/lib/types/user";

const SALT_ROUNDS = 10;

export class DuplicateUserError extends Error {
	constructor(public readonly field: "username" | "email") {
		super(`A user with this ${field} already exists`);
		this.name = "DuplicateUserError";
	}
}

function duplicateFieldFromError(error: unknown): "username" | "email" | null {
	const message = error instanceof Error ? error.message : String(error);
	if (/users\.username/i.test(message)) {
		return "username";
	}
	if (/users\.email/i.test(message)) {
		return "email";
	}
	return null;
}

function mapRowToUser(row: UserRow): User {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function hashPassword(plain: string): Promise<string> {
	return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
	return bcrypt.compare(plain, hash);
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<User> {
	const existingUsername = await getUserByUsername(db, input.username);
	if (existingUsername) {
		throw new DuplicateUserError("username");
	}

	const existingEmail = await getUserByEmail(db, input.email);
	if (existingEmail) {
		throw new DuplicateUserError("email");
	}

	const passwordHash = await hashPassword(input.password);

	try {
		const result = await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash)
       VALUES (?1, ?2, ?3, ?4, ?5)
       RETURNING id, first_name, last_name, username, email, password_hash, created_at, updated_at`,
			)
			.bind(input.firstName, input.lastName, input.username, input.email, passwordHash)
			.all<UserRow>();

		const row = result.results[0];
		if (!row) {
			throw new Error("Failed to create user");
		}

		return mapRowToUser(row);
	} catch (error) {
		if (error instanceof DuplicateUserError) {
			throw error;
		}
		const field = duplicateFieldFromError(error);
		if (field) {
			throw new DuplicateUserError(field);
		}
		throw error;
	}
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
	const result = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash, created_at, updated_at
       FROM users WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();

	const row = result.results[0];
	return row ? mapRowToUser(row) : null;
}

export async function getUserByUsername(db: D1Database, username: string): Promise<User | null> {
	const result = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash, created_at, updated_at
       FROM users WHERE username = ?1`,
		)
		.bind(username)
		.all<UserRow>();

	const row = result.results[0];
	return row ? mapRowToUser(row) : null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
	const result = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash, created_at, updated_at
       FROM users WHERE email = ?1`,
		)
		.bind(email)
		.all<UserRow>();

	const row = result.results[0];
	return row ? mapRowToUser(row) : null;
}

export async function getUserByIdentifier(db: D1Database, identifier: string): Promise<UserRow | null> {
	const result = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash, created_at, updated_at
       FROM users WHERE username = ?1 OR email = ?1`,
		)
		.bind(identifier)
		.all<UserRow>();

	return result.results[0] ?? null;
}

export async function updateUser(db: D1Database, id: string, input: UpdateUserInput): Promise<User | null> {
	const existing = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email, password_hash, created_at, updated_at
       FROM users WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();

	const current = existing.results[0];
	if (!current) {
		return null;
	}

	if (input.username && input.username !== current.username) {
		const conflict = await getUserByUsername(db, input.username);
		if (conflict && conflict.id !== id) {
			throw new DuplicateUserError("username");
		}
	}

	if (input.email && input.email !== current.email) {
		const conflict = await getUserByEmail(db, input.email);
		if (conflict && conflict.id !== id) {
			throw new DuplicateUserError("email");
		}
	}

	const firstName = input.firstName ?? current.first_name;
	const lastName = input.lastName ?? current.last_name;
	const username = input.username ?? current.username;
	const email = input.email ?? current.email;
	const passwordHash = input.password ? await hashPassword(input.password) : current.password_hash;

	try {
		const result = await db
			.prepare(
				`UPDATE users
       SET first_name = ?1, last_name = ?2, username = ?3, email = ?4, password_hash = ?5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?6
       RETURNING id, first_name, last_name, username, email, password_hash, created_at, updated_at`,
			)
			.bind(firstName, lastName, username, email, passwordHash, id)
			.all<UserRow>();

		const row = result.results[0];
		return row ? mapRowToUser(row) : null;
	} catch (error) {
		if (error instanceof DuplicateUserError) {
			throw error;
		}
		const field = duplicateFieldFromError(error);
		if (field) {
			throw new DuplicateUserError(field);
		}
		throw error;
	}
}

export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
	return (result.meta.changes ?? 0) > 0;
}

export function toPublicUser(user: User) {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
	};
}
