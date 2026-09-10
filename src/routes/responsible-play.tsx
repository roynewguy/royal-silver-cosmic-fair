import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/shell";

export const Route = createFileRoute("/responsible-play")({
  head: () => ({
    meta: [
      { title: "Responsible play — BoatBoyz" },
      {
        name: "description",
        content: "BoatBoyz is 21+ entertainment. Never bet more than you can afford to lose. Help: 1-800-GAMBLER.",
      },
    ],
  }),
  component: ResponsiblePlayPage,
});

function ResponsiblePlayPage() {
  return (
    <SiteShell>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Play rules</p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">Responsible play</h1>
      <div className="mt-8 max-w-2xl space-y-6 text-base leading-relaxed text-muted">
        <p>BoatBoyz picks are opinions about sports markets. They are not a way to make money, financial advice, or a guarantee.</p>
        <ul className="space-y-3 text-fg">
          <li>You must be 21 or older and in a jurisdiction where sports betting is legal.</li>
          <li>Never stake money you cannot afford to lose.</li>
          <li>Do not chase losses. A losing day is part of the public record.</li>
          <li>Take breaks. If betting stops being entertainment, stop.</li>
          <li>Zero official locks is a valid day. We will not invent plays to fill a card.</li>
        </ul>
        <p>
          If you or someone you know has a gambling problem, call{" "}
          <a className="text-accent underline-offset-2 hover:underline" href="https://www.ncpgambling.org/" rel="noreferrer">
            1-800-GAMBLER
          </a>{" "}
          or visit the National Council on Problem Gambling.
        </p>
      </div>
    </SiteShell>
  );
}
