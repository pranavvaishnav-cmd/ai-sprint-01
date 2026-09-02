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

import { McqForm } from "@/components/mcq-form";

const existingMcq = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	createdAt: "2026-09-02T00:00:00.000Z",
	updatedAt: "2026-09-02T00:00:00.000Z",
	choices: [
		{ id: "choice-1", text: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", text: "4", isCorrect: true, position: 1 },
	],
};

function mockJson(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

describe("McqForm", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("starts with two choice fields and no more than six", () => {
		render(<McqForm />);

		expect(screen.getAllByRole("textbox", { name: /^choice \d+$/i })).toHaveLength(2);
		expect(screen.queryByRole("textbox", { name: /^choice 7$/i })).toBeNull();
	});

	it("Add choice adds a row until six, then is not available", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		await user.click(screen.getByRole("button", { name: /add choice/i }));
		await user.click(screen.getByRole("button", { name: /add choice/i }));
		await user.click(screen.getByRole("button", { name: /add choice/i }));

		expect(screen.getAllByRole("textbox", { name: /^choice \d+$/i })).toHaveLength(6);
		expect(screen.queryByRole("button", { name: /add choice/i })).toBeNull();
	});

	it("Remove is unavailable when only two choices remain", () => {
		render(<McqForm />);

		expect(screen.queryByRole("button", { name: /remove choice/i })).toBeNull();
	});

	it("Save on create POSTs /api/mcqs with name, description, and choices — not a client-computed score", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue(mockJson(201, { success: true, mcq: existingMcq }));

		render(<McqForm />);
		await user.type(screen.getByRole("textbox", { name: /^name$/i }), "What is 2 + 2?");
		await user.type(screen.getByRole("textbox", { name: /^description$/i }), "Basic arithmetic");
		await user.type(screen.getByRole("textbox", { name: /^choice 1$/i }), "3");
		await user.type(screen.getByRole("textbox", { name: /^choice 2$/i }), "4");
		await user.click(screen.getByRole("radio", { name: /correct answer for choice 2/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/mcqs");
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe("POST");
		const body = JSON.parse(String(init.body)) as {
			name: string;
			description: string;
			choices: Array<{ text: string; isCorrect: boolean }>;
			score?: number;
		};
		expect(body).toEqual({
			name: "What is 2 + 2?",
			description: "Basic arithmetic",
			choices: [
				{ text: "3", isCorrect: false },
				{ text: "4", isCorrect: true },
			],
		});
		expect(body).not.toHaveProperty("score");
	});

	it("Save is not sent when name is empty or no correct choice is selected", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.type(screen.getByRole("textbox", { name: /^choice 1$/i }), "3");
		await user.type(screen.getByRole("textbox", { name: /^choice 2$/i }), "4");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toMatch(/name/i);

		await user.type(screen.getByRole("textbox", { name: /^name$/i }), "What is 2 + 2?");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toMatch(/exactly one/i);
	});

	it("Save on edit PUTs /api/mcqs/[id] after loading GET /api/mcqs/[id]", async () => {
		const user = userEvent.setup();
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === "/api/mcqs/mcq-1" && init?.method === "PUT") {
				return Promise.resolve(mockJson(200, { success: true, mcq: existingMcq }));
			}
			return Promise.resolve(mockJson(200, { success: true, mcq: existingMcq }));
		});

		render(<McqForm mcqId="mcq-1" />);

		await waitFor(() => expect(screen.getByDisplayValue("What is 2 + 2?")).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledWith("/api/mcqs/mcq-1");

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1",
				expect.objectContaining({ method: "PUT" }),
			);
		});
		expect(pushMock).toHaveBeenCalledWith("/mcqs");
	});

	it("Cancel navigates to /mcqs without fetching a write", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /cancel/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcqs");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shows the server error on 400", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValue(mockJson(400, { success: false, error: "Name is required" }));

		render(<McqForm />);
		await user.type(screen.getByRole("textbox", { name: /^name$/i }), "What is 2 + 2?");
		await user.type(screen.getByRole("textbox", { name: /^choice 1$/i }), "3");
		await user.type(screen.getByRole("textbox", { name: /^choice 2$/i }), "4");
		await user.click(screen.getByRole("radio", { name: /correct answer for choice 2/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Name is required");
		});
		expect(pushMock).not.toHaveBeenCalled();
	});
});
