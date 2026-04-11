/**
 * Vitest-only stand-in for `resend` (see vitest.config.js `resolve.alias`).
 * Records payloads sent via `emails.send` for assertions.
 */
export const resendSendCalls = [];

export class Resend {
  constructor(_apiKey) {
    this.emails = {
      send: (payload) => {
        resendSendCalls.push(payload);
        return Promise.resolve({ data: { id: "mock-email-id" } });
      },
    };
  }
}
