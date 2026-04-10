#!/usr/bin/env npx tsx
/**
 * Generate VAPID key pair for Web Push notifications.
 *
 * Usage:
 *   npx tsx scripts/generate-vapid-keys.ts
 *
 * Output: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as base64url-encoded strings.
 * Store these as Cloudflare Pages environment variables (Settings > Environment Variables).
 * Also set VAPID_SUBJECT to "mailto:admin@watchboard.dev".
 */

async function generateVapidKeys() {
  // Generate an ECDSA P-256 key pair (the standard for VAPID / Web Push)
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  // Export the public key as raw bytes, then base64url-encode
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyB64 = Buffer.from(publicKeyRaw).toString('base64url');

  // Export the private key as PKCS8, extract the raw 32-byte scalar
  const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyBytes = new Uint8Array(privateKeyPkcs8);
  // PKCS8 for P-256: the raw 32-byte private key scalar is the last 32 bytes
  const rawPrivateKey = privateKeyBytes.slice(-32);
  const privateKeyB64 = Buffer.from(rawPrivateKey).toString('base64url');

  console.log('=== VAPID Keys Generated ===\n');
  console.log('Add these to Cloudflare Pages > Settings > Environment Variables:\n');
  console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
  console.log(`VAPID_SUBJECT=mailto:admin@watchboard.dev`);
  console.log('\nAlso add VAPID_PUBLIC_KEY to your client-side .env if needed:');
  console.log(`PUBLIC_VAPID_KEY=${publicKeyB64}`);
}

generateVapidKeys().catch(err => {
  console.error('Failed to generate VAPID keys:', err);
  process.exit(1);
});
