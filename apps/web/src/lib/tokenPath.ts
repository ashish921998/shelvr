const TOKEN_ROUTES = ["i", "p", "l", "m", "passport"];

export function maskTokenPath(pathname: string): string {
  const route = TOKEN_ROUTES.find((name) => pathname.startsWith(`/${name}/`));
  return route === undefined ? pathname : `/${route}/[token]`;
}
