import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

let configured = false;

export function configureApi(getToken: () => Promise<string | null>): void {
  if (!configured) {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const baseUrl = domain ? `https://${domain}` : "";
    setBaseUrl(baseUrl);
    configured = true;
  }
  setAuthTokenGetter(getToken);
}
