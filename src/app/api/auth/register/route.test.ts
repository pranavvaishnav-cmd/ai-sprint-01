// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: {} },
	})),
}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: vi.fn(),
	};
});

import { createUser, DuplicateUserError } from "@/lib/services/user-service";
import { POST } from "./route";

const createUserMock = vi.mocked(createUser);

const registerBody = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "abc",
};

const createdUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function postJson(body: unknown) {
	return new Request("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with a public user and never includes password_hash", async () => {
		createUserMock.mockResolvedValue(createdUser);

		const response = await POST(postJson(registerBody));
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload).toEqual({
			success: true,
			user: {
				id: "user-1",
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
			},
		});
		expect(JSON.stringify(payload)).not.toContain("password_hash");
		expect(createUserMock).toHaveBeenCalledWith({}, registerBody);
	});

	it("returns 400 on validation failure", async () => {
		const response = await POST(postJson({ ...registerBody, email: "not-an-email" }));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({ success: false });
		expect(payload.error).toEqual(expect.any(String));
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 409 when username is taken", async () => {
		createUserMock.mockRejectedValue(new DuplicateUserError("username"));

		const response = await POST(postJson(registerBody));
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload).toEqual({
			success: false,
			error: "A user with this username already exists",
		});
	});

	it("returns 409 when email is taken", async () => {
		createUserMock.mockRejectedValue(new DuplicateUserError("email"));

		const response = await POST(postJson(registerBody));
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload).toEqual({
			success: false,
			error: "A user with this email already exists",
		});
	});

	it("returns 500 on unexpected errors", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		createUserMock.mockRejectedValue(new Error("d1 unavailable"));

		const response = await POST(postJson(registerBody));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload).toEqual({ success: false, error: "Internal server error" });
		errorSpy.mockRestore();
	});
});
