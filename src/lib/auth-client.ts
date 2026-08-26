export interface StoredUser {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
}

const STORAGE_KEY = "quizmaker_user";

let cachedRaw: string | null = null;
let cachedUser: StoredUser | null = null;

export function getStoredUser(): StoredUser | null {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (raw === cachedRaw) {
		return cachedUser;
	}

	cachedRaw = raw;
	if (!raw) {
		cachedUser = null;
		return null;
	}

	try {
		cachedUser = JSON.parse(raw) as StoredUser;
		return cachedUser;
	} catch {
		sessionStorage.removeItem(STORAGE_KEY);
		cachedRaw = null;
		cachedUser = null;
		return null;
	}
}

export function setStoredUser(user: StoredUser): void {
	const raw = JSON.stringify(user);
	sessionStorage.setItem(STORAGE_KEY, raw);
	cachedRaw = raw;
	cachedUser = user;
}

export function clearStoredUser(): void {
	sessionStorage.removeItem(STORAGE_KEY);
	cachedRaw = null;
	cachedUser = null;
}

export function subscribeStoredUser(onStoreChange: () => void): () => void {
	window.addEventListener("storage", onStoreChange);
	return () => window.removeEventListener("storage", onStoreChange);
}
