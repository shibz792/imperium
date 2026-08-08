import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ShieldCheck, ExternalLink, Trash2, Star, CheckCircle2, Circle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeConfidential, isAdmin } from "@/lib/auth";
import { Badge, Field, PageHeader, SectionCard, Tabs, EmptyState } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { CopyableMessage } from "@/components/CopyableMessage";
import { LISTING_STATUS_TONE, LEGAL_STATUS_TONE, DEAL_STAGE_TONE, VIEWING_STATUS_TONE, OFFER_STATUS_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, formatDateTime, titleCase, daysAgo } from "@/lib/format";
import { completenessScore, isStale, primarySize, relevantAskingPrice, clientPrice, priceUnit, whatsAppMessage } from "@/lib/property";
import { scoreMatch, explainMatch } from "@/lib/match";
import { verifyProperty, changeListingStatus, setCoverPhoto, deletePropertyMedia, importPhotosFromDrive } from "../actions";
import { PropertyPhotoUploader } from "../PropertyPhotoUploader";
import { GoogleDriveBrowser } from "@/components/GoogleDriveBrowser";
import { createNote, deleteNote } from "../../notes/actions";
import { createTask, setTaskStatus, deleteTask } from "../../tasks/actions";

const CAN_DELETE_ANY_NOTE = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "media", label: "Media" },
  { key: "owner", label: "Owner" },
  { key: "documents", label: "Documents" },
  { key: "matches", label: "Matches" },
  { key: "inquiries", label: "Inquiries" },
  { key: "viewings", label: "Viewings" },
  { key: "offers", label: "Offers" },
  { key: "marketing", label: "Marketing" },
  { key: "tasks", label: "Tasks" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
];

