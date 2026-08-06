// Generates the RS256 keypair Convex Auth uses to sign its JWTs.
// Run with `node generateKeys.mjs` from apps/native, then paste the two printed
// lines (JWT_PRIVATE_KEY and JWKS) into the Convex dashboard Environment
// Variables page. From the Convex Auth manual setup docs:
// https://labs.convex.dev/auth/setup/manual
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

process.stdout.write(
  `JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"`,
);
process.stdout.write("\n");
process.stdout.write(`JWKS=${jwks}`);
process.stdout.write("\n");
