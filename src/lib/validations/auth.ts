import { z } from "zod";

const usernamePattern = /^[a-zA-Z0-9_-]+$/;

export const registerSchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(100),
	lastName: z.string().trim().min(1, "Last name is required").max(100),
	username: z
		.string()
		.trim()
		.min(3, "Username must be at least 3 characters")
		.max(50)
		.refine(
			(value) => usernamePattern.test(value) || z.string().email().safeParse(value).success,
			{
				message: "Username may only contain letters, numbers, underscores, and hyphens",
			},
		),
	email: z.string().trim().email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

export const loginSchema = z.object({
	identifier: z.string().trim().min(1, "Username or email is required"),
	password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
