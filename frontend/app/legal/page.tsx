import type { LegalBundle } from "@/lib/api";

async function loadLegal(): Promise<LegalBundle | null> {
  const base =
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001/api/v1";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/legal`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalBundle;
  } catch {
    return null;
  }
}

export default async function LegalPage() {
  const data = await loadLegal();

  return (
    <main className="h-screen overflow-y-auto bg-emerald-50 p-6 text-emerald-950">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Termos de Uso e Politica de Privacidade</h1>
          {data ? (
            <p className="text-sm text-emerald-800">
              Versoes: termos {data.terms.versionLabel} · privacidade {data.privacy.versionLabel}
            </p>
          ) : (
            <p className="text-sm text-amber-800">
              Nao foi possivel carregar da API. Confirme NEXT_PUBLIC_API_BASE e o servidor Nest.
            </p>
          )}
        </header>

        {data ? (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{data.terms.title}</h2>
              {data.terms.content
                .split(/\n\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, idx) => (
                  <p key={idx} className="text-sm leading-6">
                    {paragraph}
                  </p>
                ))}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{data.privacy.title}</h2>
              {data.privacy.content
                .split(/\n\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, idx) => (
                  <p key={idx} className="text-sm leading-6">
                    {paragraph}
                  </p>
                ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
