// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: {} },
	})),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	createMcq: vi.fn(),
	listMcqs: vi.fn(),
	McqValidationError: class McqValidationError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "McqValidationError";
		}
	},
}));

import { createMcq, listMcqs } from "@/lib/services/mcq-service";
import { GET, POST } from "./route";

const createMcqMock = vi.mocked(createMcq);
const listMcqsMock = vi.mocked(listMcqs);

const writeBody = {
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	choices: [
		{ text: "3", isCorrect: false },
		{ text: "4", isCorrect: true },
	],
};

const createdMcq = {
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

function postJson(body: unknown) {
	return new Request("http://localhost/api/mcqs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("/api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET returns 200 with the service list", async () => {
		const summaries = [
			{
				id: "mcq-1",
				name: "What is 2 + 2?",
				description: "Basic arithmetic",
				createdAt: "2026-09-02T00:00:00.000Z",
				updatedAt: "2026-09-02T00:00:00.000Z",
			},
		];
		listMcqsMock.mockResolvedValue(summaries);

		const response = await GET();
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ success: true, mcqs: summaries });
		expect(listMcqsMock).toHaveBeenCalledWith({});
	});

	it("POST returns 201 with the created mcq", async () => {
		createMcqMock.mockResolvedValue(createdMcq);

		const response = await POST(postJson(writeBody));
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload).toEqual({ success: true, mcq: createdMcq });
		expect(createMcqMock).toHaveBeenCalledWith({}, writeBody);
	});

	it("POST returns 400 on validation failure", async () => {
		const response = await POST(postJson({ ...writeBody, name: "" }));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({ success: false });
		expect(payload.error).toEqual(expect.any(String));
		expect(createMcqMock).not.toHaveBeenCalled();
	});

	it("POST returns 500 on unexpected errors", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		createMcqMock.mockRejectedValue(new Error("d1 unavailable"));

		const response = await POST(postJson(writeBody));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload).toEqual({ success: false, error: "Internal server error" });
		errorSpy.mockRestore();
	});
});
