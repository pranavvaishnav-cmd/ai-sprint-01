export interface User {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateUserInput {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	password: string;
}

export interface UpdateUserInput {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	password?: string;
}

export interface UserRow {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
}
