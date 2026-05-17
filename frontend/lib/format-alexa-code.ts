/** Display Alexa link codes with spacing (6-digit or legacy 8-char hex). */
export function formatAlexaLinkCode(code: string | null | undefined): string {
  if (!code) return ""
  const c = code.trim().toUpperCase()
  if (/^\d{6}$/.test(c)) {
    return `${c.slice(0, 3)} ${c.slice(3)}`
  }
  if (/^[A-F0-9]{8}$/.test(c)) {
    return `${c.slice(0, 4)} ${c.slice(4)}`
  }
  return code
}
