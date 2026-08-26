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
		getUserByIdentifier: vi.fn(),
		verifyPassword: vi.fn(),
	};
});

import { getUserByIdentifier, verifyPassword } from "@/lib/services/user-service";
import { POST } from "./route";

const getUserByIdentifierMock = vi.mocked(getUserByIdentifier);
const verifyPasswordMock = vi.mocked(verifyPassword);

const row = {
	id: "user-1",
	first_name: "Ada",
	last_name: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password_hash: "$2b$10$hashed",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

function postJson(body: unknown) {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with a public user for a matching username and password", async () => {
		getUserByIdentifierMock.mockResolvedValue(row);
		verifyPasswordMock.mockResolvedValue(true);

		const response = await POST(postJson({ identifier: "ada", password: "digest" }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ success: true, user: publicUser });
		expect(getUserByIdentifierMock).toHaveBeenCalledWith({}, "ada");
		expect(verifyPasswordMock).toHaveBeenCalledWith("digest", row.password_hash);
	});

	it("succeeds when identifier is the email", async () => {
		getUserByIdentifierMock.mockResolvedValue(row);
		verifyPasswordMock.mockResolvedValue(true);

		const response = await POST(postJson({ identifier: "ada@school.edu", password: "digest" }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(getUserByIdentifierMock).toHaveBeenCalledWith({}, "ada@school.edu");
	});

	it("returns 401 Invalid credentials for an unknown identifier", async () => {
		getUserByIdentifierMock.mockResolvedValue(null);

		const response = await POST(postJson({ identifier: "missing", password: "digest" }));
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload).toEqual({ success: false, error: "Invalid credentials" });
		expect(verifyPasswordMock).not.toHaveBeenCalled();
	});

	it("returns 401 Invalid credentials for a bad password", async () => {
		getUserByIdentifierMock.mockResolvedValueOnce(row);
		verifyPasswordMock.mockResolvedValueOnce(false);
		getUserByIdentifierMock.mockResolvedValueOnce(null);

		const response = await POST(postJson({ identifier: "ada", password: "wrong" }));
		const unknown = await POST(postJson({ identifier: "missing", password: "wrong" }));
		const badPassword = await response.json();
		const unknownPayload = await unknown.json();

		expect(response.status).toBe(401);
		expect(unknown.status).toBe(401);
		expect(badPassword).toEqual({ success: false, error: "Invalid credentials" });
		expect(unknownPayload.error).toBe(badPassword.error);
	});

	it("returns 400 on validation failure", async () => {
		const response = await POST(postJson({ identifier: "", password: "digest" }));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({ success: false });
		expect(getUserByIdentifierMock).not.toHaveBeenCalled();
	});

	it("does not set a cookie or return a token", async () => {
		getUserByIdentifierMock.mockResolvedValue(row);
		verifyPasswordMock.mockResolvedValue(true);

		const response = await POST(postJson({ identifier: "ada", password: "digest" }));
		const payload = await response.json();

		expect(response.headers.get("set-cookie")).toBeNull();
		expect(payload).not.toHaveProperty("token");
		expect(payload.user).not.toHaveProperty("token");
	});
});
