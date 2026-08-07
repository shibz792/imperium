import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const ref = (prefix: string, n: number) => `IR-${prefix}-${String(n).padStart(6, "0")}`;

async function main() {
  console.log("Seeding Imperium Realty OS…");

  // -------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("Imperium@123", 10);
  const userDefs = [
    { name: "Anoma Perera", email: "anoma@imperiumrealty.lk", role: "SUPER_ADMIN" as const, phone: "+94771000001" },
    { name: "Ruwan Fernando", email: "ruwan@imperiumrealty.lk", role: "DIRECTOR" as const, phone: "+94771000002" },
    { name: "Dilani Jayasuriya", email: "dilani@imperiumrealty.lk", role: "SALES_MANAGER" as const, phone: "+94771000003" },
    { name: "Kasun Silva", email: "kasun@imperiumrealty.lk", role: "AGENT" as const, phone: "+94771000004" },
    { name: "Nadeesha Wickramasinghe", email: "nadeesha@imperiumrealty.lk", role: "AGENT" as const, phone: "+94771000005" },
    { name: "Tharindu Bandara", email: "tharindu@imperiumrealty.lk", role: "AGENT" as const, phone: "+94771000006" },
    { name: "Hasini Gunawardena", email: "hasini@imperiumrealty.lk", role: "MARKETING" as const, phone: "+94771000007" },
    { name: "Chamara Rajapaksha", email: "chamara@imperiumrealty.lk", role: "LEGAL" as const, phone: "+94771000008" },
    { name: "Ishara De Zoysa", email: "ishara@imperiumrealty.lk", role: "FINANCE" as const, phone: "+94771000009" },
    { name: "Suresh Kumar", email: "suresh@brokerpartner.lk", role: "EXTERNAL_BROKER" as const, phone: "+94771000010" },
  ];
  const users: Record<string, Awaited<ReturnType<typeof prisma.user.create>>> = {};
  for (const u of userDefs) {
    users[u.name] = await prisma.user.create({ data: { ...u, username: u.email.split("@")[0], passwordHash } });
  }
  const agents = [users["Kasun Silva"], users["Nadeesha Wickramasinghe"], users["Tharindu Bandara"]];
  const anyAgent = () => rand(agents);

  // -------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------
  const contactDefs: Array<{
    name: string; companyName?: string; contactType: "OWNER" | "BUYER" | "TENANT" | "BROKER" | "DEVELOPER" | "INVESTOR" | "CORPORATE";
    capacity?: "INDIVIDUAL" | "COMPANY" | "REPRESENTATIVE";
    phone: string; city?: string; district?: string; source?: string;
  }> = [
    { name: "Priyantha Wijesekara", contactType: "OWNER", phone: "+94771234501", city: "Colombo 5", district: "Colombo", source: "Referral" },
    { name: "Manel Rathnayake", contactType: "OWNER", phone: "+94771234502", city: "Nugegoda", district: "Colombo", source: "Referral" },
    { name: "Ahamed Rizwan", contactType: "OWNER", phone: "+94771234503", city: "Wattala", district: "Gampaha", source: "Direct call" },
    { name: "Chandrika Amarasinghe", contactType: "OWNER", phone: "+94771234504", city: "Kandy", district: "Kandy", source: "Website form" },
    { name: "Gamini Ratnayaka", contactType: "OWNER", phone: "+94771234505", city: "Peliyagoda", district: "Gampaha", source: "WhatsApp" },
    { name: "Fathima Nazreen", contactType: "OWNER", phone: "+94771234506", city: "Galle", district: "Galle", source: "Walk-in" },
    { name: "Susantha Kodikara", contactType: "OWNER", phone: "+94771234507", city: "Battaramulla", district: "Colombo", source: "Referral" },
    { name: "Roshan Mendis", contactType: "OWNER", phone: "+94771234508", city: "Negombo", district: "Gampaha", source: "ikman.lk" },
    { name: "Adam Careem", contactType: "TENANT", phone: "+94772345601", city: "Kelaniya", district: "Gampaha", source: "WhatsApp" },
    { name: "Nirmala Perera", contactType: "BUYER", phone: "+94772345602", city: "Nugegoda", district: "Colombo", source: "Facebook" },
    { name: "Dinesh Chandrasiri", contactType: "BUYER", phone: "+94772345603", city: "Rajagiriya", district: "Colombo", source: "Referral" },
    { name: "Samantha Herath", contactType: "TENANT", companyName: "Herath Logistics (Pvt) Ltd", phone: "+94772345604", city: "Peliyagoda", district: "Gampaha", source: "LinkedIn" },
    { name: "Zainab Hassan", contactType: "INVESTOR", phone: "+94772345605", city: "Colombo 3", district: "Colombo", source: "Investor network" },
    { name: "Michael Fernando", contactType: "CORPORATE", companyName: "Global Freight Solutions", phone: "+94772345606", city: "Kelaniya", district: "Gampaha", source: "Email" },
    { name: "Anusha Wijeratne", contactType: "BUYER", phone: "+94772345607", city: "Kandy", district: "Kandy", source: "Referral" },
    { name: "Ruwantha Silva", contactType: "TENANT", phone: "+94772345608", city: "Colombo 7", district: "Colombo", source: "Website form" },
    { name: "Kamal Abeywardena", contactType: "INVESTOR", phone: "+94772345609", city: "Colombo 4", district: "Colombo", source: "Referral" },
    { name: "Vindhya Kumarasinghe", contactType: "BUYER", phone: "+94772345610", city: "Mount Lavinia", district: "Colombo", source: "WhatsApp" },
    { name: "Suresh Kumar", companyName: "Kumar & Associates Realty", contactType: "BROKER", phone: "+94771000010", city: "Colombo 2", district: "Colombo", source: "Partner" },
    { name: "Prasad Gunasekara", companyName: "Gunasekara Brokers", contactType: "BROKER", phone: "+94772345611", city: "Kandy", district: "Kandy", source: "Partner" },
    { name: "Isuru Karunaratne", companyName: "Karu Developments", capacity: "COMPANY", contactType: "DEVELOPER", phone: "+94772345612", city: "Battaramulla", district: "Colombo", source: "Industry event" },
    { name: "Nayana Ekanayake", contactType: "TENANT", phone: "+94772345613", city: "Wattala", district: "Gampaha", source: "WhatsApp" },
    { name: "Faiz Marikkar", companyName: "Marikkar Cold Chain", contactType: "CORPORATE", phone: "+94772345614", city: "Ja-Ela", district: "Gampaha", source: "Referral" },
    { name: "Harshani de Silva", contactType: "BUYER", phone: "+94772345615", city: "Galle", district: "Galle", source: "Instagram" },
    { name: "Naveed Iqbal", contactType: "INVESTOR", phone: "+94772345616", city: "Colombo 6", district: "Colombo", source: "Investor network" },
  ];
  const contacts: Record<string, Awaited<ReturnType<typeof prisma.contact.create>>> = {};
  let cSeq = 1;
  for (const c of contactDefs) {
    const created = await prisma.contact.create({
      data: {
        contactRef: ref("C", cSeq++),
        name: c.name,
        capacity: c.capacity ?? "INDIVIDUAL",
        companyName: c.companyName,
        contactType: c.contactType,
        phone: c.phone,
        whatsapp: c.phone,
        email: `${c.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        city: c.city,
        district: c.district,
        source: c.source,
        assignedAgentId: anyAgent().id,
        notes: `${c.contactType === "OWNER" ? "Property owner" : c.contactType.toLowerCase()} contact, sourced via ${c.source ?? "unknown"}.`,
        confidentialNotes: c.contactType === "OWNER" ? "Prefers WhatsApp contact after 6pm. Do not share direct number with buyers." : null,
      },
    });
    contacts[c.name] = created;
  }

  // -------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------
  type PropDef = Parameters<typeof prisma.property.create>[0]["data"] & { ownerName: string };
  const propertyDefs: Array<Omit<PropDef, "propertyRef" | "assignedAgentId" | "ownerId">> = [
    {
      ownerName: "Priyantha Wijesekara",
      title: "Modern 4BR House with Pool in Colombo 5",
      description: "Beautifully maintained two-storey house on a quiet lane off Havelock Road, walking distance to international schools. Landscaped garden, private pool, and covered parking for 2 vehicles.",
      category: "RESIDENTIAL", subtype: "House", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "Referral",
      province: "Western", district: "Colombo", city: "Colombo 5", address: "24 Ward Place Lane, Colombo 5", landmark: "Near Thurstan College",
      lat: 6.9016, lng: 79.8663, locationVisibility: "APPROXIMATE", roadAccess: "Private lane, 20ft wide", roadWidthFt: 20, distanceMajorRoadKm: 0.4,
      sizePerches: 18, sizeSqft: 3600, builtUpSqft: 3600, floors: 2, bedrooms: 4, bathrooms: 4,
      totalPrice: 145_000_000, priceNegotiable: true, pricePerPerch: 8_055_555, currency: "LKR", ownerMinPrice: 138_000_000, advertisedPrice: 145_000_000,
      featuresJson: { parking: true, swimmingPool: true, generator: true, security: true, garden: true, servantQuarters: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(4), dateReceived: daysAgo(40), expiryDate: daysFromNow(50),
      heroImageUrl: "/brand/logo-icon-gold.png",
    },
    {
      ownerName: "Manel Rathnayake",
      title: "3BR Apartment, Nugegoda — Sea Breeze Residencies",
      description: "Spacious third-floor apartment with balcony views, 24-hour security and a shared gym. Ideal for a young family or rental investment.",
      category: "RESIDENTIAL", subtype: "Apartment", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Referral",
      province: "Western", district: "Colombo", city: "Nugegoda", address: "Sea Breeze Residencies, High Level Road, Nugegoda",
      lat: 6.8649, lng: 79.8997, locationVisibility: "APPROXIMATE", roadAccess: "Main road frontage", roadWidthFt: 40, distanceMajorRoadKm: 0.1,
      sizeSqft: 1450, builtUpSqft: 1450, floors: 1, bedrooms: 3, bathrooms: 2,
      totalPrice: 42_000_000, priceNegotiable: true, pricePerSqft: 28_965, currency: "LKR", advertisedPrice: 42_000_000,
      featuresJson: { parking: true, gym: true, security: true, elevator: true, seaView: false },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: false, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: false,
      legalVerificationStatus: "IN_PROGRESS", lastVerifiedDate: daysAgo(9), dateReceived: daysAgo(30), expiryDate: daysFromNow(60),
    },
    {
      ownerName: "Ahamed Rizwan",
      title: "20,000 sqft Warehouse with Container Access — Wattala",
      description: "Purpose-built warehouse on the Colombo-Negombo road corridor. Container-height loading bays, three-phase power, and 24-hour security. Immediate availability.",
      category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "Direct call",
      province: "Western", district: "Gampaha", city: "Wattala", address: "Colombo Road, Wattala", landmark: "1km from Wattala junction",
      lat: 6.9894, lng: 79.8925, locationVisibility: "APPROXIMATE", roadAccess: "Direct main road access", roadWidthFt: 60, distanceMajorRoadKm: 0.2,
      sizeSqft: 20000, warehouseFloorSqft: 20000, clearHeightFt: 32, floors: 1,
      monthlyRental: 1_800_000, securityDeposit: 5_400_000, minLeaseTermMonths: 24, currency: "LKR", advertisedPrice: 1_800_000, ownerMinPrice: 1_650_000,
      featuresJson: { clearHeight: 32, loadingBays: 4, containerAccess: true, threePhaseElectricity: true, floorLoading: "5 tons/sqm", parking: true, officeSpace: true, washrooms: true, fireApprovals: true, generator: true, security: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(2), dateReceived: daysAgo(20), expiryDate: daysFromNow(70),
    },
    {
      ownerName: "Gamini Ratnayaka",
      title: "15,500 sqft Mid-Size Warehouse — Peliyagoda",
      description: "Well-located distribution facility close to the Peliyagoda junction. Good clear height, ramped loading, fenced yard for container parking.",
      category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "WhatsApp",
      province: "Western", district: "Gampaha", city: "Peliyagoda", address: "Kandy Road, Peliyagoda",
      lat: 6.9667, lng: 79.8917, locationVisibility: "APPROXIMATE", roadAccess: "Main road, ramped entry", roadWidthFt: 45, distanceMajorRoadKm: 0.1,
      sizeSqft: 15500, warehouseFloorSqft: 15500, clearHeightFt: 26, floors: 1,
      monthlyRental: 1_350_000, securityDeposit: 4_050_000, minLeaseTermMonths: 12, currency: "LKR", advertisedPrice: 1_350_000,
      featuresJson: { clearHeight: 26, loadingBays: 2, containerAccess: true, threePhaseElectricity: true, parking: true, security: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: false, approvedPlanAvailable: true, municipalDocsAvailable: false, taxDocsAvailable: false,
      legalVerificationStatus: "UNVERIFIED", lastVerifiedDate: daysAgo(38), dateReceived: daysAgo(55), expiryDate: daysFromNow(10),
    },
    {
      ownerName: "Gamini Ratnayaka",
      title: "12,000 sqft Warehouse, Kelaniya — Immediate Availability",
      description: "Compact but efficient warehouse near Kelaniya bridge, suitable for FMCG or e-commerce fulfilment. Currently tenanted month-to-month.",
      category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "ikman.lk",
      province: "Western", district: "Gampaha", city: "Kelaniya", address: "Biyagama Road, Kelaniya",
      district2: undefined as never,
      lat: 6.9553, lng: 79.9219, locationVisibility: "APPROXIMATE", roadAccess: "Side road, 25ft", roadWidthFt: 25, distanceMajorRoadKm: 0.6,
      sizeSqft: 12000, warehouseFloorSqft: 12000, clearHeightFt: 22, floors: 1,
      monthlyRental: 950_000, currency: "LKR", advertisedPrice: 950_000,
      featuresJson: { clearHeight: 22, containerAccess: false, threePhaseElectricity: true, parking: true },
      ownerAuthorityConfirmed: false, deedAvailable: false, surveyPlanAvailable: false, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: false,
      legalVerificationStatus: "UNVERIFIED", lastVerifiedDate: null, dateReceived: daysAgo(3), expiryDate: daysFromNow(90),
    } as never,
    {
      ownerName: "Chandrika Amarasinghe",
      title: "Hillside Villa with Valley Views — Kandy",
      description: "A restful five-bedroom villa above Kandy town with panoramic hill views, mature gardens, and a separate annexe. Popular with holiday-home buyers.",
      category: "RESIDENTIAL", subtype: "Villa", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "Website form",
      province: "Central", district: "Kandy", city: "Kandy", address: "Hantana Road, Kandy",
      lat: 7.2703, lng: 80.6151, locationVisibility: "APPROXIMATE", roadAccess: "Tarred road", roadWidthFt: 16, distanceMajorRoadKm: 2.1,
      sizePerches: 40, sizeSqft: 5200, builtUpSqft: 5200, floors: 2, bedrooms: 5, bathrooms: 5,
      totalPrice: 98_000_000, priceNegotiable: true, currency: "LKR", advertisedPrice: 98_000_000, ownerMinPrice: 90_000_000,
      featuresJson: { parking: true, garden: true, generator: true, security: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: false, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(12), dateReceived: daysAgo(75), expiryDate: daysFromNow(15),
    },
    {
      ownerName: "Susantha Kodikara",
      title: "Grade-A Office Floor — Battaramulla",
      description: "1,800 sqft fitted office floor in a modern commercial building close to the Parliament complex. Backup power, central AC, dedicated parking.",
      category: "COMMERCIAL", subtype: "Office", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Referral",
      province: "Western", district: "Colombo", city: "Battaramulla", address: "Pelawatte Road, Battaramulla",
      lat: 6.9, lng: 79.9187, locationVisibility: "APPROXIMATE", roadAccess: "Main road", roadWidthFt: 30, distanceMajorRoadKm: 0.3,
      sizeSqft: 1800, builtUpSqft: 1800, floors: 1,
      monthlyRental: 405_000, securityDeposit: 1_215_000, minLeaseTermMonths: 12, currency: "LKR", advertisedPrice: 405_000,
      featuresJson: { parking: true, elevator: true, backupPower: true, centralAC: true, meetingRooms: true, security: true, fireApprovals: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(6), dateReceived: daysAgo(25), expiryDate: daysFromNow(65),
    },
    {
      ownerName: "Roshan Mendis",
      title: "Beachfront Guesthouse — Negombo",
      description: "12-room guesthouse on the Negombo beach strip with existing tourism licensing. Strong track record on booking platforms, sold with furnishings.",
      category: "COMMERCIAL", subtype: "Guesthouse", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "ikman.lk",
      province: "Western", district: "Gampaha", city: "Negombo", address: "Beach Road, Negombo",
      lat: 7.2095, lng: 79.8385, locationVisibility: "APPROXIMATE", roadAccess: "Beach road frontage", roadWidthFt: 20, distanceMajorRoadKm: 0.05,
      sizePerches: 22, sizeSqft: 8500, builtUpSqft: 6200, floors: 3,
      totalPrice: 165_000_000, priceNegotiable: true, currency: "LKR", advertisedPrice: 165_000_000, expectedYieldPct: 9.5,
      featuresJson: { parking: true, generator: true, security: true, seaView: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(20), dateReceived: daysAgo(90), expiryDate: daysFromNow(5),
    },
    {
      ownerName: "Fathima Nazreen",
      title: "Development Land, 3.5 Acres — Galle",
      description: "Prime blank-canvas land parcel on the Galle-Matara highway corridor, suited for a boutique hotel or mixed residential development.",
      category: "LAND_AGRICULTURE", subtype: "Development Land", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Walk-in",
      province: "Southern", district: "Galle", city: "Galle", address: "Matara Road, Galle",
      lat: 6.0535, lng: 80.221, locationVisibility: "HIDDEN", roadAccess: "Highway frontage", roadWidthFt: 80, distanceMajorRoadKm: 0,
      sizeAcres: 3.5, sizeSqft: 152460, frontageFt: 220,
      totalPrice: 210_000_000, priceNegotiable: true, currency: "LKR", advertisedPrice: 210_000_000,
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: true,
      legalVerificationStatus: "IN_PROGRESS", lastVerifiedDate: daysAgo(15), dateReceived: daysAgo(60), expiryDate: daysFromNow(30),
    },
    {
      ownerName: "Priyantha Wijesekara",
      title: "Luxury 5BR Residence — Colombo 7",
      description: "An architect-designed residence in the heart of Cinnamon Gardens with a private lift, home theatre, and rooftop terrace.",
      category: "RESIDENTIAL", subtype: "Luxury Residence", transactionType: "SALE", listingStatus: "DRAFT", exclusivity: "EXCLUSIVE", source: "Referral",
      province: "Western", district: "Colombo", city: "Colombo 7", address: "Guildford Crescent, Colombo 7",
      lat: 6.9061, lng: 79.868, locationVisibility: "HIDDEN", roadAccess: "Private crescent", roadWidthFt: 24, distanceMajorRoadKm: 0.2,
      sizePerches: 32, sizeSqft: 7200, builtUpSqft: 7200, floors: 3, bedrooms: 5, bathrooms: 6,
      totalPrice: 420_000_000, priceNegotiable: false, currency: "LKR", advertisedPrice: null, ownerMinPrice: 410_000_000,
      featuresJson: { parking: true, swimmingPool: true, generator: true, security: true, elevator: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: false, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: false,
      legalVerificationStatus: "UNVERIFIED", lastVerifiedDate: null, dateReceived: daysAgo(2), expiryDate: daysFromNow(90), internalLegalNotes: "Awaiting confirmation of survey plan from owner's lawyer before this can go live.",
    },
    {
      ownerName: "Susantha Kodikara",
      title: "Retail Shop Lots — High Level Road, Nugegoda",
      description: "Three ground-floor retail units with high footfall frontage, suitable for F&B or fashion retail.",
      category: "COMMERCIAL", subtype: "Retail Space", transactionType: "LEASE", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Referral",
      province: "Western", district: "Colombo", city: "Nugegoda", address: "High Level Road, Nugegoda",
      lat: 6.8656, lng: 79.8989, locationVisibility: "EXACT", roadAccess: "Main road frontage", roadWidthFt: 40, distanceMajorRoadKm: 0,
      sizeSqft: 2200, frontageFt: 60,
      annualLeaseValue: 9_600_000, keyMoney: 3_000_000, minLeaseTermMonths: 36, currency: "LKR", advertisedPrice: 9_600_000,
      featuresJson: { frontage: 60, footfall: "high", parking: false, signage: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(5), dateReceived: daysAgo(35), expiryDate: daysFromNow(55),
    },
    {
      ownerName: "Isuru Karunaratne",
      title: "Gated Community Apartments — Battaramulla (Off-Plan)",
      description: "48-unit gated apartment development seeking joint-venture or bulk investment partners. Approvals in progress.",
      category: "RESIDENTIAL", subtype: "Development Project", transactionType: "JOINT_VENTURE", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "Industry event",
      province: "Western", district: "Colombo", city: "Battaramulla", address: "Pattiyawala Road, Battaramulla",
      lat: 6.9058, lng: 79.9245, locationVisibility: "APPROXIMATE", roadAccess: "Main road", roadWidthFt: 33, distanceMajorRoadKm: 0.5,
      sizeAcres: 1.2, sizeSqft: 52272,
      totalPrice: 650_000_000, expectedYieldPct: 18, currency: "LKR", advertisedPrice: 650_000_000,
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: true,
      legalVerificationStatus: "IN_PROGRESS", lastVerifiedDate: daysAgo(10), dateReceived: daysAgo(45), expiryDate: daysFromNow(100),
    },
    {
      ownerName: "Gamini Ratnayaka",
      title: "Factory Unit with Effluent Approval — Ja-Ela",
      description: "Light-industrial factory space with existing effluent treatment approval — well suited for food processing or garments.",
      category: "INDUSTRIAL_LOGISTICS", subtype: "Factory", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Direct call",
      province: "Western", district: "Gampaha", city: "Ja-Ela", address: "Kandy Road, Ja-Ela",
      lat: 7.074, lng: 79.8917, locationVisibility: "APPROXIMATE", roadAccess: "Main road", roadWidthFt: 40, distanceMajorRoadKm: 0.3,
      sizeSqft: 18000, warehouseFloorSqft: 18000, clearHeightFt: 28, floors: 1,
      monthlyRental: 1_500_000, currency: "LKR", advertisedPrice: 1_500_000,
      featuresJson: { clearHeight: 28, threePhaseElectricity: true, effluentDisposal: true, generator: true, security: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(50), dateReceived: daysAgo(100), expiryDate: daysAgo(5),
    },
    {
      ownerName: "Manel Rathnayake",
      title: "Annexe for Rent — Rajagiriya",
      description: "Self-contained two-room annexe with private entrance and parking, close to Rajagiriya flyover.",
      category: "RESIDENTIAL", subtype: "Annexe", transactionType: "RENT", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Facebook",
      province: "Western", district: "Colombo", city: "Rajagiriya", address: "Vihara Mahadevi Mawatha, Rajagiriya",
      lat: 6.9087, lng: 79.8964, locationVisibility: "APPROXIMATE", roadAccess: "Side lane", roadWidthFt: 15, distanceMajorRoadKm: 0.2,
      sizeSqft: 650, bedrooms: 2, bathrooms: 1,
      monthlyRental: 65_000, securityDeposit: 130_000, currency: "LKR", advertisedPrice: 65_000,
      featuresJson: { parking: true, furnished: false, security: false },
      ownerAuthorityConfirmed: true, deedAvailable: false, surveyPlanAvailable: false, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: false,
      legalVerificationStatus: "UNVERIFIED", lastVerifiedDate: daysAgo(1), dateReceived: daysAgo(6), expiryDate: daysFromNow(85),
    },
    {
      ownerName: "Chandrika Amarasinghe",
      title: "Agricultural Land, 8 Acres — Matale",
      description: "Established spice and coconut cultivation land with a caretaker's cottage. Water source on the property.",
      category: "LAND_AGRICULTURE", subtype: "Agricultural Land", transactionType: "SALE", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Referral",
      province: "Central", district: "Matale", city: "Matale", address: "Rattota Road, Matale",
      lat: 7.4675, lng: 80.6234, locationVisibility: "APPROXIMATE", roadAccess: "Gravel road", roadWidthFt: 12, distanceMajorRoadKm: 3.4,
      sizeAcres: 8, sizeSqft: 348480,
      totalPrice: 32_000_000, priceNegotiable: true, currency: "LKR", advertisedPrice: 32_000_000,
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(70), dateReceived: daysAgo(150), expiryDate: daysAgo(20),
    },
    {
      ownerName: "Ahamed Rizwan",
      title: "Cold Storage Facility — Katunayake",
      description: "Purpose-built cold storage with multiple temperature zones, close to the airport for perishable exports/imports.",
      category: "INDUSTRIAL_LOGISTICS", subtype: "Cold Storage Facility", transactionType: "LEASE", listingStatus: "ACTIVE", exclusivity: "EXCLUSIVE", source: "Referral",
      province: "Western", district: "Gampaha", city: "Katunayake", address: "Airport Access Road, Katunayake",
      lat: 7.1697, lng: 79.8842, locationVisibility: "APPROXIMATE", roadAccess: "Direct road access", roadWidthFt: 40, distanceMajorRoadKm: 1.2,
      sizeSqft: 9000, warehouseFloorSqft: 9000, clearHeightFt: 20, floors: 1,
      annualLeaseValue: 21_600_000, minLeaseTermMonths: 36, currency: "LKR", advertisedPrice: 21_600_000,
      featuresJson: { temperatureZones: 3, loadingBays: 2, backupPower: true, containerAccess: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(3), dateReceived: daysAgo(18), expiryDate: daysFromNow(72),
    },
    {
      ownerName: "Fathima Nazreen",
      title: "Beach Holiday Home — Unawatuna",
      description: "Three-bedroom holiday home 300m from Unawatuna beach with strong short-term rental history.",
      category: "RESIDENTIAL", subtype: "Holiday Home", transactionType: "SHORT_TERM_RENTAL", listingStatus: "ACTIVE", exclusivity: "OPEN", source: "Website form",
      province: "Southern", district: "Galle", city: "Unawatuna", address: "Yaddehimulla Road, Unawatuna",
      lat: 6.0128, lng: 80.2492, locationVisibility: "APPROXIMATE", roadAccess: "Lane access", roadWidthFt: 12, distanceMajorRoadKm: 0.3,
      sizeSqft: 2400, bedrooms: 3, bathrooms: 3,
      monthlyRental: 380_000, currency: "LKR", advertisedPrice: 380_000, expectedYieldPct: 11,
      featuresJson: { parking: true, swimmingPool: true, furnished: true, seaView: true },
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: false, cocAvailable: false, approvedPlanAvailable: false, municipalDocsAvailable: false, taxDocsAvailable: false,
      legalVerificationStatus: "UNVERIFIED", lastVerifiedDate: daysAgo(25), dateReceived: daysAgo(80), expiryDate: daysFromNow(20),
    },
    {
      ownerName: "Roshan Mendis",
      title: "Mixed-Use Building — Negombo Town",
      description: "Ground-floor retail with two floors of residential apartments above, in Negombo's commercial core.",
      category: "COMMERCIAL", subtype: "Mixed-Use Development", transactionType: "SALE", listingStatus: "UNDER_OFFER", exclusivity: "EXCLUSIVE", source: "ikman.lk",
      province: "Western", district: "Gampaha", city: "Negombo", address: "Main Street, Negombo",
      lat: 7.2086, lng: 79.8378, locationVisibility: "APPROXIMATE", roadAccess: "Main street frontage", roadWidthFt: 30, distanceMajorRoadKm: 0,
      sizeSqft: 6800, floors: 3,
      totalPrice: 88_000_000, priceNegotiable: true, currency: "LKR", advertisedPrice: 88_000_000,
      ownerAuthorityConfirmed: true, deedAvailable: true, surveyPlanAvailable: true, cocAvailable: true, approvedPlanAvailable: true, municipalDocsAvailable: true, taxDocsAvailable: true,
      legalVerificationStatus: "VERIFIED", lastVerifiedDate: daysAgo(8), dateReceived: daysAgo(65), expiryDate: daysFromNow(25),
    },
  ];

  const properties: Awaited<ReturnType<typeof prisma.property.create>>[] = [];
  let pSeq = 1;
  for (const def of propertyDefs) {
    const { ownerName, ...data } = def as PropDef;
    delete (data as Record<string, unknown>).district2;
    const owner = contacts[ownerName];
    const created = await prisma.property.create({
      data: {
        ...data,
        propertyRef: ref("P", pSeq++),
        ownerId: owner?.id,
        assignedAgentId: anyAgent().id,
      } as never,
    });
    properties.push(created);
    await prisma.propertyMedia.create({
      data: { propertyId: created.id, url: "/brand/logo-icon-gold.png", type: "PHOTO", branded: true, caption: "Placeholder hero image — replace with real photography" },
    });
    await prisma.activity.create({
      data: { entityType: "property", propertyId: created.id, type: "CREATED", message: `Property record created (${created.propertyRef}).`, userId: created.assignedAgentId },
    });
  }
  const byTitle = (t: string) => properties.find((p) => p.title === t)!;

  // -------------------------------------------------------------------
  // Requirements
  // -------------------------------------------------------------------
  type ReqDef = Parameters<typeof prisma.requirement.create>[0]["data"] & { clientName: string };
  const requirementDefs: Array<Omit<ReqDef, "requirementRef" | "assignedAgentId" | "clientId">> = [
    {
      clientName: "Adam Careem", type: "WAREHOUSE", title: "Warehouse for rent — Peliyagoda / Wattala / Kelaniya",
      dealType: "RENT", category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse",
      preferredLocationsJson: ["Peliyagoda", "Wattala", "Kelaniya"], acceptableSurroundingJson: ["Ja-Ela", "Kadawatha"],
      sizeMin: 15000, sizeMax: 20000, budgetMax: 1_600_000,
      requiredFeaturesJson: { containerAccess: true, threePhaseElectricity: true },
      intendedUse: "General goods storage and distribution", financingStatus: "UNCONFIRMED", urgency: "HIGH", quality: "QUALIFIED",
      status: "ACTIVELY_SEARCHING", source: "WhatsApp", lastContacted: daysAgo(1), nextAction: "Share shortlisted warehouses", nextActionDate: daysFromNow(1),
      confidentialNotes: "Budget not fully confirmed — decision maker is Adam's father, expect negotiation on rent.",
      expiryDate: daysFromNow(30),
    },
    {
      clientName: "Samantha Herath", type: "CORPORATE_LEASE", title: "Herath Logistics — 12,000-16,000 sqft distribution space",
      dealType: "LEASE", category: "INDUSTRIAL_LOGISTICS", subtype: "Distribution Centre",
      preferredLocationsJson: ["Kelaniya", "Peliyagoda"], acceptableSurroundingJson: ["Wattala"],
      sizeMin: 12000, sizeMax: 16000, budgetMax: 25_000_000,
      requiredFeaturesJson: { threePhaseElectricity: true, loadingBays: true },
      intendedUse: "3PL distribution hub", decisionMaker: "Samantha Herath, Operations Director", companyName: "Herath Logistics (Pvt) Ltd",
      financingStatus: "BANK_FINANCE", urgency: "MEDIUM", quality: "QUALIFIED", status: "OPTIONS_SHARED",
      source: "LinkedIn", lastContacted: daysAgo(3), nextAction: "Follow up after site visit", nextActionDate: daysFromNow(2), expiryDate: daysFromNow(45),
    },
    {
      clientName: "Nirmala Perera", type: "BUYER", title: "3BR apartment or house, Colombo suburbs, up to Rs. 45Mn",
      dealType: "BUY", category: "RESIDENTIAL", subtype: "Apartment",
      preferredLocationsJson: ["Nugegoda", "Rajagiriya", "Battaramulla"], acceptableSurroundingJson: ["Kotte", "Kaduwela"],
      sizeMin: 1200, budgetMax: 45_000_000, requiredFeaturesJson: { parking: true, security: true },
      intendedUse: "Family residence", financingStatus: "BANK_FINANCE", urgency: "MEDIUM", quality: "QUALIFIED",
      status: "VIEWING_ARRANGED", source: "Facebook", lastContacted: daysAgo(2), nextAction: "Confirm viewing time for Sat", nextActionDate: daysFromNow(3), expiryDate: daysFromNow(60),
    },
    {
      clientName: "Dinesh Chandrasiri", type: "BUYER", title: "Luxury residence, Colombo 5-7, Rs. 350-450Mn",
      dealType: "BUY", category: "RESIDENTIAL", subtype: "Luxury Residence",
      preferredLocationsJson: ["Colombo 7", "Colombo 5"], acceptableSurroundingJson: ["Colombo 3"],
      sizeMin: 5000, budgetMin: 350_000_000, budgetMax: 450_000_000, requiredFeaturesJson: { swimmingPool: true, security: true, generator: true },
      intendedUse: "Primary residence", financingStatus: "CASH", urgency: "HIGH", quality: "PREMIUM",
      status: "NEGOTIATING", source: "Referral", lastContacted: daysAgo(1), nextAction: "Present counter-offer to owner", nextActionDate: daysFromNow(1),
      confidentialNotes: "High-net-worth client, values discretion — do not share exact address of shortlisted properties by email.", expiryDate: daysFromNow(40),
    },
    {
      clientName: "Zainab Hassan", type: "INVESTOR_MANDATE", title: "Yield-focused hospitality asset, South coast",
      dealType: "BUY", category: "COMMERCIAL", subtype: "Guesthouse",
      preferredLocationsJson: ["Galle", "Unawatuna", "Hikkaduwa"], acceptableSurroundingJson: ["Matara"],
      budgetMax: 200_000_000, requiredFeaturesJson: {}, intendedUse: "Boutique hospitality investment, target 9%+ yield",
      financingStatus: "CASH", urgency: "MEDIUM", quality: "PREMIUM", status: "ACTIVELY_SEARCHING",
      source: "Investor network", lastContacted: daysAgo(5), nextAction: "Share updated comparables", nextActionDate: daysFromNow(4), expiryDate: daysFromNow(50),
    },
    {
      clientName: "Michael Fernando", type: "WAREHOUSE", title: "Global Freight — cold storage requirement near airport",
      dealType: "LEASE", category: "INDUSTRIAL_LOGISTICS", subtype: "Cold Storage Facility",
      preferredLocationsJson: ["Katunayake", "Ja-Ela"], acceptableSurroundingJson: ["Negombo"],
      sizeMin: 7000, budgetMax: 22_000_000, requiredFeaturesJson: { backupPower: true, containerAccess: true },
      companyName: "Global Freight Solutions", decisionMaker: "Michael Fernando, Country Manager",
      intendedUse: "Perishable cargo storage", financingStatus: "BANK_FINANCE", urgency: "CRITICAL", quality: "QUALIFIED",
      status: "OPTIONS_SHARED", source: "Email", lastContacted: daysAgo(1), nextAction: "Schedule site visit", nextActionDate: daysFromNow(1), expiryDate: daysFromNow(20),
    },
    {
      clientName: "Anusha Wijeratne", type: "BUYER", title: "Hillside home or villa near Kandy, up to Rs. 100Mn",
      dealType: "BUY", category: "RESIDENTIAL", subtype: "Villa",
      preferredLocationsJson: ["Kandy"], acceptableSurroundingJson: ["Peradeniya", "Gampola"],
      budgetMax: 100_000_000, sizeMin: 4000, requiredFeaturesJson: { garden: true },
      intendedUse: "Retirement home", financingStatus: "CASH", urgency: "LOW", quality: "QUALIFIED",
      status: "QUALIFIED", source: "Referral", lastContacted: daysAgo(10), nextAction: "Reconfirm requirement is still active", nextActionDate: daysFromNow(-1), expiryDate: daysFromNow(15),
    },
    {
      clientName: "Ruwantha Silva", type: "TENANT", title: "2-3BR apartment for rent, Colombo 7 area",
      dealType: "RENT", category: "RESIDENTIAL", subtype: "Apartment",
      preferredLocationsJson: ["Colombo 7"], acceptableSurroundingJson: ["Colombo 5", "Colombo 3"],
      budgetMax: 250_000, sizeMin: 1000, requiredFeaturesJson: { parking: true },
      intendedUse: "Expat relocation", financingStatus: "UNCONFIRMED", urgency: "HIGH", quality: "UNVERIFIED",
      status: "NEW", source: "Website form", lastContacted: null, nextAction: "First contact call", nextActionDate: daysFromNow(0), expiryDate: daysFromNow(25),
    },
    {
      clientName: "Kamal Abeywardena", type: "INVESTOR_MANDATE", title: "Commercial building for rental yield, Colombo core",
      dealType: "BUY", category: "COMMERCIAL", subtype: "Commercial Building",
      preferredLocationsJson: ["Colombo 2", "Colombo 3", "Colombo 4"], acceptableSurroundingJson: [],
      budgetMax: 300_000_000, requiredFeaturesJson: {}, intendedUse: "Long-term rental income",
      financingStatus: "CASH", urgency: "LOW", quality: "PREMIUM", status: "ON_HOLD",
      source: "Referral", lastContacted: daysAgo(40), nextAction: "Quarterly check-in", nextActionDate: daysFromNow(-5), expiryDate: daysFromNow(-2),
    },
    {
      clientName: "Vindhya Kumarasinghe", type: "BUYER", title: "First home, Mount Lavinia / Dehiwala, up to Rs. 30Mn",
      dealType: "BUY", category: "RESIDENTIAL", subtype: "House",
      preferredLocationsJson: ["Mount Lavinia", "Dehiwala"], acceptableSurroundingJson: ["Moratuwa"],
      budgetMax: 30_000_000, sizeMin: 1000, requiredFeaturesJson: {},
      intendedUse: "First family home", financingStatus: "BANK_FINANCE", urgency: "MEDIUM", quality: "UNVERIFIED",
      status: "UNVERIFIED", source: "WhatsApp", lastContacted: daysAgo(6), nextAction: "Verify pre-approval letter", nextActionDate: daysFromNow(2), expiryDate: daysFromNow(35),
    },
    {
      clientName: "Nayana Ekanayake", type: "TENANT", title: "Small warehouse or factory, up to 10,000 sqft, Wattala area",
      dealType: "RENT", category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse",
      preferredLocationsJson: ["Wattala"], acceptableSurroundingJson: ["Ja-Ela", "Kelaniya"],
      sizeMax: 10000, budgetMax: 850_000, requiredFeaturesJson: {},
      intendedUse: "E-commerce fulfilment", financingStatus: "UNCONFIRMED", urgency: "MEDIUM", quality: "UNVERIFIED",
      status: "NEW", source: "WhatsApp", lastContacted: daysAgo(1), nextAction: "Confirm exact budget", nextActionDate: daysFromNow(1), expiryDate: daysFromNow(28),
    },
    {
      clientName: "Faiz Marikkar", type: "WAREHOUSE", title: "Marikkar Cold Chain — expansion cold storage need",
      dealType: "RENT", category: "INDUSTRIAL_LOGISTICS", subtype: "Cold Storage Facility",
      preferredLocationsJson: ["Ja-Ela", "Katunayake"], acceptableSurroundingJson: ["Negombo"],
      sizeMin: 6000, budgetMax: 1_900_000, requiredFeaturesJson: { backupPower: true },
      companyName: "Marikkar Cold Chain", financingStatus: "BANK_FINANCE", urgency: "MEDIUM", quality: "QUALIFIED",
      status: "ACTIVELY_SEARCHING", source: "Referral", lastContacted: daysAgo(4), nextAction: "Share cold storage options", nextActionDate: daysFromNow(2), expiryDate: daysFromNow(40),
    },
    {
      clientName: "Harshani de Silva", type: "BUYER", title: "Land for holiday home, Galle coastal belt",
      dealType: "BUY", category: "LAND_AGRICULTURE", subtype: "Residential Land",
      preferredLocationsJson: ["Galle", "Unawatuna"], acceptableSurroundingJson: ["Habaraduwa"],
      budgetMax: 60_000_000, sizeMin: 20, requiredFeaturesJson: {},
      intendedUse: "Future holiday home construction", financingStatus: "CASH", urgency: "LOW", quality: "QUALIFIED",
      status: "ACTIVELY_SEARCHING", source: "Instagram", lastContacted: daysAgo(8), nextAction: "Send land listings", nextActionDate: daysFromNow(3), expiryDate: daysFromNow(55),
    },
    {
      clientName: "Naveed Iqbal", type: "INVESTOR_MANDATE", title: "Development land, Colombo suburbs, JV or outright",
      dealType: "BUY", category: "LAND_AGRICULTURE", subtype: "Development Land",
      preferredLocationsJson: ["Battaramulla", "Kaduwela"], acceptableSurroundingJson: ["Malabe"],
      budgetMax: 700_000_000, sizeMin: 1, requiredFeaturesJson: {},
      intendedUse: "Residential apartment development", financingStatus: "BANK_FINANCE", urgency: "MEDIUM", quality: "PREMIUM",
      status: "QUALIFIED", source: "Investor network", lastContacted: daysAgo(2), nextAction: "Share JV proposal from Karu Developments", nextActionDate: daysFromNow(5), expiryDate: daysFromNow(60),
    },
  ];

  const requirements: Awaited<ReturnType<typeof prisma.requirement.create>>[] = [];
  let rSeq = 1;
  for (const def of requirementDefs) {
    const { clientName, ...data } = def as ReqDef;
    const client = contacts[clientName];
    const created = await prisma.requirement.create({
      data: {
        ...data,
        requirementRef: ref("R", rSeq++),
        clientId: client.id,
        assignedAgentId: anyAgent().id,
      } as never,
    });
    requirements.push(created);
    await prisma.activity.create({
      data: { entityType: "requirement", requirementId: created.id, type: "CREATED", message: `Requirement record created (${created.requirementRef}).`, userId: created.assignedAgentId },
    });
  }

  // -------------------------------------------------------------------
  // Deals, viewings, offers, commissions
  // -------------------------------------------------------------------
  const dealSeeds = [
    { property: "Modern 4BR House with Pool in Colombo 5", client: "Dinesh Chandrasiri", requirement: undefined, stage: "NEGOTIATION" as const, expectedValue: 145_000_000, pct: 2.5, probability: 55 },
    { property: "20,000 sqft Warehouse with Container Access — Wattala", client: "Adam Careem", requirement: "Warehouse for rent — Peliyagoda / Wattala / Kelaniya", stage: "VIEWING_ARRANGED" as const, expectedValue: 1_800_000 * 24, pct: 8.33, probability: 40 },
    { property: "Beachfront Guesthouse — Negombo", client: "Zainab Hassan", requirement: "Yield-focused hospitality asset, South coast", stage: "SHORTLISTED" as const, expectedValue: 165_000_000, pct: 3, probability: 25 },
    { property: "Grade-A Office Floor — Battaramulla", client: "Michael Fernando", requirement: undefined, stage: "QUALIFIED" as const, expectedValue: 405_000 * 12, pct: 8.33, probability: 30 },
    { property: "3BR Apartment, Nugegoda — Sea Breeze Residencies", client: "Nirmala Perera", requirement: "3BR apartment or house, Colombo suburbs, up to Rs. 45Mn", stage: "VIEWING_COMPLETED" as const, expectedValue: 42_000_000, pct: 2.5, probability: 45 },
    { property: "Mixed-Use Building — Negombo Town", client: "Kamal Abeywardena", requirement: undefined, stage: "AGREEMENT_PENDING" as const, expectedValue: 88_000_000, pct: 2.5, probability: 85 },
    { property: "Hillside Villa with Valley Views — Kandy", client: "Anusha Wijeratne", requirement: "Hillside home or villa near Kandy, up to Rs. 100Mn", stage: "CLOSED_WON" as const, expectedValue: 96_500_000, pct: 2.5, probability: 100, closed: true },
    { property: "Cold Storage Facility — Katunayake", client: "Faiz Marikkar", requirement: "Marikkar Cold Chain — expansion cold storage need", stage: "OFFER_SUBMITTED" as const, expectedValue: 21_600_000, pct: 8.33, probability: 60 },
    { property: "15,500 sqft Mid-Size Warehouse — Peliyagoda", client: "Samantha Herath", requirement: "Herath Logistics — 12,000-16,000 sqft distribution space", stage: "CLOSED_LOST" as const, expectedValue: 16_200_000, pct: 8.33, probability: 0, lost: true },
    { property: "Retail Shop Lots — High Level Road, Nugegoda", client: "Vindhya Kumarasinghe", requirement: undefined, stage: "CONTACT_ATTEMPTED" as const, expectedValue: 9_600_000, pct: 8.33, probability: 15 },
    { property: "Annexe for Rent — Rajagiriya", client: "Ruwantha Silva", requirement: "2-3BR apartment for rent, Colombo 7 area", stage: "NEW_INQUIRY" as const, expectedValue: 65_000 * 12, pct: 8.33, probability: 10 },
    { property: "Gated Community Apartments — Battaramulla (Off-Plan)", client: "Naveed Iqbal", requirement: "Development land, Colombo suburbs, JV or outright", stage: "NEGOTIATION" as const, expectedValue: 650_000_000, pct: 1.5, probability: 35 },
  ];

  let dSeq = 1;
  for (const d of dealSeeds) {
    const property = byTitle(d.property);
    const client = contacts[d.client];
    const requirement = d.requirement ? requirements.find((r) => r.title === d.requirement) : undefined;
    const agentId = property.assignedAgentId ?? anyAgent().id;
    const deal = await prisma.deal.create({
      data: {
        dealRef: ref("D", dSeq++),
        propertyId: property.id,
        clientId: client.id,
        requirementId: requirement?.id,
        assignedAgentId: agentId,
        otherBrokerId: Math.random() > 0.7 ? contacts["Suresh Kumar"].id : undefined,
        stage: d.stage,
        expectedValue: d.expectedValue,
        expectedCommissionPct: d.pct,
        probability: d.probability,
        nextAction: d.stage === "CLOSED_WON" || d.stage === "CLOSED_LOST" ? undefined : "Follow up with client",
        nextActionDate: d.stage === "CLOSED_WON" || d.stage === "CLOSED_LOST" ? undefined : daysFromNow(randInt(1, 5)),
        closingDate: d.closed ? daysAgo(randInt(1, 10)) : d.lost ? daysAgo(randInt(1, 15)) : undefined,
        lostReason: d.lost ? "Client secured a lower-cost option through a competing broker." : undefined,
      },
    });

    await prisma.viewing.create({
      data: {
        propertyId: property.id,
        dealId: deal.id,
        contactId: client.id,
        agentId,
        scheduledAt: d.closed || d.lost ? daysAgo(randInt(10, 30)) : daysFromNow(randInt(-3, 6)),
        status: d.closed ? "COMPLETED" : d.lost ? "COMPLETED" : rand(["SCHEDULED", "CONFIRMED", "COMPLETED"] as const),
        feedbackRating: d.closed ? 5 : d.lost ? 2 : Math.random() > 0.4 ? randInt(3, 5) : null,
        feedbackNotes: d.closed ? "Client loved the property — proceeded straight to offer." : d.lost ? "Client felt rent was above market for the area." : Math.random() > 0.5 ? "Positive feedback, considering options." : null,
      },
    });

    if (["NEGOTIATION", "OFFER_SUBMITTED", "AGREEMENT_PENDING", "CLOSED_WON", "CLOSED_LOST"].includes(d.stage)) {
      await prisma.offer.create({
        data: {
          dealId: deal.id,
          amount: Math.round(d.expectedValue * (d.closed ? 1 : 0.93)),
          terms: "Standard terms, 10% deposit on agreement signing.",
          submittedBy: client.name,
          status: d.closed ? "ACCEPTED" : d.lost ? "REJECTED" : rand(["SUBMITTED", "COUNTERED"] as const),
          respondedAt: d.closed || d.lost ? daysAgo(randInt(1, 8)) : undefined,
        },
      });
    }

    if (d.closed) {
      const agencyFeeAmount = Math.round((d.expectedValue * d.pct) / 100);
      await prisma.commission.create({
        data: {
          dealId: deal.id,
          agencyFeePct: d.pct,
          agencyFeeAmount,
          agentSplitPct: 50,
          agentSplitAmount: Math.round(agencyFeeAmount * 0.5),
          brokerSplitPct: deal.otherBrokerId ? 20 : 0,
          brokerSplitAmount: deal.otherBrokerId ? Math.round(agencyFeeAmount * 0.2) : 0,
          status: rand(["PENDING", "INVOICED", "PAID"] as const),
          dueDate: daysFromNow(randInt(-5, 20)),
          paidDate: Math.random() > 0.5 ? daysAgo(randInt(1, 5)) : undefined,
        },
      });
    }

    await prisma.activity.create({
      data: { entityType: "deal", dealId: deal.id, type: "STAGE", message: `Deal created at stage ${d.stage.replace("_", " ")}.`, userId: agentId },
    });
  }

  // -------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------
  const taskSeeds: Array<{ type: Parameters<typeof prisma.task.create>[0]["data"]["type"]; title: string; dueAt: Date; status?: "OPEN" | "DONE" }> = [
    { type: "CONTACT_INQUIRY", title: "Call Ruwantha Silva — new inquiry not yet contacted", dueAt: daysAgo(1) },
    { type: "VIEWING_CONFIRM", title: "Confirm Saturday viewing with Nirmala Perera", dueAt: daysFromNow(1) },
    { type: "CLIENT_UPDATE", title: "Send Dinesh Chandrasiri an update on counter-offer", dueAt: daysFromNow(0) },
    { type: "LISTING_VERIFY", title: "Reverify 15,500 sqft Peliyagoda warehouse listing", dueAt: daysAgo(3) },
    { type: "OFFER_RESPONSE", title: "Chase owner response on Cold Storage Facility offer", dueAt: daysFromNow(2) },
    { type: "LEASE_EXPIRY", title: "Retail Shop Lots lease renewal discussion due soon", dueAt: daysFromNow(10) },
    { type: "COMMISSION_OVERDUE", title: "Follow up on overdue commission — Mixed-Use Building deal", dueAt: daysAgo(2) },
    { type: "REQUIREMENT_RECONFIRM", title: "Reconfirm Anusha Wijeratne's villa requirement is still active", dueAt: daysAgo(1) },
    { type: "REQUIREMENT_RECONFIRM", title: "Reconfirm Kamal Abeywardena's commercial mandate (on hold)", dueAt: daysAgo(5) },
    { type: "LISTING_VERIFY", title: "Reverify Factory Unit, Ja-Ela — expired listing", dueAt: daysAgo(6) },
    { type: "CONTACT_INQUIRY", title: "First contact call — Nayana Ekanayake warehouse requirement", dueAt: daysFromNow(0) },
    { type: "CLIENT_UPDATE", title: "Update Zainab Hassan on new hospitality comparables", dueAt: daysFromNow(3) },
  ];
  for (const t of taskSeeds) {
    await prisma.task.create({
      data: { type: t.type, title: t.title, dueAt: t.dueAt, assignedToId: anyAgent().id, status: t.status ?? "OPEN" },
    });
  }

  // -------------------------------------------------------------------
  // Marketing assets & share page samples
  // -------------------------------------------------------------------
  const heroProperty = byTitle("Modern 4BR House with Pool in Colombo 5");
  await prisma.marketingAsset.create({
    data: {
      propertyId: heroProperty.id,
      contentType: "WHATSAPP",
      language: "EN",
      content: `*${heroProperty.title}*\n\nAn architect-finished 4-bedroom home in a quiet Colombo 5 lane, with private pool and secure parking. Rs. 145Mn, negotiable.\n\nContact Imperium Realty for a private viewing.`,
      approved: true,
      approvedById: users["Hasini Gunawardena"].id,
    },
  });
  await prisma.marketingAsset.create({
    data: {
      propertyId: heroProperty.id,
      contentType: "DESCRIPTION",
      language: "EN",
      content: `Set on a quiet private lane just off Havelock Road, this beautifully maintained two-storey residence offers four generous bedrooms, a private swimming pool, and landscaped gardens — all within walking distance of Colombo's leading international schools. Full legal documentation verified.`,
      approved: false,
    },
  });
  await prisma.sharePage.create({
    data: {
      propertyId: heroProperty.id,
      slug: "colombo-5-family-residence",
      visibility: "UNLISTED",
      hideOwnerContact: true,
      hideExactLocation: true,
      watermarkClientName: "Dinesh Chandrasiri",
    },
  });

  // -------------------------------------------------------------------
  // Audit log samples
  // -------------------------------------------------------------------
  await prisma.auditLog.create({
    data: { userId: users["Anoma Perera"].id, action: "SEED", entityType: "system", entityId: "seed", after: { note: "Initial demo dataset generated." } },
  });

  console.log(`Seed complete: ${Object.keys(users).length} users, ${Object.keys(contacts).length} contacts, ${properties.length} properties, ${requirements.length} requirements, ${dealSeeds.length} deals.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
