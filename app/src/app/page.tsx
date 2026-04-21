import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { isAuthenticated, userId } = await auth();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-4xl flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-black/45">
          App Router + Clerk
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-black">
          Authentication is wired into this Next.js app.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-black/70">
          Use the navigation to create your first account in keyless mode, then
          come back here to confirm the session is available in server
          components.
        </p>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-5">
          <p className="text-sm text-black/60">
            Status: {isAuthenticated ? "signed in" : "signed out"}
          </p>
          <p className="mt-2 font-mono text-sm text-black/80">
            {userId ?? "No active Clerk user session"}
          </p>
        </div>
      </div>
    </main>
  );
}
