// ─── MQTT Message Signing (firmware side) ────────────────────────────────────
// Must match the backend (backend/index.js → "MQTT Message Signing").
// Every MQTT payload is "<hmac>|<session>|<seq>|<json>", where
//   hmac = HMAC-SHA256(authToken, "<kind>|<session>|<seq>|<json>")  (lowercase hex)
//   kind = last topic segment: command | config | state | status
// The device picks a random session on each boot, so commands from an earlier
// boot can't be replayed; seq must increase within a session.
// SHA-256 is implemented inline so the same code builds on ESP32 and ESP8266.

export const mqttSigningCode = (authToken) => `// -- Message Signing (HMAC-SHA256 with this device's auth token) -------
// Commands without a valid signature are ignored. Keep this token secret.
const char* AUTH_TOKEN = "${authToken}";

char IOIOT_SESSION[17];                  // random per boot
unsigned long long ioiotLastCmdSeq = 0;  // highest command seq accepted
unsigned long long ioiotSendSeq = 0;     // seq of our last published message

static const uint32_t SHA_K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};

struct IoiotSha256 { uint32_t h[8]; uint8_t buf[64]; uint64_t len; uint8_t n; };

static inline uint32_t shaRor(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

static void shaBlock(IoiotSha256* s, const uint8_t* p) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++)
    w[i] = (uint32_t)p[i * 4] << 24 | (uint32_t)p[i * 4 + 1] << 16 | (uint32_t)p[i * 4 + 2] << 8 | p[i * 4 + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = shaRor(w[i - 15], 7) ^ shaRor(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = shaRor(w[i - 2], 17) ^ shaRor(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = s->h[0], b = s->h[1], c = s->h[2], d = s->h[3], e = s->h[4], f = s->h[5], g = s->h[6], h = s->h[7];
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = h + (shaRor(e, 6) ^ shaRor(e, 11) ^ shaRor(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i];
    uint32_t t2 = (shaRor(a, 2) ^ shaRor(a, 13) ^ shaRor(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d; s->h[4] += e; s->h[5] += f; s->h[6] += g; s->h[7] += h;
}

static void shaInit(IoiotSha256* s) {
  static const uint32_t iv[8] = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 };
  memcpy(s->h, iv, sizeof(iv)); s->len = 0; s->n = 0;
}

static void shaUpdate(IoiotSha256* s, const void* data, size_t len) {
  const uint8_t* d = (const uint8_t*)data;
  while (len--) {
    s->buf[s->n++] = *d++; s->len++;
    if (s->n == 64) { shaBlock(s, s->buf); s->n = 0; }
  }
}

static void shaFinal(IoiotSha256* s, uint8_t out[32]) {
  uint64_t bits = s->len * 8;
  uint8_t b = 0x80; shaUpdate(s, &b, 1);
  b = 0; while (s->n != 56) shaUpdate(s, &b, 1);
  for (int i = 7; i >= 0; i--) { b = (uint8_t)(bits >> (i * 8)); shaUpdate(s, &b, 1); }
  for (int i = 0; i < 8; i++) {
    out[i * 4] = s->h[i] >> 24; out[i * 4 + 1] = s->h[i] >> 16; out[i * 4 + 2] = s->h[i] >> 8; out[i * 4 + 3] = s->h[i];
  }
}

// out = hex(HMAC-SHA256(AUTH_TOKEN, "<kind>|<session>|<seq>|<json>"))
static void ioiotHmac(const char* kind, const char* session, const char* seq, const char* json, char out[65]) {
  uint8_t key[64] = { 0 }, pad[64], inner[32], mac[32];
  memcpy(key, AUTH_TOKEN, strlen(AUTH_TOKEN));  // token is shorter than 64 bytes
  IoiotSha256 s;
  for (int i = 0; i < 64; i++) pad[i] = key[i] ^ 0x36;
  shaInit(&s); shaUpdate(&s, pad, 64);
  shaUpdate(&s, kind, strlen(kind)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, session, strlen(session)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, seq, strlen(seq)); shaUpdate(&s, "|", 1);
  shaUpdate(&s, json, strlen(json));
  shaFinal(&s, inner);
  for (int i = 0; i < 64; i++) pad[i] = key[i] ^ 0x5c;
  shaInit(&s); shaUpdate(&s, pad, 64); shaUpdate(&s, inner, 32);
  shaFinal(&s, mac);
  static const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 32; i++) { out[i * 2] = hex[mac[i] >> 4]; out[i * 2 + 1] = hex[mac[i] & 15]; }
  out[64] = 0;
}

static void ioiotU64ToStr(unsigned long long v, char out[21]) {
  char tmp[21]; int n = 0;
  do { tmp[n++] = '0' + (v % 10); v /= 10; } while (v);
  for (int i = 0; i < n; i++) out[i] = tmp[n - 1 - i];
  out[n] = 0;
}

static unsigned long long ioiotStrToU64(const char* s) {
  unsigned long long v = 0;
  for (; *s >= '0' && *s <= '9'; s++) v = v * 10 + (*s - '0');
  return v;
}

void ioiotNewSession() {
  static const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 16; i += 8) {
#if defined(ESP32)
    uint32_t r = esp_random();
#else
    uint32_t r = RANDOM_REG32;
#endif
    for (int j = 0; j < 8; j++) { IOIOT_SESSION[i + j] = hex[r & 15]; r >>= 4; }
  }
  IOIOT_SESSION[16] = 0;
  ioiotLastCmdSeq = 0;
  ioiotSendSeq = 0;
}

// Builds "<hmac>|<session>|<seq>|<json>" into out. Returns false if it doesn't fit.
bool ioiotSignInto(const char* kind, unsigned long long seq, const char* json, char* out, size_t outSize) {
  char seqStr[21], mac[65];
  ioiotU64ToStr(seq, seqStr);
  ioiotHmac(kind, IOIOT_SESSION, seqStr, json, mac);
  int n = snprintf(out, outSize, "%s|%s|%s|%s", mac, IOIOT_SESSION, seqStr, json);
  return n > 0 && (size_t)n < outSize;
}

bool ioiotPublish(PubSubClient& client, const char* topic, const char* kind, const char* json, bool retain) {
  static char out[1200];
  if (!ioiotSignInto(kind, ++ioiotSendSeq, json, out, sizeof(out))) return false;
  return client.publish(topic, out, retain);
}

// Verifies an incoming "<hmac>|<session>|<seq>|<json>" message in place.
// Returns the JSON part, or nullptr if it is forged, replayed or from an old session.
const char* ioiotVerify(const char* kind, char* msg) {
  char* p1 = strchr(msg, '|');
  if (!p1 || p1 - msg != 64) return nullptr;
  char* p2 = strchr(p1 + 1, '|'); if (!p2) return nullptr;
  char* p3 = strchr(p2 + 1, '|'); if (!p3) return nullptr;
  *p1 = 0; *p2 = 0; *p3 = 0;
  const char* session = p1 + 1;
  const char* seqStr = p2 + 1;
  const char* json = p3 + 1;
  if (strcmp(session, IOIOT_SESSION) != 0) return nullptr;
  unsigned long long seq = ioiotStrToU64(seqStr);
  if (seq <= ioiotLastCmdSeq) return nullptr;
  char mac[65];
  ioiotHmac(kind, session, seqStr, json, mac);
  uint8_t diff = 0;
  for (int i = 0; i < 64; i++) diff |= mac[i] ^ msg[i];
  if (diff) return nullptr;
  ioiotLastCmdSeq = seq;
  return json;
}`;
