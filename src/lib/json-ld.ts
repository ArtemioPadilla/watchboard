/**
 * Serialize an object for inline JSON-LD <script> blocks.
 *
 * JSON.stringify alone does not escape `<`, so a value containing
 * `</script>` would break out of the script tag (latent XSS). Escaping
 * `<` as the unicode escape u003c keeps the payload valid JSON while
 * making it inert HTML.
 */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
