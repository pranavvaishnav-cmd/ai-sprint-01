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

import LoginPage from "./page";

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

describe("login page", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("hashes the password before POSTing /api/auth/login", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<LoginPage />);
		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { password: string };

		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/login");
		expect(body.password).not.toBe("password1");
		expect(body.password).toMatch(/^[a-f0-9]{64}$/);
	});

	it("POSTs identifier and the digest — not the typed password", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<LoginPage />);
		await user.type(screen.getByLabelText("Username or email"), "ada@school.edu");
		await user.type(screen.getByLabelText("Password"), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { identifier: string; password: string };

		expect(body.identifier).toBe("ada@school.edu");
		expect(body.password).not.toBe("password1");
	});

	it("stores the public user and navigates to /mcqs on 200", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ success: true, user: publicUser }),
		});

		render(<LoginPage />);
		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
		expect(JSON.parse(sessionStorage.getItem("quizmaker_user") ?? "null")).toEqual(publicUser);
	});

	it("shows Invalid credentials on 401", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ success: false, error: "Invalid credentials" }),
		});

		render(<LoginPage />);
		await user.type(screen.getByLabelText("Username or email"), "ada");
		await user.type(screen.getByLabelText("Password"), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toMatch(/invalid credentials/i);
		});
		expect(pushMock).not.toHaveBeenCalled();
	});
});
