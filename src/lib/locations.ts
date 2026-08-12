// Reference geography for Sri Lanka. Kept as static in-app reference data
// (per spec §3 Administration → "categories, locations, templates") rather
// than DB rows, since it rarely changes and every module needs it synchronously.

export type DistrictInfo = {
  district: string;
  province: string;
  cities: string[];
};

export const SRI_LANKA_GEOGRAPHY: DistrictInfo[] = [
  // Wattala, Ja-Ela, Kelaniya and Peliyagoda are Gampaha district towns, not
  // Colombo — a real data bug caught when a sourced Peliyagoda listing came
  // through tagged "Colombo" (§ AI Intake / External Sourcing testing).
  // They'd also been duplicated into both rows, and since districtForCity()
  // takes the first array match, that silently mis-tagged every one of them.
  // Full detail per postal division (Colombo 1-15, each with its real
  // neighbourhood name) plus the outer-Colombo suburbs agents actually work
  // in day to day, grouped loosely by their divisional secretariat area.
  // Cross-checked against Sri Lanka Post's postal code list and the DS
  // division breakdown of Colombo District, not guessed.
  {
    province: "Western",
    district: "Colombo",
    cities: [
      // Colombo 1-15 — the numbered postal divisions
      "Colombo 1 (Fort)", "Colombo 2 (Slave Island)", "Colombo 3 (Kollupitiya)", "Colombo 4 (Bambalapitiya)",
      "Colombo 5 (Havelock Town)", "Colombo 6 (Wellawatte)", "Colombo 7 (Cinnamon Gardens)", "Colombo 8 (Borella)",
      "Colombo 9 (Dematagoda)", "Colombo 10 (Maradana)", "Colombo 11 (Pettah)", "Colombo 12 (Hulftsdorp)",
      "Colombo 13 (Kotahena)", "Colombo 14 (Grandpass)", "Colombo 15 (Mutwal)",
      // Thimbirigasyaya DS area
      "Narahenpita", "Kirulapone", "Thimbirigasyaya",
      // Kotte DS area
      "Sri Jayawardenepura Kotte", "Rajagiriya", "Nawala", "Pita Kotte", "Etul Kotte",
      "Battaramulla", "Pelawatte", "Thalahena", "Nugegoda", "Kohuwala", "Pepiliyana",
      // Dehiwala / Ratmalana DS area
      "Dehiwala", "Mount Lavinia", "Ratmalana", "Kalubowila",
      // Moratuwa DS area
      "Moratuwa", "Angulana", "Katubedda", "Rawatawatta", "Lunawa",
      // Kolonnawa DS area
      "Kolonnawa", "Wellampitiya", "Orugodawatta", "Kotikawatta", "Mulleriyawa",
      // Kaduwela DS area
      "Kaduwela", "Athurugiriya", "Malabe", "Hokandara", "Talawathugoda",
      // Maharagama DS area
      "Maharagama", "Pannipitiya", "Navinna", "Boralesgamuwa", "Kottawa",
      // Homagama DS area
      "Homagama", "Godagama", "Meegoda",
      // Kesbewa DS area
      "Kesbewa", "Piliyandala", "Bokundara",
      // Padukka / Seethawaka DS area
      "Padukka", "Hanwella", "Avissawella",
    ],
  },
  { province: "Western", district: "Gampaha", cities: ["Negombo", "Gampaha", "Ja-Ela", "Wattala", "Kelaniya", "Peliyagoda", "Kadawatha", "Ragama", "Minuwangoda", "Katunayake", "Nittambuwa", "Divulapitiya"] },
  { province: "Western", district: "Kalutara", cities: ["Kalutara", "Panadura", "Horana", "Beruwala", "Wadduwa", "Matugama"] },
  { province: "Central", district: "Kandy", cities: ["Kandy", "Peradeniya", "Katugastota", "Gampola", "Nawalapitiya", "Kundasale"] },
  { province: "Central", district: "Matale", cities: ["Matale", "Dambulla", "Galewela"] },
  { province: "Central", district: "Nuwara Eliya", cities: ["Nuwara Eliya", "Hatton", "Talawakele"] },
  { province: "Southern", district: "Galle", cities: ["Galle", "Unawatuna", "Hikkaduwa", "Ambalangoda", "Habaraduwa"] },
  { province: "Southern", district: "Matara", cities: ["Matara", "Weligama", "Akuressa"] },
  { province: "Southern", district: "Hambantota", cities: ["Hambantota", "Tangalle", "Tissamaharama"] },
  { province: "Northern", district: "Jaffna", cities: ["Jaffna", "Chavakachcheri", "Point Pedro"] },
  { province: "Eastern", district: "Trincomalee", cities: ["Trincomalee", "Kinniya"] },
  { province: "Eastern", district: "Batticaloa", cities: ["Batticaloa", "Kattankudy"] },
  { province: "Eastern", district: "Ampara", cities: ["Ampara", "Kalmunai"] },
  { province: "North Western", district: "Kurunegala", cities: ["Kurunegala", "Kuliyapitiya"] },
  { province: "North Western", district: "Puttalam", cities: ["Puttalam", "Chilaw", "Wennappuwa"] },
  { province: "Sabaragamuwa", district: "Kegalle", cities: ["Kegalle", "Mawanella"] },
  { province: "Sabaragamuwa", district: "Ratnapura", cities: ["Ratnapura", "Balangoda"] },
  { province: "Uva", district: "Badulla", cities: ["Badulla", "Bandarawela"] },
  { province: "Uva", district: "Monaragala", cities: ["Monaragala", "Wellawaya"] },
  { province: "North Central", district: "Anuradhapura", cities: ["Anuradhapura"] },
  { province: "North Central", district: "Polonnaruwa", cities: ["Polonnaruwa"] },
];

