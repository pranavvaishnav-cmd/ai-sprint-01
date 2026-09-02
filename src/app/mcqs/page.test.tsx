import { render, screen, waitFor, within } from "@testing-library/react";
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

const sampleMcqs = [
	{
		id: "mcq-1",
		name: "What is 2 + 2?",
		description: "Basic arithmetic",
		createdAt: "2026-09-02T00:00:00.000Z",
		updatedAt: "2026-09-02T00:00:00.000Z",
	},
];

function mockJson(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

function mockList(mcqs: unknown[] = []) {
	fetchMock.mockImplementation((input: RequestInfo | URL) => {
		const url = String(input);
		if (url === "/api/auth/logout") {
			return Promise.resolve(mockJson(200, { success: true }));
		}
		if (url === "/api/mcqs" && (!fetchMock.mock.lastCall?.[1] || fetchMock.mock.lastCall[1]?.method !== "DELETE")) {
			return Promise.resolve(mockJson(200, { success: true, mcqs }));
		}
		if (String(url).startsWith("/api/mcqs/") && fetchMock.mock.lastCall?.[1]?.method === "DELETE") {
			return Promise.resolve(mockJson(200, { success: true }));
		}
		return Promise.resolve(mockJson(200, { success: true, mcqs }));
	});
}

describe("mcqs page", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		sessionStorage.clear();
		vi.stubGlobal("fetch", fetchMock);
		mockList([]);
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

		render(<McqsPage />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
		expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
		expect(sessionStorage.getItem("quizmaker_user")).toBeNull();
	});

	it("fetches GET /api/mcqs and renders name and description in a table", async () => {
		mockList(sampleMcqs);
		render(<McqsPage />);

		await waitFor(() => {
			expect(screen.getByRole("table")).toBeTruthy();
		});
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByText("Basic arithmetic")).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith("/api/mcqs");
	});

	it("shows an empty state when there are no questions", async () => {
		render(<McqsPage />);

		await waitFor(() => {
			expect(screen.getByText(/no questions yet/i)).toBeTruthy();
		});
		expect(screen.getByRole("button", { name: /create question/i })).toBeTruthy();
	});

	it("Create question navigates to /mcqs/new", async () => {
		const user = userEvent.setup();
		render(<McqsPage />);

		await user.click(screen.getByRole("button", { name: /create question/i }));
		expect(pushMock).toHaveBeenCalledWith("/mcqs/new");
	});

	it("row actions menu exposes Edit, Preview, and Delete", async () => {
		const user = userEvent.setup();
		mockList(sampleMcqs);
		render(<McqsPage />);

		await waitFor(() => expect(screen.getByText("What is 2 + 2?")).toBeTruthy());
		await user.click(screen.getByRole("button", { name: /open actions/i }));

		expect(screen.getByRole("menuitem", { name: /edit/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /preview/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /delete/i })).toBeTruthy();
	});

	it("Edit navigates to /mcqs/[id]/edit", async () => {
		const user = userEvent.setup();
		mockList(sampleMcqs);
		render(<McqsPage />);

		await waitFor(() => expect(screen.getByText("What is 2 + 2?")).toBeTruthy());
		await user.click(screen.getByRole("button", { name: /open actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /edit/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcqs/mcq-1/edit");
	});

	it("Preview navigates to /mcqs/[id]/preview", async () => {
		const user = userEvent.setup();
		mockList(sampleMcqs);
		render(<McqsPage />);

		await waitFor(() => expect(screen.getByText("What is 2 + 2?")).toBeTruthy());
		await user.click(screen.getByRole("button", { name: /open actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /preview/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcqs/mcq-1/preview");
	});

	it("Delete confirms and DELETEs /api/mcqs/[id], then removes the row", async () => {
		const user = userEvent.setup();
		mockList(sampleMcqs);
		render(<McqsPage />);

		await waitFor(() => expect(screen.getByText("What is 2 + 2?")).toBeTruthy());
		await user.click(screen.getByRole("button", { name: /open actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /delete/i }));

		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith("/api/mcqs/mcq-1", { method: "DELETE" });
		});
		await waitFor(() => {
			expect(screen.queryByText("What is 2 + 2?")).toBeNull();
		});
	});
});
