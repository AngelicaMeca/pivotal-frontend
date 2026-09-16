export default function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  tone = "light",
}: {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
  // glass: on a translucent dark panel over moving imagery, where light
  // shapes can pass behind the copy; stronger than dark to hold contrast
  tone?: "light" | "dark" | "glass";
}) {
  const styles = {
    light: {
      index: "text-olive",
      eyebrow: "text-olive",
      rule: "bg-olive",
      title: "text-cocoa",
      // Body copy: olive on cream stays under 3:1
      description: "text-cocoa/80",
    },
    dark: {
      index: "text-cream/50",
      eyebrow: "text-olive-soft",
      rule: "bg-olive-soft",
      title: "text-cream",
      description: "text-cream/70",
    },
    glass: {
      index: "text-cream/80",
      eyebrow: "text-cream/80",
      rule: "bg-cream/60",
      title: "text-cream",
      description: "text-cream/90",
    },
  }[tone];

  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-6 md:gap-x-8">
      <div className="col-span-12 md:col-span-2">
        <span className={`font-mono text-sm tnum ${styles.index}`}>{index}</span>
      </div>
      <div className="col-span-12 md:col-span-10">
        <div
          className={`mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] ${styles.eyebrow}`}
        >
          <span className={`h-px w-8 ${styles.rule}`} />
          {eyebrow}
        </div>
        <h2
          className={`max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl ${styles.title}`}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={`mt-6 max-w-2xl text-base leading-relaxed sm:text-lg ${styles.description}`}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
