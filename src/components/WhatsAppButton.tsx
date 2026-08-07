import { MessageCircle } from "lucide-react";
import { waLink } from "@/lib/whatsapp";

// Click-to-chat: opens a pre-filled WhatsApp conversation, zero setup,
// works the moment a phone number exists. The one deliberate spot of
// literal WhatsApp green in the app — kept small and iconography-only so
// it stays instantly recognisable without breaking the navy/gold palette.
export function WhatsAppButton({
  phone,
  message,
  variant = "button",
  className = "",
}: {
  phone: string;
  message?: string;
  variant?: "button" | "icon";
  className?: string;
}) {
  if (!phone) return null;
  const href = waLink(phone, message);

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title="Message on WhatsApp"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[#25D366] transition-colors hover:bg-[#25D366]/10 ${className}`}
      >
        <MessageCircle size={16} />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`ir-btn border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 ${className}`}
    >
      <MessageCircle size={14} /> WhatsApp
    </a>
  );
}
