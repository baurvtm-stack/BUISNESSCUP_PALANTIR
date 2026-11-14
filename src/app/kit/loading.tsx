/** Shown the instant "Build my kit" is pressed, while the server matches gear to the answers. */
export default function KitLoading() {
  return (
    <main className="flex-1 pb-36 pt-6 sm:pb-16 sm:pt-10" aria-busy>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">Your kit</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">Matching gear to your job…</h1>
        <div className="mt-5 h-1.5 max-w-sm overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="indeterminate h-full w-1/2 rounded-full bg-accent" />
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-12" aria-hidden>
          <div className="skeleton col-span-2 h-44 rounded-3xl lg:col-span-5 lg:row-span-2 lg:h-auto" />
          <div className="skeleton col-span-2 h-80 rounded-3xl md:h-48 lg:col-span-7" />
          <div className="skeleton h-28 rounded-3xl lg:col-span-3" />
          <div className="skeleton h-28 rounded-3xl lg:col-span-4" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-hidden>
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-64 rounded-3xl" />
            ))}
          </div>
          <div className="skeleton hidden h-56 rounded-3xl lg:block" />
        </div>
      </div>
    </main>
  );
}
