// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hashPasswordForWire } from "@/lib/hash-password";

describe("hashPasswordForWire", () => {
	it("returns a 64-character hex SHA-256 digest", async () => {
		const digest = await hashPasswordForWire("password1");

		expect(digest).toMatch(/^[a-f0-9]{64}$/);
	});

	it("is deterministic for the same input", async () => {
		const first = await hashPasswordForWire("password1");
		const second = await hashPasswordForWire("password1");

		expect(first).toBe(second);
	});

	it("does not return the plaintext password", async () => {
		const digest = await hashPasswordForWire("password1");

		expect(digest).not.toBe("password1");
	});
});
