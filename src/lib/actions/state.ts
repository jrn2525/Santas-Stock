// Shared form-state shapes for action returns. Lives outside any "use server"
// file because those may only export async functions.

export type FormState = {
  errors: Record<string, string[]>;
  message: string | null;
};

export const emptyFormState: FormState = { errors: {}, message: null };
