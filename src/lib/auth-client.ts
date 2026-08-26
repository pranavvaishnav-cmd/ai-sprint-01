export interface StoredUser {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
}

const STORAGE_KEY = "quizmaker_user";

export function getStoredUser(): StoredUser | null {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw) as StoredUser;
	} catch {
		sessionStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

export function setStoredUser(user: StoredUser): void {
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
	sessionStorage.removeItem(STORAGE_KEY);
}
