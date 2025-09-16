/**
 * Consent Grants API utilities
 * Wrapper functions for use by other modules to avoid Next.js route export conflicts
 */

import { 
  addConsentGrant as addGrant, 
  updateLastUsed as updateGrantLastUsed, 
  revokeGrant as revokeUserGrant
} from './consent-grants';

export async function addConsentGrant(
  userEmail: string,
  clientId: string,
  clientName: string,
  scopes: string[],
  userId?: string
): Promise<string> {
  return addGrant(userEmail, clientId, clientName, scopes, userId);
}

export async function updateLastUsed(userEmail: string, clientId: string): Promise<void> {
  return updateGrantLastUsed(userEmail, clientId);
}

export async function revokeGrant(grantId: string, userEmail: string): Promise<boolean> {
  return revokeUserGrant(grantId, userEmail);
}