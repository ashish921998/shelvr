import Image from "next/image";
import Link from "next/link";

interface Props {
  tone?: "light" | "dark";
}

const Logo = ({ tone = "dark" }: Props) => {
  const textClass = tone === "light" ? "text-white" : "text-ink";

  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <Image
        src="/shelvr-mark.svg"
        alt=""
        width={32}
        height={32}
        aria-hidden
        className="h-8 w-8"
      />
      <span className={`font-[family-name:var(--font-display)] text-[1.7rem] tracking-wide ${textClass}`}>
        shelvr
      </span>
    </Link>
  );
};

export default Logo;
