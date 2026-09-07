interface Props {
  eyebrow: string;
  title: string;
  lead: string;
  centered?: boolean;
}

/** The shared eyebrow / heading / lead block above every marketing section. */
export default function SectionHead({ eyebrow, title, lead, centered = false }: Props) {
  return (
    <div className={`max-w-[60ch] ${centered ? 'mx-auto text-center' : ''}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2.5 text-[clamp(1.5rem,3.1vw,2.05rem)] font-extrabold leading-tight tracking-[-0.03em]">
        {title}
      </h2>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-mist">{lead}</p>
    </div>
  );
}
