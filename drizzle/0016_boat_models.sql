-- First-party boat make/model catalog for the /quote wizard's "type your
-- boat" search. No free/public boat-specs API is viable for anonymous public
-- traffic (checked 2026-08-28: VehDB requires a paid key, Marinebase is
-- sailboat-only private beta), so this is a self-owned, employee-editable
-- substitute seeded with common real models. Falls back to the manual
-- boat-type picker in the wizard when nothing matches.

CREATE TABLE "boat_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "make" text NOT NULL,
  "model" text NOT NULL,
  "boat_type_key" text NOT NULL,
  "length_ft" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "quote_requests" ADD COLUMN "boat_model_id" uuid REFERENCES "boat_models"("id") ON DELETE SET NULL;

INSERT INTO "boat_models" ("make", "model", "boat_type_key", "length_ft") VALUES
  -- Bowrider / ski boats
  ('Sea Ray', 'SPX 190', 'bowrider', 19),
  ('Sea Ray', 'SPX 230', 'bowrider', 23),
  ('Chaparral', '21 SSi', 'bowrider', 21),
  ('Chaparral', '246 SSi', 'bowrider', 25),
  ('Cobalt', 'R3', 'bowrider', 20),
  ('Cobalt', 'R5', 'bowrider', 24),
  ('Bayliner', 'VR5', 'bowrider', 20),
  ('Bayliner', 'VR6', 'bowrider', 21),
  ('Four Winns', 'H2 SL', 'bowrider', 20),
  ('Crownline', '255 SS', 'bowrider', 26),
  ('Regal', 'LS4', 'bowrider', 22),
  ('Larson', 'LX 250', 'bowrider', 25),
  ('Starcraft', 'MDX 231', 'bowrider', 23),
  ('Glastron', 'GTD 245', 'bowrider', 25),

  -- Wakeboard / wake surf boats
  ('Malibu', 'Wakesetter 23 LSV', 'wakeboard', 23),
  ('MasterCraft', 'X24', 'wakeboard', 24),
  ('MasterCraft', 'XT23', 'wakeboard', 23),
  ('Nautique', 'G23', 'wakeboard', 23),
  ('Nautique', 'GS22', 'wakeboard', 22),
  ('Axis', 'A24', 'wakeboard', 24),
  ('Centurion', 'Ri245', 'wakeboard', 24),
  ('Yamaha', '242X', 'wakeboard', 24),
  ('Supra', 'SA 24', 'wakeboard', 24),
  ('Moomba', 'Mondo', 'wakeboard', 22),

  -- Deck boats
  ('Hurricane', 'SunDeck 2400', 'deck_boat', 24),
  ('Sea Ray', '220 Sundeck', 'deck_boat', 22),
  ('Crownline', 'E25 XS', 'deck_boat', 25),
  ('Godfrey', 'Aqua Patio 235', 'deck_boat', 23),

  -- Pontoon / tritoon
  ('Bennington', '20 SSBX', 'pontoon', 20),
  ('Bennington', '22 SVL', 'pontoon', 22),
  ('Bennington', '24 QXFB', 'pontoon', 24),
  ('Harris', 'Cruiser 220', 'pontoon', 22),
  ('Sun Tracker', 'Bass Buggy 18', 'pontoon', 18),
  ('Sun Tracker', 'Party Barge 22', 'pontoon', 22),
  ('Godfrey', 'Sweetwater 2286', 'pontoon', 22),
  ('Avalon', 'LSZ Quad Lounge 25', 'pontoon', 25),
  ('Manitou', 'Aurora LE', 'pontoon', 24),
  ('South Bay', '522CR', 'pontoon', 22),

  -- Center console
  ('Boston Whaler', '210 Montauk', 'center_console', 21),
  ('Boston Whaler', '250 Dauntless', 'center_console', 25),
  ('Pursuit', 'S 268 Sport', 'center_console', 26),
  ('Robalo', 'R242', 'center_console', 24),
  ('Key West', '239 FS', 'center_console', 23),
  ('Everglades', '243cc', 'center_console', 24),
  ('Contender', '25 Open', 'center_console', 25),

  -- Cuddy cabin
  ('Grady-White', '251 Coastal Explorer', 'cuddy_cabin', 25),
  ('Rinker', '246 Captiva Cuddy', 'cuddy_cabin', 25),
  ('Chaparral', '250 Signature Cuddy', 'cuddy_cabin', 25),
  ('Sailfish', '275 DC', 'cuddy_cabin', 27),
  ('Cutwater', '24', 'cuddy_cabin', 24),
  ('Cobalt', '253 CD', 'cuddy_cabin', 25),

  -- Express cruiser / cabin cruiser
  ('Sea Ray', 'Sundancer 260', 'express_cruiser', 26),
  ('Sea Ray', 'Sundancer 320', 'express_cruiser', 32),
  ('Sea Ray', 'Sundancer 400', 'express_cruiser', 40),
  ('Chaparral', 'Signature 350', 'express_cruiser', 35),
  ('Formula', '350 CBR', 'express_cruiser', 35),
  ('Cruisers Yachts', '338 South Beach', 'express_cruiser', 34),
  ('Regal', '42 GS', 'express_cruiser', 42),
  ('Tiara', '3800 Coronet', 'express_cruiser', 38),
  ('Monterey', '335 Sport Yacht', 'express_cruiser', 34),

  -- Sport fisherman / flybridge
  ('Viking', '38 Convertible', 'sport_fisherman', 38),
  ('Viking', '42 Convertible', 'sport_fisherman', 42),
  ('Riviera', '445 SUV', 'sport_fisherman', 45),
  ('Hatteras', '45 Convertible', 'sport_fisherman', 45),
  ('Bertram', '35 Convertible', 'sport_fisherman', 35),
  ('Ocean Yachts', '46 Convertible', 'sport_fisherman', 46),
  ('Post', '42 Convertible', 'sport_fisherman', 42),

  -- Sailboats
  ('Catalina', '22', 'sailboat', 22),
  ('Catalina', '275', 'sailboat', 27),
  ('Catalina', '30', 'sailboat', 30),
  ('Hunter', '33', 'sailboat', 33),
  ('Beneteau', 'Oceanis 30.1', 'sailboat', 30),
  ('Beneteau', 'First 24', 'sailboat', 24),
  ('J Boats', 'J/24', 'sailboat', 24),
  ('J Boats', 'J/105', 'sailboat', 34),
  ('MacGregor', '26', 'sailboat', 26),

  -- Aluminum fishing / jon boats
  ('Lund', 'Jon Boat 1648', 'jon_boat', 16),
  ('Lund', 'Alaskan 1600', 'jon_boat', 16),
  ('Tracker', 'Grizzly 1648', 'jon_boat', 16),
  ('Alumacraft', 'Competitor 165', 'jon_boat', 16),
  ('G3', 'Jon 1656', 'jon_boat', 16),
  ('War Eagle', '754 LDV', 'jon_boat', 17),
  ('Xpress', 'XP7', 'jon_boat', 17);
