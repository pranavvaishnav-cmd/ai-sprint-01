import { beforeEach, describe, expect, it } from "vitest";

import { clearStoredUser, getStoredUser, setStoredUser, type StoredUser } from "@/lib/auth-client";

const user: StoredUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

describe("auth-client display hint", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("setStoredUser then getStoredUser round-trips the public user", () => {
		setStoredUser(user);

		expect(getStoredUser()).toEqual(user);
	});

	it("clearStoredUser removes the stored user", () => {
		setStoredUser(user);
		clearStoredUser();

		expect(getStoredUser()).toBeNull();
	});

	it("getStoredUser returns a stable snapshot when storage is unchanged", () => {
		setStoredUser(user);

		expect(getStoredUser()).toBe(getStoredUser());
	});
});
