import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { deleteMcq, getMcqById, McqNotFoundError, McqValidationError, updateMcq } from "@/lib/services/mcq-service";
import { mcqWriteSchema } from "@/lib/validations/mcq";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const { env } = await getCloudflareContext();
		const mcq = await getMcqById(env.DB, id);
		return NextResponse.json({ success: true, mcq });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
		}

		console.error("Get MCQ error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

export async function PUT(request: Request, context: RouteContext) {
	try {
		const body: unknown = await request.json();
		const parsed = mcqWriteSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
				{ status: 400 },
			);
		}

		const { id } = await context.params;
		const { env } = await getCloudflareContext();
		const mcq = await updateMcq(env.DB, id, parsed.data);
		return NextResponse.json({ success: true, mcq });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
		}

		if (error instanceof McqValidationError) {
			return NextResponse.json({ success: false, error: error.message }, { status: 400 });
		}

		console.error("Update MCQ error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const { env } = await getCloudflareContext();
		const deleted = await deleteMcq(env.DB, id);

		if (!deleted) {
			return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete MCQ error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}
