/** How the API client reaches the network; the mobile apps ship their own version of this file. */
export const platform = {
  headers: (): Record<string, string> => ({}),
  fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
};
