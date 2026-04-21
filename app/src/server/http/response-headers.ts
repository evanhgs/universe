import "server-only";

// very interest for private data fetch like profile, music source file, orders, messages
// but for public fetch and the need to cache some data i do not recommand this use
export const PRIVATE_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;
