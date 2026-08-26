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

import { setStoredUser } from "@/lib/auth-client";
import McqsPage from "./page";

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

describe("mcqs page", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("greets the stored user when a display hint is present", async () => {
		setStoredUser(publicUser);
		render(<McqsPage />);

		await waitFor(() => {
			expect(screen.getByText(/signed in as/i).textContent).toContain("Ada Lovelace");
		});
		expect(screen.getByText(/signed in as/i).textContent).toContain("ada");
	});

	it("logout POSTs /api/auth/logout, clears the display hint, and navigates to /login", async () => {
		const user = userEvent.setup();
		setStoredUser(publicUser);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ success: true }),
		});

		render(<McqsPage />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
		expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
		expect(sessionStorage.getItem("quizmaker_user")).toBeNull();
	});

	it("does not render question authoring controls", () => {
		render(<McqsPage />);

		expect(screen.queryByRole("button", { name: /add question/i })).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.getByText(/coming soon/i)).toBeTruthy();
	});
});
