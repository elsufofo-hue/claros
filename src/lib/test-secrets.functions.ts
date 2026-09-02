import { createServerFn } from "@tanstack/react-start";

export const testSecrets = createServerFn({ method: "POST" })
  .handler(async () => {
    return {
      PROPIX_CLIENT_ID: Boolean(process.env["PROPIX_CLIENT_ID"]),
      PROPIX_CLIENT_SECRET: Boolean(process.env["PROPIX_CLIENT_SECRET"]),
      CASHINPAY_SECRET_KEY: Boolean(process.env["CASHINPAY_SECRET_KEY"]),
    };
  });
