import Image from "next/image";

type AppPhoneProps = {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export default function AppPhone({
  src,
  alt,
  className = "",
  imageClassName = "",
  priority = false,
}: AppPhoneProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2.6rem] bg-[#17120d] p-2 shadow-[0_32px_72px_rgba(43,36,24,0.22)] ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        width={700}
        height={1467}
        priority={priority}
        sizes="(max-width: 640px) 72vw, 330px"
        className={`h-full w-full rounded-[2.1rem] object-cover ${imageClassName}`}
      />
    </div>
  );
}
