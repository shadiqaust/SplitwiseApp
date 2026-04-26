import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const BASE_URL = domain ? `https://${domain}` : "";

setBaseUrl(BASE_URL);

export function configureApi(getToken: () => Promise<string | null>): void {
  setAuthTokenGetter(getToken);
}
