import { Lock, MapPin, Ruler, BedDouble, Bath, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { formatCurrency, titleCase } from "@/lib/format";
import { primarySize, relevantAskingPrice, priceUnit, thumbUrl } from "@/lib/property";
import { unlockSharePage, isShareUnlocked } from "./actions";

// Public, no login — this is the whole point of a share page: something
// safe to hand to a client, buyer or tenant who has no account here. Kept
// outside the (platform) route group for exactly that reason, same as
// /api/drive-media/[fileId] is public for property photos.
export default async function SharePagePublic({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ wrong?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;

  const sharePage = await prisma.sharePage.findUnique({
    where: { slug },
    include: {
      property: {
        include: {
          media: { orderBy: { isCover: "desc" } },
          owner: true,
          assignedAgent: true,
        },
      },
    },
  });

  if (!sharePage) return <ShareShell><NoticeCard title="Link not found" description="This share link doesn't exist, or has been removed." /></ShareShell>;

  const expired = sharePage.expiresAt ? sharePage.expiresAt < new Date() : false;
  if (expired) return <ShareShell><NoticeCard title="This link has expired" description="Ask your agent for a fresh link." /></ShareShell>;

  if (sharePage.password) {
    const unlocked = await isShareUnlocked(slug);
    if (!unlocked) {
      return (
        <ShareShell>
          <div className="ir-card mx-auto max-w-sm p-6 text-center">
            <Lock size={22} className="mx-auto mb-3 text-ir-gold-dark" />
            <h1 className="mb-1 text-lg font-semibold text-ir-navy">Password protected</h1>
            <p className="mb-4 text-sm text-black/50">Enter the password your agent gave you.</p>
            <form action={unlockSharePage.bind(null, slug)} className="flex flex-col gap-2.5">
              <input name="password" type="password" required autoFocus className="ir-input text-center" placeholder="Password" />
              {sp.wrong && <p className="text-xs text-[color:var(--color-brick)]">That wasn&apos;t right — try again.</p>}
              <button type="submit" className="ir-btn ir-btn-gold justify-center">Unlock</button>
            </form>
          </div>
        </ShareShell>
      );
    }
  }

  // Fire-and-forget — a view counter shouldn't block or fail the page render.
  prisma.sharePage.update({ where: { id: sharePage.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);

  const p = sharePage.property;
  const cover = p.media[0]?.url;
  const gallery = p.media.slice(1, 7);
  const price = relevantAskingPrice(p);
  const size = primarySize(p);
  const features = (p.featuresJson && typeof p.featuresJson === "object" ? Object.keys(p.featuresJson as object) : []) as string[];
  const location = sharePage.hideExactLocation ? [p.city, p.district].filter(Boolean).join(", ") : [p.address, p.city, p.district].filter(Boolean).join(", ");

  return (
    <ShareShell>
      <div className="mx-auto max-w-3xl">
        {sharePage.watermarkClientName && (
          <p className="mb-3 text-center text-xs uppercase tracking-wide text-black/40">Prepared exclusively for {sharePage.watermarkClientName}</p>
        )}
        <div className="ir-card overflow-hidden">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- Drive-proxied bytes, not a static import
            <img src={thumbUrl(cover, 1200)} alt={p.title} className="h-72 w-full object-cover sm:h-96" />
          ) : (
            <div className="flex h-56 items-center justify-center bg-ir-navy text-white/20">No photo yet</div>
          )}

          <div className="p-6 sm:p-8">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="ir-badge bg-ir-navy/10 text-ir-navy">{titleCase(p.subtype)}</span>
              <span className="ir-badge bg-ir-gold/15 text-ir-gold-dark">{titleCase(p.transactionType)}</span>
            </div>
            <h1 className="ir-figure mb-1 text-2xl text-ir-navy sm:text-3xl">{p.title}</h1>
            {location && (
              <p className="mb-4 flex items-center gap-1.5 text-sm text-black/50">
                <MapPin size={14} /> {location}
              </p>
            )}

            <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-black/8 py-4">
              <div className="ir-figure text-2xl text-ir-navy">
                {formatCurrency(price, p.currency)}
                <span className="ml-1 font-sans text-sm font-normal text-black/40">{priceUnit(p)}</span>
              </div>
              {size && (
                <span className="flex items-center gap-1.5 text-sm text-black/60">
                  <Ruler size={14} /> {size}
                </span>
              )}
              {p.bedrooms ? (
                <span className="flex items-center gap-1.5 text-sm text-black/60">
                  <BedDouble size={14} /> {p.bedrooms} bed
                </span>
              ) : null}
              {p.bathrooms ? (
                <span className="flex items-center gap-1.5 text-sm text-black/60">
                  <Bath size={14} /> {p.bathrooms} bath
                </span>
              ) : null}
            </div>

            {p.description && <p className="mb-5 text-sm leading-relaxed text-black/70">{p.description}</p>}

            {features.length > 0 && (
              <div className="mb-5">
                <div className="ir-label mb-2">Features</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {features.map((f) => (
                    <span key={f} className="flex items-center gap-1.5 text-sm text-black/60">
                      <CheckCircle2 size={13} className="shrink-0 text-[color:var(--color-forest)]" /> {titleCase(f)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {gallery.length > 0 && (
              <div className="mb-5 grid grid-cols-3 gap-2">
                {gallery.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element -- Drive-proxied bytes, not a static import
                  <img key={m.id} src={thumbUrl(m.url, 300)} alt="" className="h-24 w-full rounded object-cover" />
                ))}
              </div>
            )}

            <div className="rounded border border-black/8 bg-ir-ivory p-4">
              <div className="ir-label mb-1">Enquiries</div>
              {!sharePage.hideOwnerContact && p.owner && (
                <p className="text-sm text-ir-navy">{p.owner.name} · {p.owner.phone}</p>
              )}
              {p.assignedAgent && (
                <p className="text-sm text-ir-navy">{p.assignedAgent.name}, Imperium Realty {p.assignedAgent.phone ? `· ${p.assignedAgent.phone}` : ""}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </ShareShell>
  );
}

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ir-ivory px-4 py-8 sm:py-14">
      <div className="mb-8 flex justify-center">
        <Logo variant="full" tone="light" size="md" />
      </div>
      {children}
    </div>
  );
}

function NoticeCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="ir-card mx-auto max-w-sm p-8 text-center">
      <h1 className="mb-1 text-lg font-semibold text-ir-navy">{title}</h1>
      <p className="text-sm text-black/50">{description}</p>
    </div>
  );
}
