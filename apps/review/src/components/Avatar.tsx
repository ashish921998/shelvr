const TINTS = [
  "from-violet-400 to-indigo-500",
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-amber-300 to-orange-500",
  "from-pink-400 to-rose-500",
  "from-fuchsia-400 to-purple-500",
];

function initials(name: string) {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export default function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  const box = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ${box} ${TINTS[sum % TINTS.length]}`}
    >
      {initials(name)}
    </span>
  );
}
