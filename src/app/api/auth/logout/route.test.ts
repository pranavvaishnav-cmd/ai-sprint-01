// @vitest-environment node
import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
	it("returns 200 with success true", async () => {
		const response = await POST();
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
	});
});
