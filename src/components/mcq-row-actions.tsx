"use client";

import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import type { McqSummary } from "@/lib/types/mcq";
import { Button } from "@/components/ui/button";

interface McqRowActionsProps {
	mcq: McqSummary;
	onDelete: (mcq: McqSummary) => void;
}

export function McqRowActions({ mcq, onDelete }: McqRowActionsProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [coords, setCoords] = useState({ top: 0, right: 0 });

	useEffect(() => {
		if (!open) {
			return;
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		}

		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [open]);

	function toggle(event: MouseEvent<HTMLButtonElement>) {
		const rect = event.currentTarget.getBoundingClientRect();
		setCoords({
			top: rect.bottom + 4,
			right: Math.max(8, window.innerWidth - rect.right),
		});
		setOpen((current) => !current);
	}

	return (
		<div ref={rootRef}>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Open actions"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={toggle}
			>
				<EllipsisVertical />
			</Button>
			{open
				? createPortal(
						<div
							ref={menuRef}
							role="menu"
							className="fixed z-50 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
							style={{ top: coords.top, right: coords.right }}
						>
							<button
								type="button"
								role="menuitem"
								className="flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
								onClick={() => {
									setOpen(false);
									router.push(`/mcqs/${mcq.id}/edit`);
								}}
							>
								Edit
							</button>
							<button
								type="button"
								role="menuitem"
								className="flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
								onClick={() => {
									setOpen(false);
									router.push(`/mcqs/${mcq.id}/preview`);
								}}
							>
								Preview
							</button>
							<button
								type="button"
								role="menuitem"
								className="flex w-full cursor-default items-center rounded-md px-1.5 py-1 text-left text-sm text-destructive hover:bg-destructive/10"
								onClick={() => {
									setOpen(false);
									onDelete(mcq);
								}}
							>
								Delete
							</button>
						</div>,
						document.body,
					)
				: null}
		</div>
	);
}
