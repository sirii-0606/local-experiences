import type { MonumentData } from "./types";

export const MONUMENTS_DATA: Record<string, MonumentData> = {
  "hawa-mahal": {
    id: "hawa-mahal",
    name: "Hawa Mahal",
    hindiName: "हवा महल",
    tagline: "Palace of Winds — 953 Carved Casements & Stained Glass Breezeways",
    heroStory: "Built in 1799 by Maharaja Sawai Pratap Singh, this five-storey crown-shaped facade was designed by Lal Chand Ustad so royal women could observe bustling bazaar life and street festivals unseen from behind delicate stone jaali screens.",
    referenceImage: "/references3d/Hawa Mahal.jpeg",
    audioAtmosphere: "Bazaar hum, soft desert flute, morning pigeon wings",
    defaultCamera: {
      position: [0, 8, 38],
      lookAt: [0, 9, 0]
    },
    architectureHighlights: [
      "953 carved jharokha honeycomb windows",
      "Venturi effect natural cooling architecture",
      "Intricate Belgian stained-glass light refractions",
      "Crown-shaped pyramidal facade dedicated to Lord Krishna"
    ],
    hotspots: [
      {
        id: "hm-jharokha-central",
        title: "The Royal Jharokha (3rd Tier)",
        subTitle: "Venturi Air Channeling Casement",
        description: "Intricately carved pink sandstone screen with micro-openings that cool the scorching Thar summer air by up to 8°C through the Venturi pressure differential.",
        position: [0, 10, 1.2],
        cameraTarget: {
          position: [0, 10, 8],
          lookAt: [0, 10, 0]
        },
        details: {
          period: "1799 CE • Sawai Pratap Singh",
          artisanFact: "Each jaali screen was hand-chiseled from single blocks of pink Bansi Paharpur sandstone.",
          secretSpot: "Look through the middle casement at 4:30 PM for the golden light refraction across Sireh Deori Bazaar."
        },
        image: "/references3d/Hawa Mahal.jpeg"
      },
      {
        id: "hm-stained-glass",
        title: "Belgian Stained-Glass Chambers",
        subTitle: "Prism Light Refraction Hall",
        description: "Vibrant stained glass panes imported from 18th-century Europe. In the morning sun, they cast shimmering emerald, amber, and cobalt light patterns across the marble floors.",
        position: [-3.5, 6.5, 0.8],
        cameraTarget: {
          position: [-3.5, 7, 5],
          lookAt: [-3.5, 6.5, 0]
        },
        details: {
          period: "Ratan Mandir Floor",
          artisanFact: "Fitted without mortar using interlocking brass grooving to survive thermal expansion.",
          secretSpot: "Stand here at sunrise when red and yellow beams create a kaleidoscope effect."
        },
        image: "/references3d/Hawa Mahal.jpeg"
      },
      {
        id: "hm-crown-dome",
        title: "Hawa Mandir Krishna Crown",
        subTitle: "Top Tier Chhatri & Copper Finial",
        description: "The supreme fifth floor, dedicated to Lord Krishna, shaped as the god's mukut (crown) with ornate fluted chhatris and gilded kalash finials.",
        position: [0, 18, 0],
        cameraTarget: {
          position: [0, 19, 12],
          lookAt: [0, 17, 0]
        },
        details: {
          period: "Hawa Mandir",
          artisanFact: "The entire 5th floor is just one room wide with no stairs, accessible only via ramps.",
          secretSpot: "Offers a direct 360° line of sight across Jantar Mantar and City Palace Chandra Mahal."
        },
        image: "/references3d/Hawa Mahal.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-chandpole-veg",
        experienceId: "chandpole-morning",
        title: "Chandpole Morning Heritage Walk & Spices",
        category: "food",
        hostName: "Pt. Ramesh Sharma",
        rating: 4.9,
        priceInr: 650,
        durationMin: 90,
        position: [-18, 4.5, 8],
        shortBlurb: "Navigate sunrise alleys, taste fresh kachoris, and explore 150-year-old spice trading lanes.",
        image: "/references3d/Chandpole morning vegetable.jpeg",
        tag: "Heritage Walk"
      },
      {
        id: "exp-meena-cooking",
        experienceId: "meena-devi-cooking",
        title: "Rajasthani Home Cooking with Meena Devi",
        category: "culture",
        hostName: "Meena Devi & Family",
        rating: 5.0,
        priceInr: 1200,
        durationMin: 150,
        position: [18, 4.5, 8],
        shortBlurb: "Traditional wood-fired Dal Baati Churma masterclass inside a 200-year-old Brahmin haveli courtyard.",
        image: "/references3d/Rajasthani home cooking class with Meena Devi.jpeg",
        tag: "Culinary Masterclass"
      }
    ]
  },

  "amer-fort": {
    id: "amer-fort",
    name: "Amer Fort & Palace",
    hindiName: "आमेर क़िला",
    tagline: "Golden Ramparts over Maota Lake — Diwan-e-Aam & Sheesh Mahal",
    heroStory: "Perched high on the Cheel ka Teela (Hill of Eagles), Raja Man Singh I began construction of this formidable yet opulent Rajput-Mughal fortress in 1592, crowned by the mirrored wonder of Sheesh Mahal and serene Maota Lake.",
    referenceImage: "/references3d/Amer Fort.jpeg",
    audioAtmosphere: "Echoing palace corridors, distant shehnai melody, lake ripples",
    defaultCamera: {
      position: [0, 14, 45],
      lookAt: [0, 8, 0]
    },
    architectureHighlights: [
      "Diwan-e-Aam with 48 double-fluted red sandstone pillars",
      "Sheesh Mahal mirror mosaics that illuminate with a single diya",
      "Kesar Kyari (Saffron Garden) floating in Maota Lake",
      "Secret underground escape tunnel linking to Jaigarh Fort"
    ],
    hotspots: [
      {
        id: "amer-sheesh-mahal",
        title: "Sheesh Mahal (Hall of Mirrors)",
        subTitle: "Convex Glass Mosaic Pavilion",
        description: "Built with imported Belgian convex mirrors set into floral plaster relief. When a single candle is lit, thousands of reflections simulate a starry midnight sky.",
        position: [-6, 9, 2],
        cameraTarget: {
          position: [-6, 9.5, 9],
          lookAt: [-6, 9, 0]
        },
        details: {
          period: "1623 CE • Mirza Raja Jai Singh",
          artisanFact: "Mirrors were backed with silver foil and beaten tin to magnify flickering candlelight.",
          secretSpot: "The ceiling features a hidden peacock motif visible only when lit from a 45° angle."
        },
        image: "/references3d/Amer Fort.jpeg"
      },
      {
        id: "amer-diwan-aam",
        title: "Diwan-e-Aam (Hall of Public Audience)",
        subTitle: "Double-Pillared Sandstone Arcade",
        description: "A grand pavilion supported by 48 intricately carved red sandstone and cream marble pillars with elephant capital brackets.",
        position: [5, 6, 4],
        cameraTarget: {
          position: [5, 7, 12],
          lookAt: [5, 6, 0]
        },
        details: {
          period: "1592 CE • Raja Man Singh I",
          artisanFact: "The second-tier marble galleries allowed royal women to witness public hearings via marble lattices.",
          secretSpot: "The acoustic resonance allows a whisper from the central throne to reach the back corners."
        },
        image: "/references3d/Amer Fort.jpeg"
      },
      {
        id: "amer-maota-lake",
        title: "Maota Lake & Kesar Kyari",
        subTitle: "Floating Saffron Terraced Garden",
        description: "The jewel-like lake at the base of the fort featuring star-shaped Mughal garden beds designed for saffron cultivation.",
        position: [0, -2, 18],
        cameraTarget: {
          position: [0, 6, 28],
          lookAt: [0, 0, 10]
        },
        details: {
          period: "16th Century",
          artisanFact: "Engineered with ingenious sluice gates to capture rainwater runoff from surrounding hills.",
          secretSpot: "Best sunrise reflection view of Amer Fort ramparts in the calm morning water."
        },
        image: "/references3d/Amer Fort.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-balloon-amer",
        experienceId: "balloon-amer",
        title: "Sunrise Hot-Air Balloon over Amer Fort",
        category: "adventure",
        hostName: "Capt. Arvind Rathore",
        rating: 4.95,
        priceInr: 8500,
        durationMin: 60,
        position: [-16, 18, 5],
        shortBlurb: "Drift peacefully 1,000 feet above the Aravali peaks and 16th-century fortress ramparts at dawn.",
        image: "/references3d/Hot-air balloon over Amer at sunrise.jpeg",
        tag: "Aerial Adventure"
      },
      {
        id: "exp-stepwell-walk",
        experienceId: "amer-stepwell-lanes",
        title: "Amer Village Lanes & Stepwell Walk",
        category: "hidden-gem",
        hostName: "Gajendra Singh",
        rating: 4.88,
        priceInr: 750,
        durationMin: 120,
        position: [18, 1, 12],
        shortBlurb: "Explore forgotten stepwells, ancient Sun temples, and artisan block-printing havelis.",
        image: "/references3d/Amer village lanes & stepwell with a local host.jpeg",
        tag: "Heritage Walk"
      }
    ]
  },

  "panna-meena-stepwell": {
    id: "panna-meena-stepwell",
    name: "Panna Meena Ka Kund",
    hindiName: "पन्ना मीना का कुंड",
    tagline: "The Symmetrical Step-Labyrinth of 16th Century Rajasthan",
    heroStory: "An architectural wonder of water conservation and community gathering built in the 16th century. Its criss-crossing symmetrical yellow sandstone steps create an optical illusion where descending and ascending follow non-repeating paths.",
    referenceImage: "/references3d/Amer village lanes & stepwell with a local host.jpeg",
    audioAtmosphere: "Deep subterranean echo, water drops, temple chime",
    defaultCamera: {
      position: [0, 18, 30],
      lookAt: [0, -2, 0]
    },
    architectureHighlights: [
      "8-tier inverted stepped pyramid geometry",
      "Four corner octagonal viewing chhatris",
      "Ingenious rainwater harvesting aquifer basin",
      "Symmetrical zigzag masonry with zero mortar"
    ],
    hotspots: [
      {
        id: "stepwell-kund-basin",
        title: "Aquifer Water Basin",
        subTitle: "Subterranean Cool Reservoir",
        description: "Fed by natural aquifers and hill runoff, the water remains 10°C cooler than the ambient desert air, surrounded by moss-patinated sandstone.",
        position: [0, -6, 0],
        cameraTarget: {
          position: [0, 0, 10],
          lookAt: [0, -5, 0]
        },
        details: {
          period: "16th Century",
          artisanFact: "Engineered with step-trapezoids that reinforce the retaining walls against hydrostatic soil pressure.",
          secretSpot: "Notice the ancient Hindu deity carvings in the north-wall subterranean alcove."
        },
        image: "/references3d/Amer village lanes & stepwell with a local host.jpeg"
      },
      {
        id: "stepwell-chhatri",
        title: "Corner Pavilion Chhatri",
        subTitle: "Community Gathering Lookout",
        description: "Domed pillared pavilion where villagers, travelers, and women gathered in the shade during midday heat to exchange stories.",
        position: [10, 5, 10],
        cameraTarget: {
          position: [12, 7, 16],
          lookAt: [8, 4, 8]
        },
        details: {
          period: "1550 CE",
          artisanFact: "Features floral brackets chiseled by Meena community stonemasons.",
          secretSpot: "The highest vantage point for capturing the geometric diamond shadow patterns at noon."
        },
        image: "/references3d/Amer village lanes & stepwell with a local host.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-artisan-pottery",
        experienceId: "blue-pottery-workshop",
        title: "Amer Master Artisan Blue Pottery Studio",
        category: "craft",
        hostName: "Kripal Kumbh Studio",
        rating: 4.92,
        priceInr: 950,
        durationMin: 120,
        position: [-14, 2, 8],
        shortBlurb: "Shape and glaze authentic quartz-powder blue pottery with master craftsmen.",
        image: "/references3d/Amer village lanes & stepwell with a local host.jpeg",
        tag: "Artisan Craft"
      }
    ]
  },

  "jantar-mantar": {
    id: "jantar-mantar",
    name: "Jantar Mantar",
    hindiName: "जंतर मंतर",
    tagline: "The World's Largest Stone Astronomical Observatory",
    heroStory: "Completed in 1734 by astronomer-king Maharaja Sawai Jai Singh II, this UNESCO World Heritage monument features 19 monumental stone architectural instruments designed to measure time, track celestial bodies, and predict eclipses with breathtaking precision.",
    referenceImage: "/references3d/Jantar Mantar.jpeg",
    audioAtmosphere: "Quiet desert breeze, ticking cosmic pulse, distant gong",
    defaultCamera: {
      position: [0, 16, 42],
      lookAt: [0, 6, 0]
    },
    architectureHighlights: [
      "Vrihat Samrat Yantra: 27m high sundial accurate to 2 seconds",
      "Jai Prakash Yantra: Inverted marble hemispherical celestial bowls",
      "Rama Yantra: Vertical cylindrical dials for azimuth and altitude",
      "Pure geometric marble-inlaid local stone construction"
    ],
    hotspots: [
      {
        id: "jm-samrat-yantra",
        title: "Vrihat Samrat Yantra",
        subTitle: "Giant Supreme Sundial (27 Meters High)",
        description: "The world's largest sundial. Its triangular gnomon casts a shadow that moves at 1 millimeter per second across graduated marble quadrant arcs.",
        position: [0, 8, -5],
        cameraTarget: {
          position: [6, 12, 14],
          lookAt: [0, 8, -2]
        },
        details: {
          period: "1734 CE • Sawai Jai Singh II",
          artisanFact: "Calculated with exact 26° 55' inclination corresponding precisely to Jaipur's latitude.",
          secretSpot: "Watch the shadow move in real-time across the 2-second calibrated markings."
        },
        image: "/references3d/Jantar Mantar.jpeg"
      },
      {
        id: "jm-jai-prakash",
        title: "Jai Prakash Yantra",
        subTitle: "Hemispherical Celestial Bowls",
        description: "Two complementary hollow marble bowls reflecting the celestial sphere, allowing astronomers to step inside to sight planetary coordinates.",
        position: [-10, 1, 6],
        cameraTarget: {
          position: [-10, 5, 14],
          lookAt: [-10, 1, 6]
        },
        details: {
          period: "1734 CE",
          artisanFact: "Constructed with alternating stone and open pathways so observers could walk inside without obstruction.",
          secretSpot: "At the vernal equinox, the shadow aligns directly through the center cross-wire."
        },
        image: "/references3d/Jantar Mantar.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-city-palace",
        experienceId: "city-palace-secrets",
        title: "City Palace Royal Quarters & Private Collections",
        category: "culture",
        hostName: "Raghavendra Singh (Heritage Historian)",
        rating: 4.96,
        priceInr: 2500,
        durationMin: 150,
        position: [14, 2, 4],
        shortBlurb: "Exclusive access to Chandra Mahal suites, gilded miniature galleries, and royal armory.",
        image: "/references3d/City Palace museum.webp",
        tag: "Royal Heritage"
      }
    ]
  },

  "albert-hall": {
    id: "albert-hall",
    name: "Albert Hall Museum",
    hindiName: "अल्बर्ट हॉल संग्रहालय",
    tagline: "Indo-Saracenic Masterpiece & Evening Pigeon Sanctuary",
    heroStory: "Designed by Sir Samuel Swinton Jacob and opened in 1887, this museum is the oldest in Rajasthan. Its towering arches, ornate stone minarets, and evening illumination make it the glowing cultural epicenter of Ram Niwas Garden.",
    referenceImage: "/references3d/Albert Hall.jpeg",
    audioAtmosphere: "Pigeon flutter wings, evening street violin, garden breeze",
    defaultCamera: {
      position: [0, 12, 38],
      lookAt: [0, 7, 0]
    },
    architectureHighlights: [
      "Indo-Saracenic blend of Rajput, Islamic, and European Gothic motifs",
      "Carved stone jharokhas with intricate floral archways",
      "Night illumination featuring 16-million color dynamic floodlighting",
      "Home to historical Persian carpets, Egyptian mummies, and brassware"
    ],
    hotspots: [
      {
        id: "ah-central-dome",
        title: "Grand Indo-Saracenic Main Dome",
        subTitle: "Layered Chhatri & Gothic Cornices",
        description: "The central bulbous dome crowned by Rajput chhatris, demonstrating the seamless fusion of Hindu and Islamic decorative elements.",
        position: [0, 12, 0],
        cameraTarget: {
          position: [0, 14, 12],
          lookAt: [0, 11, 0]
        },
        details: {
          period: "1887 CE • Samuel Swinton Jacob",
          artisanFact: "Local stone carvers from Jaipur crafted all motifs based on miniature paintings from the royal court.",
          secretSpot: "Look closely at the carved brackets to spot motifs representing different dynasties of India."
        },
        image: "/references3d/Albert Hall.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-jkk-folk",
        experienceId: "jkk-folk-music",
        title: "Rajasthani Folk Music & Sarangi Evening at JKK",
        category: "culture",
        hostName: "Langa & Manganiyar Troupe",
        rating: 4.97,
        priceInr: 800,
        durationMin: 120,
        position: [14, 1, 10],
        shortBlurb: "Soul-stirring Sarangi, Kamaycha, and Khartal performances under the starlit open-air amphitheater.",
        image: "/references3d/Rajasthani folk music evening at JKK.jpeg",
        tag: "Live Music"
      }
    ]
  },

  "nahargarh-fort": {
    id: "nahargarh-fort",
    name: "Nahargarh Fort & Padao",
    hindiName: "नाहरगढ़ क़िला",
    tagline: "The Tiger's Abode — Sunset Panorama Over the Pink City Grid",
    heroStory: "Built in 1734 by Maharaja Sawai Jai Singh on the edge of the Aravali hills, Nahargarh (Abode of Tigers) stands as a protective sentinel overlooking the entire grid layout of Jaipur, world-renowned for its sunset vistas.",
    referenceImage: "/references3d/Nahargarh Fort.jpeg",
    audioAtmosphere: "High cliff wind, evening temple conch, twilight distant city murmur",
    defaultCamera: {
      position: [0, 14, 40],
      lookAt: [0, 6, 0]
    },
    architectureHighlights: [
      "Madhavendra Bhawan: 9 identical suites for royal queens with exquisite frescoes",
      "Padao Sunset Viewpoint with 180° panoramic view of Jaipur",
      "Stepped water storage reservoirs carved directly into bedrock",
      "Defensive perimeter wall stretching over 12 kilometers"
    ],
    hotspots: [
      {
        id: "nh-sunset-point",
        title: "Padao Cliff Sunset Ridge",
        subTitle: "180° Pink City Panoramic Vista",
        description: "The highest accessible fortress cliff edge in Jaipur. At golden hour, the setting sun casts a fiery amber glow across the entire city grid below.",
        position: [-6, 6, 8],
        cameraTarget: {
          position: [-6, 8, 16],
          lookAt: [-6, 6, 4]
        },
        details: {
          period: "1734 CE",
          artisanFact: "Built on sacred ground once associated with the spirit of prince Nahar Singh Bhomia.",
          secretSpot: "Watch the street grid of Old Jaipur illuminate in geometric yellow lines right at twilight."
        },
        image: "/references3d/Nahargarh Fort.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-jhalana-safari",
        experienceId: "jhalana-safari",
        title: "Jhalana Leopard Reserve Sunset Safari",
        category: "adventure",
        hostName: "Naturalist Devendra Shekhawat",
        rating: 4.93,
        priceInr: 3200,
        durationMin: 180,
        position: [16, 2, 8],
        shortBlurb: "Open 4x4 Gypsy tracking wild Indian leopards across ancient Aravali dry deciduous forest.",
        image: "/references3d/Jhalana leopard safari.jpeg",
        tag: "Wildlife Safari"
      }
    ]
  },

  "galta-ji": {
    id: "galta-ji",
    name: "Galta Ji & Monkey Valley",
    hindiName: "गलता जी तीर्थ",
    tagline: "Sacred Natural Springs & Sunset Aarti in Mountain Gorge",
    heroStory: "An ancient Hindu pilgrimage site nestled within a narrow mountain gorge in the Aravali hills. Renowned for its natural freshwater springs (*kunds*), sacred pavilions, resident macaque monkeys, and mesmerizing evening aarti ceremonies.",
    referenceImage: "/references3d/Sunset aarti Galta Ji.jpeg",
    audioAtmosphere: "Sanskrit chants, evening bell chimes, spring water rush, chanting chorus",
    defaultCamera: {
      position: [0, 12, 36],
      lookAt: [0, 6, 0]
    },
    architectureHighlights: [
      "Natural spring-fed sacred tanks (Galta Kund) that never dry up",
      "Pavilions with delicate frescoes depicting Krishna Leela and Ramayana",
      "Surya Mandir perched at the mountain crest overlooking Jaipur",
      "Gorge stone architecture carved directly between two rocky ridges"
    ],
    hotspots: [
      {
        id: "gj-aarti-kund",
        title: "Sacred Galta Kund & Sunset Aarti",
        subTitle: "Evening Brass Lamp Ceremony",
        description: "At dusk, priests perform the grand Maha Aarti with multi-tiered brass lamps (diyas), incense smoke, and resonant conch shells echoing off the cliff walls.",
        position: [0, 4, 2],
        cameraTarget: {
          position: [0, 6, 12],
          lookAt: [0, 4, 0]
        },
        details: {
          period: "Early 16th Century • Payohari Swami",
          artisanFact: "The natural spring flows through a carved cow's head (Gomukh) before entering the sacred tanks.",
          secretSpot: "Climb the steps to the Surya Mandir during evening aarti for the setting sun aligning with the temple spire."
        },
        image: "/references3d/Sunset aarti Galta Ji.jpeg"
      }
    ],
    nearbyExperiences: [
      {
        id: "exp-sunset-aarti",
        experienceId: "galta-ji-sunset-aarti",
        title: "Sacred Mountain Pass Walk & Sunset Aarti",
        category: "culture",
        hostName: "Priest Vidyadhar Shastri",
        rating: 4.95,
        priceInr: 500,
        durationMin: 90,
        position: [-12, 2, 8],
        shortBlurb: "Experience the sacred evening blessing, mountain hike, and witness wild rhesus macaques at play.",
        image: "/references3d/Sunset aarti Galta Ji.jpeg",
        tag: "Spiritual Experience"
      }
    ]
  }
};
