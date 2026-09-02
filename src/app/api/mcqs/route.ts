import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { createMcq, listMcqs, McqValidationError } from "@/lib/services/mcq-service";
import { mcqWriteSchema } from "@/lib/validations/mcq";

export async function GET() {
	try {
		const { env } = await getCloudflareContext();
		const mcqs = await listMcqs(env.DB);
		return NextResponse.json({ success: true, mcqs });
	} catch (error) {
		console.error("List MCQs error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const body: unknown = await request.json();
		const parsed = mcqWriteSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
				{ status: 400 },
			);
		}

		const { env } = await getCloudflareContext();
		const mcq = await createMcq(env.DB, parsed.data);
		return NextResponse.json({ success: true, mcq }, { status: 201 });
	} catch (error) {
		if (error instanceof McqValidationError) {
			return NextResponse.json({ success: false, error: error.message }, { status: 400 });
		}

		console.error("Create MCQ error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}
