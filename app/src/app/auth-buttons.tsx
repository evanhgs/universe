"use client";

import { SignInButton, UserButton, useClerk } from "@clerk/nextjs";

export function SignedOutActions() {
  const { openSignUp } = useClerk();

  return (
    <>
      <SignInButton />
      <button
        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
        onClick={() => openSignUp()}
        type="button"
      >
        Sign up
      </button>
    </>
  );
}

export function SignedInActions() {
  return <UserButton />;
}
