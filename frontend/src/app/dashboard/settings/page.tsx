import { FiLayout, FiShield, FiSliders, FiZap } from "react-icons/fi";

const settingsCards = [
  {
    title: "AI Sensitivity",
    description: "Tune how aggressively suspicious behaviors are flagged across active exam sessions.",
    icon: <FiSliders className="h-5 w-5" />
  },
  {
    title: "Layout Presets",
    description: "Save workspace configurations for focused review, wide monitoring, or quick incident response.",
    icon: <FiLayout className="h-5 w-5" />
  },
  {
    title: "Alert Policy",
    description: "Control how incidents escalate, surface, and stay visible for supervisors during live exams.",
    icon: <FiShield className="h-5 w-5" />
  },
  {
    title: "Automation",
    description: "Prepare follow-up actions for report generation, review queues, and operational handoffs.",
    icon: <FiZap className="h-5 w-5" />
  }
];

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <article className="dashboard-panel rounded-[28px] px-6 py-5">
        <p className="dashboard-kicker">Workspace Controls</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Settings
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          This area is ready for future controls around monitoring policies, layout presets,
          and workflow automation. For now, the page reflects the final dashboard visual system.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {settingsCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[24px] border border-slate-200 bg-white px-5 py-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                {card.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
