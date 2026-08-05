import Image from "next/image";
import Link from "next/link";

interface Props {
  tone?: "light" | "dark";
}

const Logo = ({ tone = "dark" }: Props) => {
  const textClass = tone === "light" ? "text-white" : "text-ink";

  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group">
      <Image src="/shelvr-mark.svg" alt="" width={32} height={32} aria-hidden />
      <span className={`text-[1.15rem] font-semibold tracking-tight ${textClass}`}>
        Shelvr
      </span>
    </Link>
  );
};

export default Logo;
