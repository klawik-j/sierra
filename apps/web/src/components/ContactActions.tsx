import { Globe, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n";
import { buttonClass, cx, iconButtonClass } from "./ui";

/** Tap-to-act links: the phone dials, the mail app opens, the address starts navigation. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const smsHref = (phone: string) => `sms:${phone.replace(/[^\d+]/g, "")}`;
export const mailHref = (email: string, subject?: string) => `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
export const mapsHref = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
export const webHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

interface Reachable {
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
}

/** Large labelled buttons — the primary actions on a contact card. */
export function ContactButtons({ who, subject, className }: { who: Reachable; subject?: string; className?: string }) {
  const t = useT();
  const items: { href: string; label: string; icon: ReactNode; primary?: boolean; external?: boolean }[] = [];
  if (who.phone) {
    items.push({ href: telHref(who.phone), label: t("contact.call"), icon: <Phone size={18} aria-hidden />, primary: true });
    items.push({ href: smsHref(who.phone), label: t("contact.sms"), icon: <MessageSquare size={18} aria-hidden /> });
  }
  if (who.email) items.push({ href: mailHref(who.email, subject), label: t("contact.email"), icon: <Mail size={18} aria-hidden /> });
  if (who.address) items.push({ href: mapsHref(who.address), label: t("contact.navigate"), icon: <MapPin size={18} aria-hidden />, external: true });
  if (who.website) items.push({ href: webHref(who.website), label: t("contact.website"), icon: <Globe size={18} aria-hidden />, external: true });
  if (!items.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {items.map((i) => (
        <a key={i.label} href={i.href} {...(i.external ? { target: "_blank", rel: "noreferrer" } : {})} className={buttonClass({ variant: i.primary ? "soft" : "secondary", size: "sm" })}>
          {i.icon}
          {i.label}
        </a>
      ))}
    </div>
  );
}

/** Compact icon-only actions for rows (team list, ticket people). */
export function ContactIcons({ who, subject, name }: { who: Reachable; subject?: string; name: string }) {
  const t = useT();
  return (
    <span className="flex shrink-0 items-center">
      {who.phone && (
        <a href={telHref(who.phone)} className={iconButtonClass("text-primary-ink")} aria-label={`${t("contact.call")}: ${name}`} title={`${t("contact.call")} ${who.phone}`}>
          <Phone size={19} aria-hidden />
        </a>
      )}
      {who.phone && (
        <a href={smsHref(who.phone)} className={iconButtonClass()} aria-label={`${t("contact.sms")}: ${name}`} title={t("contact.sms")}>
          <MessageSquare size={19} aria-hidden />
        </a>
      )}
      {who.email && (
        <a href={mailHref(who.email, subject)} className={iconButtonClass()} aria-label={`${t("contact.email")}: ${name}`} title={who.email}>
          <Mail size={19} aria-hidden />
        </a>
      )}
      {who.address && (
        <a href={mapsHref(who.address)} target="_blank" rel="noreferrer" className={iconButtonClass()} aria-label={`${t("contact.navigate")}: ${name}`} title={who.address}>
          <MapPin size={19} aria-hidden />
        </a>
      )}
    </span>
  );
}

const inlineClass = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-tag font-semibold text-primary-ink underline decoration-primary/30 underline-offset-2 hover:decoration-primary";

/** Inline value that acts when tapped: phone number, e-mail address or postal address. */
export function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={telHref(phone)} className={cx(inlineClass, "tabular-nums")}>
      <Phone size={15} aria-hidden className="shrink-0" />
      {phone}
    </a>
  );
}

export function MailLink({ email, subject }: { email: string; subject?: string }) {
  return (
    <a href={mailHref(email, subject)} className={inlineClass}>
      <Mail size={15} aria-hidden className="shrink-0" />
      <span className="truncate">{email}</span>
    </a>
  );
}

export function MapLink({ address }: { address: string }) {
  return (
    <a href={mapsHref(address)} target="_blank" rel="noreferrer" className={inlineClass}>
      <MapPin size={15} aria-hidden className="shrink-0" />
      <span className="min-w-0">{address}</span>
    </a>
  );
}
