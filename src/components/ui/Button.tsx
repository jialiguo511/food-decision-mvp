/** The app's three button weights, so every screen uses the same heights and
 *  radii: one `primary` per screen (the next decision), `secondary` for a real
 *  alternative, `quiet` for a text action. Heights are 44px or more so every
 *  one is an easy tap. `buttonClass` is for links styled as buttons. */

type Variant = "primary" | "secondary" | "quiet";

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold transition-[opacity,transform,background-color] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100";

const VARIANTS: Record<Variant, string> = {
  primary: "min-h-13 w-full rounded-2xl bg-accent px-5 text-base text-white shadow-sm shadow-accent/20",
  secondary: "min-h-12 w-full rounded-2xl border border-line bg-card px-5 text-sm text-ink",
  quiet: "min-h-11 rounded-xl px-3 text-sm text-accent",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
}

export default function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
