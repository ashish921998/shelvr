import { hideLogBoxForE2E } from "@/lib/e2e-log-box";

// Decided once per process, before anything can log an error.
hideLogBoxForE2E();
