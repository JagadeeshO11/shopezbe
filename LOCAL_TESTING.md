# ShopEZ backend: local testing

## Prerequisites
- Node.js 18 or newer
- A MongoDB database reachable from this computer
- A Resend account with a sender/domain configured for email OTP delivery
- A Google OAuth Web client ID for Google sign-in (optional while testing email OTP)

## Start locally
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Fill in `MONGODB_URI` and use database name `shopez` unless you intentionally use another database.
4. Generate a long random `JWT_SECRET`.
5. Set `RESEND_API_KEY` and `EMAIL_FROM` to enable email OTP. Without them, OTP requests return a clear configuration error and no code is logged.
6. Set `GOOGLE_CLIENT_ID` to the Web OAuth client ID to enable Google sign-in. The frontend client ID must match.
7. Start the API: `npm run dev`.

Health check: `http://localhost:5000/api/health`.

## Auth endpoints
- `POST /api/v1/auth/otp/request` with `{ "email": "you@example.com" }`
- `POST /api/v1/auth/otp/resend` with the same body
- `POST /api/v1/auth/otp/verify` with `{ "email": "...", "code": "123456", "name": "Your Name", "phone": "" }`
- `POST /api/v1/auth/google` with `{ "credential": "<Google ID token>" }`

OTP codes are stored as hashes, expire after 10 minutes, allow at most five verification attempts, and have a resend cooldown/limit. Existing password accounts can still use the legacy password endpoint while the new UI uses OTP.

## Checkout validation
`POST /api/v1/orders` requires `shippingAddress.phone` or `shippingAddress.mobile` to contain a valid Indian mobile number. Client-side validation is not trusted on its own.

## Safety
- Never commit `.env`, API keys, OAuth secrets, or MongoDB credentials.
- Keep `.env.example` populated only with placeholders.
- No production deployment is needed for local testing.
