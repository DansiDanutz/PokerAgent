/**
 * Platform governance rules.
 *
 *  - There is exactly ONE admin, identified by ADMIN_EMAIL.
 *  - Everyone else is a player by default.
 *  - Agent status is granted only by the admin, in response to a player's
 *    request (players cannot be promoted by other agents).
 */

export const ADMIN_EMAIL = "semebitcoin@gmail.com";

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}
