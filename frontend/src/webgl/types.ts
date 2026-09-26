export type MonumentId = 
  | "hawa-mahal" 
  | "amer-fort" 
  | "panna-meena-stepwell" 
  | "jantar-mantar" 
  | "albert-hall" 
  | "nahargarh-fort" 
  | "galta-ji";

export type TimeOfDay = "dawn" | "golden-hour" | "midday" | "sunset" | "night";

export interface ArchitecturalHotspot {
  id: string;
  title: string;
  subTitle: string;
  description: string;
  position: [number, number, number];
  cameraTarget: {
    position: [number, number, number];
    lookAt: [number, number, number];
  };
  details: {
    period: string;
    artisanFact: string;
    secretSpot: string;
  };
  image?: string;
  audioLabel?: string;
}

export interface SpatialExperienceMarker {
  id: string;
  experienceId: string;
  title: string;
  category: "food" | "craft" | "culture" | "hidden-gem" | "adventure";
  hostName: string;
  rating: number;
  priceInr: number;
  durationMin: number;
  position: [number, number, number];
  shortBlurb: string;
  image: string;
  tag: string;
}

export interface MonumentData {
  id: MonumentId;
  name: string;
  hindiName: string;
  tagline: string;
  heroStory: string;
  defaultCamera: {
    position: [number, number, number];
    lookAt: [number, number, number];
  };
  hotspots: ArchitecturalHotspot[];
  nearbyExperiences: SpatialExperienceMarker[];
  referenceImage: string;
  audioAtmosphere: string;
  architectureHighlights: string[];
}
