export class ExistingContactError extends Error {
  constructor() {
    super("Contact requires staff recovery");
    this.name = "ExistingContactError";
  }
}

export function validateJoin(input: {
  name: string;
  email?: string;
  phone?: string;
}) {
  const name = input.name.trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").replace(/\D/g, "");
  if (name.length < 2 || name.length > 120)
    throw new Error("Escribe un nombre entre 2 y 120 caracteres.");
  if (!email && !phone)
    throw new Error("Deja al menos un email o un teléfono.");
  if (
    email &&
    (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  )
    throw new Error("Ese email no parece válido.");
  if (phone && (phone.length < 7 || phone.length > 15))
    throw new Error("Revisa el número de teléfono.");
  return { name, email: email || null, phone: phone || null };
}

export function validOperationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