export default async function PropertyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const user = await requireUser();
  const showConfidential = canSeeConfidential(user);

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      owner: true,
      assignedAgent: true,
      collaborators: true,
      media: { orderBy: [{ isCover: "desc" }, { createdAt: "asc" }] },
      documents: true,
      marketingAssets: { include: { approvedBy: true }, orderBy: { createdAt: "desc" } },
      sharePages: true,
      activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
      deals: { include: { client: true, requirement: true, assignedAgent: true, offers: true, commission: true, viewings: true } },
      viewings: { include: { contact: true, agent: true }, orderBy: { scheduledAt: "desc" } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!property) notFound();

  const [tasks, activeUsers] = await Promise.all([
    prisma.task.findMany({
      where: { relatedEntityType: "property", relatedEntityId: id },
      include: { assignedTo: true },
      orderBy: { dueAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const completeness = completenessScore(property);
  const stale = isStale(property);
  const basePath = `/properties/${id}`;

  const offers = property.deals.flatMap((d) => d.offers.map((o) => ({ ...o, deal: d })));

  let matches: { requirement: (typeof requirements)[number]; result: NonNullable<ReturnType<typeof scoreMatch>> }[] = [];
  let requirements: Awaited<ReturnType<typeof prisma.requirement.findMany>> = [];
  if (tab === "matches" || tab === "overview") {
    requirements = await prisma.requirement.findMany({
      where: { status: { in: ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING"] } },
      include: { client: true },
    });
    matches = requirements
      .map((r) => {
        const result = scoreMatch(property, r);
        return result ? { requirement: r, result } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.result.score - a.result.score);
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${property.propertyRef} · ${titleCase(property.category)} · ${property.subtype}`}
        title={property.title}
        description={[property.city, property.district].filter(Boolean).join(", ")}
        actions={
          <>
            <Link href={`/properties/${id}/edit`} className="ir-btn ir-btn-ghost">
              <Pencil size={14} /> Edit
            </Link>
            <form action={verifyProperty.bind(null, id)}>
              <button type="submit" className="ir-btn ir-btn-gold">
                <ShieldCheck size={14} /> Verify now
              </button>
            </form>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={(LISTING_STATUS_TONE[property.listingStatus] as never) ?? "gray"}>{titleCase(property.listingStatus)}</Badge>
        <Badge tone={(LEGAL_STATUS_TONE[property.legalVerificationStatus] as never) ?? "gray"}>{titleCase(property.legalVerificationStatus)}</Badge>
        <Badge tone={property.exclusivity === "EXCLUSIVE" ? "gold" : "gray"}>{titleCase(property.exclusivity)}</Badge>
        {stale && <Badge tone="red">Needs reverification</Badge>}
        <span className="ml-auto text-xs text-black/45">
          Completeness: <span className="font-medium text-ir-navy">{completeness.score}%</span> · {completeness.label}
        </span>
        <form action={async (fd: FormData) => { "use server"; await changeListingStatus(id, String(fd.get("status"))); }} className="flex items-center gap-1.5">
          <select name="status" defaultValue={property.listingStatus} className="ir-select !py-1 !text-xs">
            {["DRAFT", "ACTIVE", "UNDER_OFFER", "RESERVED", "SOLD", "RENTED", "WITHDRAWN", "EXPIRED"].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-xs">
            Update status
          </button>
        </form>
      </div>

      <Tabs tabs={TABS} active={tab} basePath={basePath} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard title="Summary" >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Asking price" value={`${formatCurrency(relevantAskingPrice(property), property.currency)}${priceUnit(property)}`} />
              <Field label="Size" value={primarySize(property)} />
              <Field label="Negotiable" value={property.priceNegotiable ? "Yes" : "Fixed"} />
              {showConfidential && property.markupType !== "NONE" && (
                <>
                  <Field label="Client's price" value={`${formatCurrency(clientPrice(property), property.currency)}${priceUnit(property)}`} />
                  <Field label="Markup" value={property.markupType === "PERCENT" ? `${property.markupValue}%` : formatCurrency(property.markupValue, property.currency)} />
                </>
              )}
              <Field label="Road access" value={property.roadAccess} />
              <Field label="Assigned agent" value={property.assignedAgent?.name} />
              <Field label="Source" value={property.source} />
              <Field label="Date received" value={formatDate(property.dateReceived)} />
              <Field label="Last verified" value={property.lastVerifiedDate ? `${formatDate(property.lastVerifiedDate)} (${daysAgo(property.lastVerifiedDate)}d ago)` : "Never"} />
              <Field label="Expiry date" value={formatDate(property.expiryDate)} />
            </div>
            {property.collaborators.length > 0 && (
              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="ir-label mb-1.5">Collaborating agents</div>
                <div className="flex flex-wrap gap-1.5">
                  {property.collaborators.map((c) => (
                    <Link key={c.id} href={`/agents/${c.id}`}>
                      <Badge tone="navy">{c.name}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {property.description && (
              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="ir-label mb-1.5">Description</div>
                <p className="text-sm leading-relaxed text-black/70">{property.description}</p>
              </div>
            )}
            {property.featuresJson && Object.keys(property.featuresJson as object).length > 0 && (
              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="ir-label mb-1.5">Features</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(property.featuresJson as Record<string, unknown>).map(([k, v]) => (
                    <Badge key={k} tone="navy">
                      {titleCase(k)}
                      {typeof v !== "boolean" ? `: ${v}` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Location">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Province" value={property.province} />
              <Field label="District" value={property.district} />
              <Field label="City / suburb" value={property.city} />
              <Field label="Landmark" value={property.landmark} />
              <Field label="Visibility" value={titleCase(property.locationVisibility)} />
              <Field label="Distance to major road" value={property.distanceMajorRoadKm ? `${property.distanceMajorRoadKm} km` : undefined} />
            </div>
            {property.locationVisibility !== "HIDDEN" && (
              <Field label="Address" value={property.address} />
            )}
            {property.lat && property.lng && (
              <a
                href={`https://www.google.com/maps?q=${property.lat},${property.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ir-gold-dark hover:underline"
              >
                Open in Google Maps <ExternalLink size={12} />
              </a>
            )}
          </SectionCard>

          <SectionCard title="Top matches">
            {matches.length === 0 ? (
              <p className="text-xs text-black/40">No qualifying requirements right now.</p>
            ) : (
              <ul className="space-y-3">
                {matches.slice(0, 4).map((m) => (
                  <li key={m.requirement.id} className="border-b border-black/6 pb-3 last:border-0">
                    <Link href={`/requirements/${m.requirement.id}`} className="text-[0.8125rem] font-medium text-ir-navy hover:text-ir-gold-dark">
                      {m.requirement.title}
                    </Link>
                    <p className="mt-0.5 text-[0.7rem] text-black/50">{explainMatch(m.result)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`${basePath}?tab=matches`} className="mt-2 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
              View all matches →
            </Link>
          </SectionCard>

          <div className="lg:col-span-3">
            <CopyableMessage message={whatsAppMessage(property)} />
          </div>
        </div>
      )}

      {tab === "media" && (
        <SectionCard title={`Media (${property.media.length})`}>
          <PropertyPhotoUploader propertyId={id} />
          <div className="-mt-2 mb-4 flex justify-end">
            <GoogleDriveBrowser filter="image" label="Import photos from Drive" onImport={importPhotosFromDrive.bind(null, id)} />
          </div>
          {property.media.length === 0 ? (
            <EmptyState title="No photos yet" description="Drop a few in above — the first one becomes the cover photo shown on cards and listings automatically." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {property.media.map((m) => (
                <div key={m.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.caption ?? ""} className="aspect-video w-full rounded border border-black/8 bg-ir-ivory object-cover" />
                  {m.isCover && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ir-gold px-2 py-0.5 text-[0.65rem] font-semibold text-ir-navy">
                      <Star size={10} className="fill-current" /> Cover
                    </span>
                  )}
                  {/* Always visible, not hover-only — hover reveals don't
                      exist on touch devices, which made these unreachable
                      on phone/tablet. */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 rounded-b bg-gradient-to-t from-black/70 to-transparent p-2 pt-5">
                    {!m.isCover && (
                      <form action={setCoverPhoto.bind(null, id, m.id)}>
                        <button type="submit" title="Set as cover photo" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60">
                          <Star size={13} />
                        </button>
                      </form>
                    )}
                    {isAdmin(user) && (
                      <form action={deletePropertyMedia.bind(null, id, m.id)}>
                        <button type="submit" title="Delete photo" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-[color:var(--color-brick)]">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === "owner" && (
        <SectionCard title="Owner">
          {!property.owner ? (
            <EmptyState title="No owner linked" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Name" value={`${property.owner.name}`} />
              <Field
                label="Phone"
                value={
                  showConfidential ? (
                    <span className="flex items-center gap-1.5">
                      {property.owner.phone}
                      <WhatsAppButton phone={property.owner.phone} variant="icon" />
                    </span>
                  ) : (
                    "Restricted, confidential role required"
                  )
                }
              />
              <Field label="Email" value={showConfidential ? property.owner.email : "Restricted"} />
              <Field label="Reference" value={property.owner.contactRef} />
              <Field label="Authority confirmed" value={property.ownerAuthorityConfirmed ? "Yes" : "No"} />
              {showConfidential && <Field label="Confidential notes" value={property.owner.confidentialNotes} />}
              {showConfidential && <Field label="Owner minimum price" value={formatCurrency(property.ownerMinPrice, property.currency)} />}
            </div>
          )}
          <Link href={property.owner ? `/contacts/${property.owner.id}` : "#"} className="mt-3 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            View full contact record →
          </Link>
        </SectionCard>
      )}

      {tab === "documents" && (
        <SectionCard title="Documents & verification">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([
              ["deedAvailable", "Deed"],
              ["surveyPlanAvailable", "Survey plan"],
              ["cocAvailable", "COC"],
              ["approvedPlanAvailable", "Approved plan"],
              ["municipalDocsAvailable", "Municipal docs"],
              ["taxDocsAvailable", "Tax / rates docs"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded border border-black/8 px-3 py-2 text-xs">
                <span>{label}</span>
                <Badge tone={property[key] ? "green" : "red"}>{property[key] ? "Available" : "Missing"}</Badge>
              </div>
            ))}
          </div>
          {showConfidential && property.internalLegalNotes && (
            <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <span className="font-semibold">Internal legal notes: </span>
              {property.internalLegalNotes}
            </div>
          )}
          {property.documents.length === 0 ? (
            <EmptyState title="No files uploaded yet" action={<Link href="/documents" className="ir-btn ir-btn-ghost">Go to Document Vault</Link>} />
          ) : (
            <ul className="space-y-2">
              {property.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-b border-black/6 pb-2 text-sm last:border-0">
                  <span>{d.name}</span>
                  <Badge tone="gray">{titleCase(d.category)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "matches" && (
        <SectionCard title={`Matching requirements (${matches.length})`}>
          {matches.length === 0 ? (
            <EmptyState title="No qualifying requirements" description="Hard filters (category, budget, size, location) excluded all current requirements." />
          ) : (
            <ul className="divide-y divide-black/6">
              {matches.map((m) => (
                <li key={m.requirement.id} className="flex items-center gap-4 py-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs font-semibold text-ir-gold-dark tabular-nums">
                    {m.result.score}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/requirements/${m.requirement.id}`} className="text-sm font-medium text-ir-navy hover:text-ir-gold-dark">
                      {m.requirement.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-black/50">{explainMatch(m.result)}</p>
                  </div>
                  <Link href={`/matchmaker?requirementId=${m.requirement.id}`} className="shrink-0 text-xs font-medium text-ir-gold-dark hover:underline">
                    Open in Matchmaker
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "inquiries" && (
        <SectionCard title={`Inquiries & deals (${property.deals.length})`}>
          {property.deals.length === 0 ? (
            <EmptyState title="No inquiries yet" />
          ) : (
            <ul className="divide-y divide-black/6">
              {property.deals.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/deals?open=${d.id}`} className="text-sm font-medium text-ir-navy hover:text-ir-gold-dark">
                      {d.client.name}
                    </Link>
                    <div className="text-xs text-black/45">{d.dealRef} · {formatCurrency(d.expectedValue)}</div>
                  </div>
                  <Badge tone={(DEAL_STAGE_TONE[d.stage] as never) ?? "gray"}>{titleCase(d.stage)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "viewings" && (
        <SectionCard title={`Viewings (${property.viewings.length})`}>
          {property.viewings.length === 0 ? (
            <EmptyState title="No viewings scheduled" />
          ) : (
            <ul className="divide-y divide-black/6">
              {property.viewings.map((v) => (
                <li key={v.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ir-navy">
                      {v.contact.name}
                    </span>
                    <Badge tone={(VIEWING_STATUS_TONE[v.status] as never) ?? "gray"}>{titleCase(v.status)}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-black/45">
                    {formatDateTime(v.scheduledAt)} · agent {v.agent?.name ?? "unassigned"}
                  </div>
                  {v.feedbackNotes && <p className="mt-1 text-xs text-black/60">&ldquo;{v.feedbackNotes}&rdquo; {v.feedbackRating && `(${v.feedbackRating}/5)`}</p>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "offers" && (
        <SectionCard title={`Offers (${offers.length})`}>
          {offers.length === 0 ? (
            <EmptyState title="No offers submitted" />
          ) : (
            <ul className="divide-y divide-black/6">
              {offers.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-ir-navy">{formatCurrency(o.amount, property.currency)}</div>
                    <div className="text-xs text-black/45">{o.deal.client.name} · {formatDate(o.createdAt)}</div>
                  </div>
                  <Badge tone={(OFFER_STATUS_TONE[o.status] as never) ?? "gray"}>{titleCase(o.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "marketing" && (
        <SectionCard title="Marketing assets" actions={<Link href={`/marketing-studio?propertyId=${id}`} className="ir-btn ir-btn-gold">Generate content</Link>}>
          {property.marketingAssets.length === 0 ? (
            <EmptyState title="No marketing content generated yet" />
          ) : (
            <ul className="space-y-3">
              {property.marketingAssets.map((a) => (
                <li key={a.id} className="rounded border border-black/8 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge tone="navy">{titleCase(a.contentType)}</Badge>
                    <Badge tone="gray">{a.language}</Badge>
                    <Badge tone={a.approved ? "green" : "amber"}>{a.approved ? "Approved" : "Pending approval"}</Badge>
                  </div>
                  <p className="whitespace-pre-line text-xs text-black/70">{a.content}</p>
                </li>
              ))}
            </ul>
          )}
          {property.sharePages.length > 0 && (
            <div className="mt-4 border-t border-black/6 pt-4">
              <div className="ir-label mb-2">Share pages</div>
              {property.sharePages.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span>/share/{s.slug}</span>
                  <Badge tone="gray">{titleCase(s.visibility)}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === "tasks" && (
        <SectionCard title="Tasks">
          <form action={createTask} className="mb-4 flex flex-wrap items-end gap-2.5">
            <input type="hidden" name="link" value={`property:${id}`} />
            <div className="min-w-[200px] flex-1">
              <label className="ir-label mb-1 block">Task</label>
              <input name="title" required placeholder="Call the owner about…" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Due</label>
              <input name="dueAt" type="datetime-local" required className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Assign to</label>
              <select name="assignedToId" defaultValue={user.id} className="ir-select">
                <option value="">Unassigned</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.id === user.id ? " (you)" : ""}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="ir-btn ir-btn-primary">Add task</button>
          </form>
          {tasks.length === 0 ? (
            <EmptyState title="No tasks on this property yet" />
          ) : (
            <ul className="divide-y divide-black/6">
              {tasks.map((t) => {
                const overdue = t.status !== "DONE" && t.dueAt < new Date();
                const done = t.status === "DONE";
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <form action={setTaskStatus.bind(null, t.id, done ? "OPEN" : "DONE")}>
                      <button type="submit" title={done ? "Mark open" : "Mark done"} className={done ? "text-[color:var(--color-forest)]" : "text-black/25 hover:text-ir-gold-dark"}>
                        {done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${done ? "text-black/40 line-through" : "text-ir-navy"}`}>{t.title}</div>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">
                        <span className={overdue ? "font-medium text-[color:var(--color-brick)]" : ""}>{overdue ? "Overdue" : "Due"} {formatDateTime(t.dueAt)}</span>
                        {t.assignedTo && <> · {t.assignedTo.name}</>}
                      </div>
                    </div>
                    <form action={deleteTask.bind(null, t.id)}>
                      <button type="submit" title="Delete task" className="text-black/25 hover:text-[color:var(--color-brick)]">
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "notes" && (
        <SectionCard title="Notes">
          <form action={createNote} className="mb-4">
            <input type="hidden" name="propertyId" value={id} />
            <textarea name="content" required rows={2} placeholder="Type a note about this property…" className="ir-input" />
            <button type="submit" className="ir-btn ir-btn-primary mt-2">
              Add note
            </button>
          </form>
          {property.notes.length === 0 ? (
            <EmptyState title="No notes on this property yet" />
          ) : (
            <ul className="space-y-3">
              {property.notes.map((n) => (
                <li key={n.id} className="border-b border-black/6 pb-3 last:border-0">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ir-navy">{n.content}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-black/40">
                    <span>
                      {n.author?.name ?? "Unknown"} · {formatDateTime(n.createdAt)}
                    </span>
                    {(n.authorId === user.id || CAN_DELETE_ANY_NOTE.includes(user.role)) && (
                      <form action={deleteNote.bind(null, n.id)}>
                        <button type="submit" title="Delete note" className="text-black/25 hover:text-[color:var(--color-brick)]">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "activity" && (
        <SectionCard title="Activity history">
          {property.activities.length === 0 ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <ul className="space-y-3">
              {property.activities.map((a) => (
                <li key={a.id} className="border-b border-black/6 pb-3 text-sm last:border-0">
                  <div className="text-ir-navy">{a.message}</div>
                  <div className="mt-0.5 text-xs text-black/40">
                    {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
