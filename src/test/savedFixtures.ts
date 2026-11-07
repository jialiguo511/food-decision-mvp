import type { CookRecommendation, NearbyRecommendation } from "@/lib/types";

export const recipe = (o: Partial<CookRecommendation> = {}): CookRecommendation => ({
  decision_mode: "cook",
  role: "best_match",
  title: "Peanut Noodle Bowl",
  reason: "Quick and filling.",
  estimated_minutes: 20,
  estimated_meal_cost_usd: 6,
  estimated_extra_cost_usd: 2,
  estimated_calories: 550,
  estimated_protein_g: 30,
  watch: null,
  ingredients_on_hand: ["Noodles", "Soy sauce"],
  ingredients_needed: ["Peanut butter", "Scallions"],
  equipment: ["Pot"],
  steps: ["Boil the noodles.", "Whisk the sauce.", "Toss together."],
  inventory_note: null,
  image_query: "peanut noodle bowl",
  ...o,
});

export const place = (o: Partial<NearbyRecommendation> = {}): NearbyRecommendation => ({
  decision_mode: "nearby",
  role: "best_match",
  title: "Mediterranean Grill",
  place_id: "ChIJ-1",
  reason: "Close by.",
  look_for: "A grilled chicken and rice bowl, sauce on the side.",
  category: "Mediterranean restaurant",
  address: "1 Main St",
  distance_m: 400,
  open_now: true,
  price_level: "moderate",
  maps_url: "https://maps.example/1",
  website_url: "https://grill.example/",
  ...o,
});