export const ALL_DISTRICTS = SRI_LANKA_GEOGRAPHY.map((d) => d.district);
export const ALL_CITIES = Array.from(new Set(SRI_LANKA_GEOGRAPHY.flatMap((d) => d.cities)));
export const ALL_PROVINCES = Array.from(new Set(SRI_LANKA_GEOGRAPHY.map((d) => d.province)));

// Every form a combined entry like "Colombo 5 (Havelock Town)" could be
// typed, stored or matched as: the full string, and each half on its own.
export function locationAliases(raw: string): string[] {
  const s = raw.trim().toLowerCase();
  if (!s) return [];
  const paren = s.match(/^(.+?)\s*\((.+)\)$/);
  return paren ? [s, paren[1].trim(), paren[2].trim()] : [s];
}

// Two location strings mean the same place if they're equal outright, or if
// one is the combined "Colombo 5 (Havelock Town)" form and the other is
// just one half of it — used everywhere a saved requirement/property
// location gets compared, not just autocomplete.
export function locationsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aliasesA = locationAliases(a);
  return locationAliases(b).some((x) => aliasesA.includes(x));
}

// Some Colombo entries carry both names at once, e.g. "Colombo 5 (Havelock
// Town)" — real listings and AI-extracted text usually say only one half
// ("Colombo 5" or just "Havelock Town"), so match either half too, not just
// the full combined string.
export function districtForCity(city: string): string | undefined {
  const needle = city.trim().toLowerCase();
  for (const d of SRI_LANKA_GEOGRAPHY) {
    for (const c of d.cities) {
      if (locationsMatch(c, needle)) return d.district;
    }
  }
  return undefined;
}

export const PROPERTY_SUBTYPES: Record<string, string[]> = {
  RESIDENTIAL: ["House", "Apartment", "Villa", "Luxury Residence", "Annexe", "Room", "Gated Community Home", "Holiday Home", "Development Project"],
  COMMERCIAL: ["Office", "Retail Space", "Commercial Building", "Showroom", "Restaurant", "Hotel", "Guesthouse", "Mixed-Use Development"],
  INDUSTRIAL_LOGISTICS: ["Warehouse", "Factory", "Cold Storage Facility", "Distribution Centre", "Yard", "Logistics Facility", "Industrial Land"],
  LAND_AGRICULTURE: ["Residential Land", "Commercial Land", "Industrial Land", "Agricultural Land", "Estate", "Plantation", "Development Land"],
};

export const FEATURE_FIELDS_BY_SUBTYPE: Record<string, string[]> = {
  Warehouse: ["clearHeight", "loadingBays", "containerAccess", "threePhaseElectricity", "floorLoading", "parking", "officeSpace", "washrooms", "fireApprovals", "generator", "security"],
  Factory: ["clearHeight", "threePhaseElectricity", "floorLoading", "effluentDisposal", "generator", "security"],
  "Cold Storage Facility": ["temperatureZones", "loadingBays", "backupPower", "containerAccess"],
  House: ["bedrooms", "bathrooms", "parking", "garden", "swimmingPool", "servantQuarters", "generator", "security"],
  Apartment: ["bedrooms", "bathrooms", "parking", "swimmingPool", "gym", "security", "elevator", "seaView"],
  Office: ["parking", "elevator", "backupPower", "centralAC", "meetingRooms", "security", "fireApprovals"],
  "Retail Space": ["frontage", "footfall", "parking", "signage"],
};

export const DEFAULT_FEATURES = ["parking", "security", "generator"];
