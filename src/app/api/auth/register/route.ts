import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { createUser, DuplicateUserError, toPublicUser } from "@/lib/services/user-service";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
	try {
		const body: unknown = await request.json();
		const parsed = registerSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
				{ status: 400 },
			);
		}

		const { env } = await getCloudflareContext();
		const user = await createUser(env.DB, parsed.data);

		return NextResponse.json({ success: true, user: toPublicUser(user) }, { status: 201 });
	} catch (error) {
		if (error instanceof DuplicateUserError) {
			return NextResponse.json(
				{ success: false, error: `A user with this ${error.field} already exists` },
				{ status: 409 },
			);
		}

		console.error("Register error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}
