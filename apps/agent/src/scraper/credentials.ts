import type { Provider } from "@household/shared";

/**
 * Login field shapes for exactly the four providers this household
 * uses, taken verbatim from israeli-bank-scrapers' `SCRAPERS` map in
 * src/definitions.ts (loginFields per CompanyTypes entry).
 */
export interface ProviderCredentials {
  hapoalim: { userCode: string; password: string };
  leumi: { username: string; password: string };
  max: { username: string; password: string };
  isracard: { id: string; card6Digits: string; password: string };
}

export const PROVIDER_CREDENTIAL_FIELDS: {
  [P in Provider]: Array<keyof ProviderCredentials[P]>;
} = {
  hapoalim: ["userCode", "password"],
  leumi: ["username", "password"],
  max: ["username", "password"],
  isracard: ["id", "card6Digits", "password"],
};

export const SECRET_FIELD_NAMES = new Set(["password", "card6Digits"]);
