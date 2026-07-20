import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-10 bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="text-center">
        <div className="text-6xl">🧛</div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">Vampir Köylü</h1>
        <p className="mt-2 text-zinc-400">Gerçek zamanlı moderatör destekli oyun</p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Link
          href="/oyna"
          className="rounded-2xl bg-emerald-600 px-6 py-5 text-center text-lg font-semibold transition hover:bg-emerald-500"
        >
          🎮 Katılımcı olarak gir
        </Link>
        <Link
          href="/moderator"
          className="rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-5 text-center text-lg font-semibold transition hover:bg-zinc-800"
        >
          🕹️ Moderatör paneli
        </Link>
      </div>

      <p className="max-w-md text-center text-sm text-zinc-500">
        Moderatör oyunu kurar ve başlatır; katılımcılar isimleriyle girer ve
        rollerini bu ekrandan görür.
      </p>
    </div>
  );
}
