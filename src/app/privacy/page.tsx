import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Privacy Policy — Imperium Realty" };

// Public, no login — same reasoning as /share/[slug]: this needs to be
// reachable by Meta's App Review process and by anyone messaging the
// connected WhatsApp number, neither of whom has an account here.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-ir-ivory px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex justify-center">
          <Logo variant="full" tone="light" size="md" />
        </div>

        <div className="ir-card p-6 sm:p-10">
          <div className="mb-2 ir-label">Legal</div>
          <h1 className="ir-editorial mb-1 text-[1.9rem] leading-[1.15] text-ir-navy sm:text-[2.1rem]">Privacy Policy</h1>
          <p className="mb-8 text-sm text-black/45">Last updated: 26 August 2026</p>

          <div className="space-y-7 text-sm leading-relaxed text-black/75">
            <Section title="Who this policy covers">
              <p>
                Imperium Realty (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a real estate agency operating in Sri Lanka. This policy explains how we
                collect and use personal data through our internal operating system (this website), our WhatsApp Business number, and the
                Meta/Facebook advertising we run to reach prospective clients. It applies to three groups of people: our own staff who use
                this system to do their jobs, property owners/buyers/tenants/brokers whose details our staff record as clients, and anyone
                who messages our WhatsApp Business number, whether or not they become a client.
              </p>
            </Section>

            <Section title="What we collect">
              <p>Depending on how you interact with us, we may collect:</p>
              <List
                items={[
                  "Contact details you or our staff provide: name, phone number, WhatsApp number, email address, and general location (city/district).",
                  "Property information: details of a property you own, are selling, buying, or renting, including photographs you send us.",
                  "The content of WhatsApp conversations with our business number, including messages sent to our automated assistant and any photos you send it.",
                  "Enquiry and requirement details: what kind of property you're looking for, budget, timeline, and similar context you share with us.",
                  "Records of our interactions with you: calls, viewings, offers, and notes our staff keep as part of managing the relationship.",
                  "For staff accounts only: login credentials, role, and an activity log of actions taken in the system.",
                ]}
              />
            </Section>

            <Section title="Our WhatsApp AI assistant">
              <p>
                Messages sent to our WhatsApp Business number may be handled by an automated assistant before a staff member joins the
                conversation. It asks qualifying questions (for example, whether you&apos;re looking to buy or rent, your budget, or details of a
                property you&apos;d like to list), and the content of that conversation is processed by a third-party AI service (Groq) to
                understand your message and generate a reply. We do not use this to make any automated decision that has a legal or similarly
                significant effect on you — its role is limited to qualifying enquiries and drafting a reply, and a member of staff reviews
                and takes over the conversation at any point you ask to speak to a person, or once we have enough information to act on your
                enquiry.
              </p>
            </Section>

            <Section title="How we use it">
              <List
                items={[
                  "To respond to your enquiry and provide the service you contacted us for (finding, listing, buying, selling, or renting a property).",
                  "To match your requirements against our current property listings, and to share relevant listings with you.",
                  "To keep an internal record of our dealings with you, so any staff member assisting you has the context they need.",
                  "To attribute enquiries that come from a Facebook or Instagram advertisement back to that campaign, so we can understand which advertising is effective.",
                  "To communicate with you by WhatsApp, phone, or email about your enquiry, listing, or an active transaction.",
                ]}
              />
              <p>We do not sell personal data, and we do not use it for advertising purposes beyond understanding which of our own campaigns reached you.</p>
            </Section>

            <Section title="Who we share it with">
              <p>We use a small number of service providers to run this system. Each only receives the data needed to perform its function:</p>
              <List
                items={[
                  "Meta / WhatsApp Business Platform — to send and receive WhatsApp messages.",
                  "Groq — to process the text of WhatsApp conversations and generate replies from our automated assistant.",
                  "Google (Drive) — to store property photographs and documents.",
                  "Vercel and Supabase — to host this system and store its database.",
                ]}
              />
              <p>
                We don&apos;t share your information with any other third party, except where required by law, or with your consent (for
                example, passing your details to a co-broking partner when arranging a viewing you&apos;ve asked for).
              </p>
            </Section>

            <Section title="How long we keep it">
              <p>
                We retain client and property records for as long as they&apos;re relevant to an active or reasonably foreseeable transaction,
                and afterward for as long as needed to meet our own record-keeping and legal obligations. WhatsApp conversation history is
                kept as part of that same client record. You can ask us to delete your data at any time — see below.
              </p>
            </Section>

            <Section title="Your choices">
              <List
                items={[
                  "You can ask what personal data we hold about you, and ask us to correct anything that's inaccurate.",
                  "You can ask us to delete your data, subject to any records we're required to keep by law (for example, documentation related to a completed sale).",
                  "You can stop an automated conversation and ask to speak to a staff member at any time, simply by asking.",
                  "You can opt out of further WhatsApp contact from us at any time — just tell us, or block/report our number.",
                ]}
              />
              <p>
                To exercise any of these, contact us using the details below. We&apos;ll act on your request as soon as reasonably possible.
              </p>
            </Section>

            <Section title="Data deletion">
              <p>
                To request deletion of your personal data, message us on WhatsApp at <strong>+94 77 535 3774</strong> or email{" "}
                <a href="mailto:info@imperium.lk" className="text-ir-gold-dark hover:underline">info@imperium.lk</a> and
                ask us to delete your record. Please include your name and phone number so we can locate it. We&apos;ll confirm once it&apos;s
                done, and will let you know if any part of it must be retained under a legal or regulatory obligation, and why.
              </p>
            </Section>

            <Section title="Security">
              <p>
                Access to this system is restricted to authorised staff, each with their own login, and access to sensitive fields (such as
                phone numbers) is limited by role. Data is stored with our hosting and database providers using industry-standard
                encryption in transit and at rest.
              </p>
            </Section>

            <Section title="Changes to this policy">
              <p>
                We may update this policy as our systems or practices change. The date at the top of this page reflects the most recent
                update. Material changes affecting how we handle your data will be reflected here.
              </p>
            </Section>

            <Section title="Contact us">
              <p>
                Imperium Realty<br />
                WhatsApp: +94 77 535 3774<br />
                Email: <a href="mailto:info@imperium.lk" className="text-ir-gold-dark hover:underline">info@imperium.lk</a>
              </p>
            </Section>
          </div>

          <div className="mt-10 border-t border-black/8 pt-5 text-center">
            <Link href="/login" className="text-xs text-black/40 hover:text-ir-gold-dark">← Back to Imperium Realty</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[0.95rem] font-semibold text-ir-navy">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
