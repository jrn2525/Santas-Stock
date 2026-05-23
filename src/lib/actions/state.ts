// Shared form-state shapes for action returns. Lives outside any "use server"
// file because those may only export async functions.

export type FormState = {
  errors: Record<string, string[]>;
  message: string | null;
};

export const emptyFormState: FormState = { errors: {}, message: null };

export type ImportSummary = {
  ok: boolean;
  message: string | null;
  items: { created: number; updated: number };
  kits: { created: number; updated: number };
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export const emptyImportSummary: ImportSummary = {
  ok: false,
  message: null,
  items: { created: 0, updated: 0 },
  kits: { created: 0, updated: 0 },
  skipped: 0,
  errors: [],
};
