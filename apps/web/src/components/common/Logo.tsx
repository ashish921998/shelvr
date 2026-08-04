import Link from "next/link";

interface Props {
  tone?: "light" | "dark";
}

const Logo = ({ tone = "dark" }: Props) => {
  const textClass = tone === "light" ? "text-white" : "text-ink";
  const markClass =
    tone === "light" ? "bg-white text-ink" : "bg-ink text-white";

  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group">
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${markClass} text-sm font-bold tracking-tight`}
        aria-hidden
      >
        S
      </span>
      <span className={`text-[1.15rem] font-semibold tracking-tight ${textClass}`}>
        Shelvr
      </span>
    </Link>
  );
};

export default Logo;
