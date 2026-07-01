/** Builds the shared "invite a friend" WhatsApp deep link for a referral code. */
export function buildWhatsAppInviteLink(referralCode: string): string {
  const message = `Join me on Poker Agent and get rakeback on every hand. Use my invite code ${referralCode} to sign up: https://pokeragent.app/r/${referralCode}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
