import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { createAttempt, InvalidChoiceError, listAttempts, McqNotFoundError } from "@/lib/services/mcq-service";
import { attemptSchema } from "@/lib/validations/mcq";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const { env } = await getCloudflareContext();
		const attempts = await listAttempts(env.DB, id);
		return NextResponse.json({ success: true, attempts });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
		}

		console.error("List attempts error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

export async function POST(request: Request, context: RouteContext) {
	try {
		const body: unknown = await request.json();
		const parsed = attemptSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
				{ status: 400 },
			);
		}

		const { id } = await context.params;
		const { env } = await getCloudflareContext();
		const attempt = await createAttempt(env.DB, id, parsed.data.choiceId);
		return NextResponse.json({ success: true, attempt }, { status: 201 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
		}

		if (error instanceof InvalidChoiceError) {
			return NextResponse.json(
				{ success: false, error: "Choice does not belong to this question" },
				{ status: 400 },
			);
		}

		console.error("Create attempt error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}
