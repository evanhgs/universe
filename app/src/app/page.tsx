export default function Home() {
  return (
    <main className="min-h-screen bg-linear-to-b from-neutral-950 via-neutral-900 to-neutral-950 px-6 py-16 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <div className="flex flex-col gap-4">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/70">
            Universe
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Tailwind CSS est branché sur l&apos;app Next.js.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            La pipeline PostCSS est active, les styles globaux chargent
            Tailwind, et cette page utilise maintenant directement les classes
            utilitaires.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            "Configuration PostCSS via @tailwindcss/postcss",
            "Import global de Tailwind dans globals.css",
            "Composant d&apos;exemple rendu avec des classes utilitaires",
          ].map((item) => (
            <section
              key={item}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <p className="text-sm leading-6 text-white/80">{item}</p>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-white/90"
            href="https://tailwindcss.com/docs/installation/framework-guides/nextjs"
            target="_blank"
            rel="noreferrer"
          >
            Doc Tailwind
          </a>
          <a
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/5"
            href="https://nextjs.org/docs/app/getting-started/css"
            target="_blank"
            rel="noreferrer"
          >
            Doc Next.js
          </a>
        </div>
      </div>
    </main>
  );
}
