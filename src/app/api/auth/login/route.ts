import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { getUserByIdentifier, toPublicUser, verifyPassword } from "@/lib/services/user-service";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
	try {
		const body: unknown = await request.json();
		const parsed = loginSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
				{ status: 400 },
			);
		}

		const { env } = await getCloudflareContext();
		const row = await getUserByIdentifier(env.DB, parsed.data.identifier);

		if (!row) {
			return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
		}

		const valid = await verifyPassword(parsed.data.password, row.password_hash);
		if (!valid) {
			return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
		}

		const user = toPublicUser({
			id: row.id,
			firstName: row.first_name,
			lastName: row.last_name,
			username: row.username,
			email: row.email,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		});

		return NextResponse.json({ success: true, user });
	} catch (error) {
		console.error("Login error:", error);
		return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
	}
}
