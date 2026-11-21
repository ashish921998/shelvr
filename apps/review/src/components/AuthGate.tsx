"use client";

import { useConvexAuth } from "convex/react";
import Header from "./Header";
import SignIn from "./SignIn";
import Spinner from "./Spinner";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!isAuthenticated) return <SignIn />;
  return (
    <>
      <Header />
      {children}
    </>
  );
}
