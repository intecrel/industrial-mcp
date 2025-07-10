export const ALLOWED_MAC = '84:94:37:e4:24:88'

export function validateMAC(mac: string): boolean {
  return mac.toLowerCase() === ALLOWED_MAC.toLowerCase()
}