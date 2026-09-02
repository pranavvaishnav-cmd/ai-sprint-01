// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: {} },
	})),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	deleteMcq: vi.fn(),
	getMcqById: vi.fn(),
	updateMcq: vi.fn(),
	McqNotFoundError: class McqNotFoundError extends Error {
		constructor(message = "Question not found") {
			super(message);
			this.name = "McqNotFoundError";
		}
	},
	McqValidationError: class McqValidationError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "McqValidationError";
		}
	},
}));

import { deleteMcq, getMcqById, McqNotFoundError, updateMcq } from "@/lib/services/mcq-service";
import { DELETE, GET, PUT } from "./route";

const getMcqByIdMock = vi.mocked(getMcqById);
const updateMcqMock = vi.mocked(updateMcq);
const deleteMcqMock = vi.mocked(deleteMcq);

const mcq = {
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

const writeBody = {
	name: "What is 3 + 1?",
	description: "Still arithmetic",
	choices: [
		{ text: "5", isCorrect: false },
		{ text: "4", isCorrect: true },
	],
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function putJson(body: unknown, id = "mcq-1") {
	return new Request(`http://localhost/api/mcqs/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("/api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET returns 200 with the mcq", async () => {
		getMcqByIdMock.mockResolvedValue(mcq);

		const response = await GET(new Request("http://localhost/api/mcqs/mcq-1"), context());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ success: true, mcq });
		expect(getMcqByIdMock).toHaveBeenCalledWith({}, "mcq-1");
	});

	it("GET returns 404 when missing", async () => {
		getMcqByIdMock.mockRejectedValue(new McqNotFoundError());

		const response = await GET(new Request("http://localhost/api/mcqs/missing"), context("missing"));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload).toEqual({ success: false, error: "Question not found" });
	});

	it("PUT returns 200 with the updated mcq", async () => {
		updateMcqMock.mockResolvedValue({ ...mcq, ...writeBody, choices: mcq.choices });

		const response = await PUT(putJson(writeBody), context());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.mcq.name).toBe("What is 3 + 1?");
		expect(updateMcqMock).toHaveBeenCalledWith({}, "mcq-1", writeBody);
	});

	it("PUT returns 400 on validation failure", async () => {
		const response = await PUT(putJson({ ...writeBody, name: "" }), context());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({ success: false });
		expect(updateMcqMock).not.toHaveBeenCalled();
	});

	it("PUT returns 404 when missing", async () => {
		updateMcqMock.mockRejectedValue(new McqNotFoundError());

		const response = await PUT(putJson(writeBody), context("missing"));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload).toEqual({ success: false, error: "Question not found" });
	});

	it("DELETE returns 200 when deleted", async () => {
		deleteMcqMock.mockResolvedValue(true);

		const response = await DELETE(new Request("http://localhost/api/mcqs/mcq-1"), context());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ success: true });
		expect(deleteMcqMock).toHaveBeenCalledWith({}, "mcq-1");
	});

	it("DELETE returns 404 when missing", async () => {
		deleteMcqMock.mockResolvedValue(false);

		const response = await DELETE(new Request("http://localhost/api/mcqs/missing"), context("missing"));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload).toEqual({ success: false, error: "Question not found" });
	});
});
