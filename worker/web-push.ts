/**
 * Minimal Web Push implementation for Cloudflare Workers using Web Crypto API.
 * Implements RFC 8291 (Message Encryption) + RFC 8292 (VAPID).
 */

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface VapidConfig {
  publicKey: string;  // base64url
  privateKey: string; // base64url
  subject: string;    // mailto: or https:
}

/** Send a push notification. Returns true if successful, false if subscription is gone (410). */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidConfig,
  ttl = 86400
): Promise<{ success: boolean; status: number; gone: boolean }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Build VAPID Authorization header
  const vapidHeaders = await createVapidAuthHeader(audience, vapid);

  // Encrypt the payload per RFC 8291
  const encrypted = await encryptPayload(
    payload,
    subscription.keys.p256dh,
    subscription.keys.auth
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidHeaders.authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(ttl),
      'Urgency': 'normal',
    },
    body: encrypted,
  });

  return {
    success: response.status >= 200 && response.status < 300,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}

// ─── VAPID JWT ───

async function createVapidAuthHeader(audience: string, vapid: VapidConfig) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: vapid.subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const claimsB64 = base64urlEncode(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;

  // Import VAPID private key
  const privateKeyRaw = base64urlDecode(vapid.privateKey);
  // Build JWK for the private key
  const publicKeyRaw = base64urlDecode(vapid.publicKey);
  const x = publicKeyRaw.slice(1, 33);
  const y = publicKeyRaw.slice(33, 65);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: arrayToBase64url(x),
    y: arrayToBase64url(y),
    d: arrayToBase64url(privateKeyRaw),
  };

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );

  // Convert DER signature to raw r||s format for JWT
  const signature = derToRaw(new Uint8Array(signatureBuffer));
  const signatureB64 = arrayToBase64url(signature);
  const token = `${unsigned}.${signatureB64}`;

  return {
    authorization: `vapid t=${token}, k=${vapid.publicKey}`,
  };
}

// ─── Payload Encryption (RFC 8291 / aes128gcm) ───

async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string
): Promise<ArrayBuffer> {
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Subscriber's public key and auth secret
  const subscriberPubKey = base64urlDecode(p256dhB64);
  const authSecret = base64urlDecode(authB64);

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;
  const localPubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeyPair.publicKey) as ArrayBuffer
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw', subscriberPubKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberKey } as any,
      localKeyPair.privateKey,
      256
    )
  );

  // PRK for auth: HKDF-SHA256(auth_secret, shared_secret, "WebPush: info\0" || subscriber_pub || local_pub)
  const authInfo = buildInfo('WebPush: info\0', subscriberPubKey, localPubKeyRaw);
  const prkAuth = await hkdfSha256(authSecret, sharedSecret, authInfo, 32);

  // Derive CEK (Content Encryption Key)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdfSha256(salt, prkAuth, cekInfo, 16);

  // Derive nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdfSha256(salt, prkAuth, nonceInfo, 12);

  // Pad the plaintext with a delimiter byte (0x02) per RFC 8291
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02; // delimiter

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  );

  // Build aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPubKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = localPubKeyRaw.length;
  header.set(localPubKeyRaw, 21);

  // Combine
  const result = new Uint8Array(header.length + ciphertext.length);
  result.set(header);
  result.set(ciphertext, header.length);

  return result.buffer;
}

function buildInfo(type: string, subscriberPub: Uint8Array, localPub: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const result = new Uint8Array(typeBytes.length + subscriberPub.length + localPub.length);
  result.set(typeBytes);
  result.set(subscriberPub, typeBytes.length);
  result.set(localPub, typeBytes.length + subscriberPub.length);
  return result;
}

// ─── Crypto Helpers ───

async function hkdfSha256(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

function derToRaw(der: Uint8Array): Uint8Array {
  // ECDSA signatures from WebCrypto may be in raw r||s format already (64 bytes)
  if (der.length === 64) return der;

  // Otherwise parse DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  const raw = new Uint8Array(64);
  let offset = 2; // skip 0x30 <total-len>

  // R
  offset++; // skip 0x02
  let rLen = der[offset++];
  if (rLen === 33) { offset++; rLen = 32; } // skip leading 0x00
  raw.set(der.slice(offset, offset + rLen), 32 - rLen);
  offset += rLen;

  // S
  offset++; // skip 0x02
  let sLen = der[offset++];
  if (sLen === 33) { offset++; sLen = 32; } // skip leading 0x00
  raw.set(der.slice(offset, offset + sLen), 64 - sLen);

  return raw;
}

function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return arrayToBase64url(bytes);
}

function arrayToBase64url(arr: Uint8Array): string {
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
