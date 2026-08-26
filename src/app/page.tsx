import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<Card className="w-full max-w-lg">
				<CardHeader>
					<CardTitle>QuizMaker</CardTitle>
					<CardDescription>
						A collaborative test bank for teachers to build and share multiple-choice questions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Create an account or log in to reach the MCQ workspace. Question authoring arrives in the next sprint.
					</p>
				</CardContent>
				<CardFooter className="flex gap-3">
					<Link href="/register">
						<Button>Register</Button>
					</Link>
					<Link href="/login">
						<Button variant="outline">Log in</Button>
					</Link>
				</CardFooter>
			</Card>
		</div>
	);
}
