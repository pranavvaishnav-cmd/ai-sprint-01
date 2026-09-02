import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, fetchMock } = vi.hoisted(() => ({
	pushMock: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: pushMock }),
	useParams: () => ({ id: "mcq-1" }),
}));

import PreviewPage from "./page";

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

describe("preview page", () => {
	beforeEach(() => {
		pushMock.mockReset();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === "/api/mcqs/mcq-1/attempts" && init?.method === "POST") {
				return Promise.resolve(
					mockJson(201, {
						success: true,
						attempt: {
							id: "attempt-1",
							mcqId: "mcq-1",
							choiceId: "choice-2",
							isCorrect: true,
							createdAt: "2026-09-02T00:00:00.000Z",
						},
					}),
				);
			}
			return Promise.resolve(mockJson(200, { success: true, mcq: existingMcq }));
		});
	});

	it("loads the question and renders choices without announcing the correct answer", async () => {
		render(<PreviewPage />);

		await waitFor(() => expect(screen.getByText("What is 2 + 2?")).toBeTruthy());
		expect(screen.getByText("Basic arithmetic")).toBeTruthy();
		expect(screen.getByLabelText("3")).toBeTruthy();
		expect(screen.getByLabelText("4")).toBeTruthy();
		expect(screen.queryByText(/correct answer/i)).toBeNull();
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.queryByText(/^incorrect$/i)).toBeNull();
	});

	it("submit POSTs /api/mcqs/[id]/attempts with the selected choiceId", async () => {
		const user = userEvent.setup();
		render(<PreviewPage />);

		await waitFor(() => expect(screen.getByLabelText("4")).toBeTruthy());
		await user.click(screen.getByLabelText("4"));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1/attempts",
				expect.objectContaining({ method: "POST" }),
			);
		});
		const attemptCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/attempts"));
		const body = JSON.parse(String((attemptCall?.[1] as RequestInit).body));
		expect(body).toEqual({ choiceId: "choice-2" });
		expect(body).not.toHaveProperty("isCorrect");
	});

	it("shows Correct or Incorrect from the server attempt, not from the loaded choices", async () => {
		const user = userEvent.setup();
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith("/attempts") && init?.method === "POST") {
				return Promise.resolve(
					mockJson(201, {
						success: true,
						attempt: {
							id: "attempt-1",
							mcqId: "mcq-1",
							choiceId: "choice-1",
							isCorrect: false,
							createdAt: "2026-09-02T00:00:00.000Z",
						},
					}),
				);
			}
			return Promise.resolve(mockJson(200, { success: true, mcq: existingMcq }));
		});

		render(<PreviewPage />);
		await waitFor(() => expect(screen.getByLabelText("3")).toBeTruthy());
		await user.click(screen.getByLabelText("3"));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => expect(screen.getByText(/^incorrect$/i)).toBeTruthy());
		expect(screen.queryByText(/^correct$/i)).toBeNull();
	});

	it("Back navigates to /mcqs", async () => {
		const user = userEvent.setup();
		render(<PreviewPage />);

		await waitFor(() => expect(screen.getByRole("button", { name: /back/i })).toBeTruthy());
		await user.click(screen.getByRole("button", { name: /back/i }));
		expect(pushMock).toHaveBeenCalledWith("/mcqs");
	});
});
