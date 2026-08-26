import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, fetchMock } = vi.hoisted(() => ({
	pushMock: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: pushMock }),
}));

import RegisterPage from "./page";

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

async function fillRegisterForm(
	user: ReturnType<typeof userEvent.setup>,
	password = "password1",
	confirm = "password1",
) {
	await user.type(screen.getByLabelText("First name"), "Ada");
	await user.type(screen.getByLabelText("Last name"), "Lovelace");
	await user.type(screen.getByLabelText("Username"), "ada");
	await user.type(screen.getByLabelText("Email"), "ada@school.edu");
	await user.type(screen.getByLabelText("Password"), password);
	await user.type(screen.getByLabelText("Confirm Password"), confirm);
}

describe("register page", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("hashes the password before POSTing /api/auth/register", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<RegisterPage />);
		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { password: string };

		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/register");
		expect(init.method).toBe("POST");
		expect(body.password).not.toBe("password1");
		expect(body.password).toMatch(/^[a-f0-9]{64}$/);
	});

	it("POSTs firstName, lastName, username, email, and the digest — not the typed password", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<RegisterPage />);
		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as Record<string, string>;

		expect(body.firstName).toBe("Ada");
		expect(body.lastName).toBe("Lovelace");
		expect(body.username).toBe("ada");
		expect(body.email).toBe("ada@school.edu");
		expect(body.password).not.toBe("password1");
	});

	it("shows an error when passwords do not match and does not fetch", async () => {
		const user = userEvent.setup();

		render(<RegisterPage />);
		await fillRegisterForm(user, "password1", "password2");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/passwords do not match/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("stores the public user and navigates to /mcqs on 201", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<RegisterPage />);
		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
		expect(JSON.parse(sessionStorage.getItem("quizmaker_user") ?? "null")).toEqual(publicUser);
	});

	it("shows the server error on 409", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({ success: false, error: "A user with this username already exists" }),
		});

		render(<RegisterPage />);
		await fillRegisterForm(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("A user with this username already exists");
		});
		expect(pushMock).not.toHaveBeenCalled();
	});
});
