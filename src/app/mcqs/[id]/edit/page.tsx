import { McqForm } from "@/components/mcq-form";

export default async function EditMcqPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return (
		<div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10">
			<McqForm mcqId={id} />
		</div>
	);
}
