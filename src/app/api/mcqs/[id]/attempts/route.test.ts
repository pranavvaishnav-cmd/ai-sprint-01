// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: {} },
	})),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	createAttempt: vi.fn(),
	listAttempts: vi.fn(),
	InvalidChoiceError: class InvalidChoiceError extends Error {
		constructor(message = "Choice does not belong to this question") {
			super(message);
			this.name = "InvalidChoiceError";
		}
	},
	McqNotFoundError: class McqNotFoundError extends Error {
		constructor(message = "Question not found") {
			super(message);
			this.name = "McqNotFoundError";
		}
	},
}));

import { createAttempt, InvalidChoiceError, listAttempts, McqNotFoundError } from "@/lib/services/mcq-service";
import { GET, POST } from "./route";

const createAttemptMock = vi.mocked(createAttempt);
const listAttemptsMock = vi.mocked(listAttempts);

const attempt = {
	id: "attempt-1",
	mcqId: "mcq-1",
	choiceId: "choice-2",
	isCorrect: true,
	createdAt: "2026-09-02T00:00:00.000Z",
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function postJson(body: unknown, id = "mcq-1") {
	return new Request(`http://localhost/api/mcqs/${id}/attempts`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("/api/mcqs/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POST returns 201 with the attempt and uses the server isCorrect", async () => {
		createAttemptMock.mockResolvedValue(attempt);

		const response = await POST(postJson({ choiceId: "choice-2", isCorrect: false }), context());
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload).toEqual({ success: true, attempt });
		expect(payload.attempt.isCorrect).toBe(true);
		expect(createAttemptMock).toHaveBeenCalledWith({}, "mcq-1", "choice-2");
		expect(createAttemptMock.mock.calls[0]).not.toContain(false);
	});

	it("POST returns 400 when choiceId is missing", async () => {
		const response = await POST(postJson({}), context());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({ success: false });
		expect(createAttemptMock).not.toHaveBeenCalled();
	});

	it("POST returns 400 when the choice is invalid for that question", async () => {
		createAttemptMock.mockRejectedValue(new InvalidChoiceError());

		const response = await POST(postJson({ choiceId: "other-choice" }), context());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			success: false,
			error: "Choice does not belong to this question",
		});
	});

	it("POST returns 404 when the question is missing", async () => {
		createAttemptMock.mockRejectedValue(new McqNotFoundError());

		const response = await POST(postJson({ choiceId: "choice-2" }), context("missing"));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload).toEqual({ success: false, error: "Question not found" });
	});

	it("GET returns 200 with the attempt list", async () => {
		listAttemptsMock.mockResolvedValue([attempt]);

		const response = await GET(new Request("http://localhost/api/mcqs/mcq-1/attempts"), context());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ success: true, attempts: [attempt] });
		expect(listAttemptsMock).toHaveBeenCalledWith({}, "mcq-1");
	});

	it("GET returns 404 when the question is missing", async () => {
		listAttemptsMock.mockRejectedValue(new McqNotFoundError());

		const response = await GET(new Request("http://localhost/api/mcqs/missing/attempts"), context("missing"));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload).toEqual({ success: false, error: "Question not found" });
	});
});
