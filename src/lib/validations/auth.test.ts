// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/validations/auth";

const validRegister = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: "abc",
};

describe("registerSchema", () => {
	it("accepts a valid body including username equal to email", () => {
		const same = "teacher@school.edu";
		const parsed = registerSchema.safeParse({
			...validRegister,
			username: same,
			email: same,
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.username).toBe(same);
			expect(parsed.data.email).toBe(same);
		}
	});

	it("rejects missing names, invalid email, and invalid username", () => {
		expect(registerSchema.safeParse({ ...validRegister, firstName: "" }).success).toBe(false);
		expect(registerSchema.safeParse({ ...validRegister, lastName: "  " }).success).toBe(false);
		expect(registerSchema.safeParse({ ...validRegister, email: "not-an-email" }).success).toBe(false);
		expect(registerSchema.safeParse({ ...validRegister, username: "ab" }).success).toBe(false);
		expect(registerSchema.safeParse({ ...validRegister, username: "ada!" }).success).toBe(false);
	});

	it("treats password as an opaque digest (does not require min 8 on the hashed value)", () => {
		const parsed = registerSchema.safeParse(validRegister);

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.password).toBe("abc");
		}
	});
});

describe("loginSchema", () => {
	it("requires identifier and password", () => {
		expect(loginSchema.safeParse({ identifier: "ada", password: "digest" }).success).toBe(true);
		expect(loginSchema.safeParse({ password: "digest" }).success).toBe(false);
		expect(loginSchema.safeParse({ identifier: "ada" }).success).toBe(false);
	});

	it("rejects an empty identifier", () => {
		expect(loginSchema.safeParse({ identifier: "", password: "digest" }).success).toBe(false);
		expect(loginSchema.safeParse({ identifier: "   ", password: "digest" }).success).toBe(false);
	});
});
