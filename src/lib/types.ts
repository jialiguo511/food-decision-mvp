// Shared types. The LLM prompt and the UI both speak this vocabulary.

export type Goal = "fat_loss" | "muscle_gain" | "maintain" | "general_health";
export type FridgeSize = "mini" | "standard" | "large";
export type Hunger = "light" | "normal" | "very_hungry";
export type Effort = "minimal" | "some" | "happy_to_cook";

/** A row in public.profiles. */
export type Profile = {
  id: string;
  display_name: string | null;
  goal: Goal;
  protein_target_g: number;
  /** Optional, entered manually. null = no target; recommendations fall back
   *  to qualitative energy guidance. */
  daily_calorie_target_kcal: number | null;
  budget_per_meal_usd: number;
  fridge_size: FridgeSize;
  default_cook_minutes: number;
  cuisines: string[];
  dislikes: string[];
  equipment: string[];
  prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** What the profile form sends back. No id — that comes from the session. */
export type ProfileInput = Omit<
  Profile,
  "id" | "created_at" | "updated_at" | "prefs"
>;

/**
 * The first-level choice on Today: cook something, decide what to order, or
 * grab a snack/dessert from a nearby store. All three share the same profile,
 * the "exactly 3 recommendations" principle, selection, and actual-eating
 * feedback — only the dynamic context and the shape of what comes back
 * differ. See PRODUCT.md → "Two decision modes" (store_snack is the third).
 */
export type DecisionMode = "cook" | "order" | "store_snack";

/** Whether the user is willing to buy anything tonight. The explicit signal
 *  for inventory-only cooking — see CookConstraints.no_shopping — rather than
 *  inferring that purely from a $0 budget. */
export type CookShopping = "inventory_only" | "can_buy";

/** The dynamic context captured on Today for the "I can cook" flow. */
export type MealContext = {
  decision_mode: "cook";
  cook_minutes: number;
  hunger: Hunger;
  effort: Effort;
  shopping: CookShopping;
  /** A preset from COMMON_CRAVINGS, something the user typed, or null. */
  craving: string | null;
  ingredients_on_hand: string[];
  /** Maximum additional spend, never money the meal is expected to use.
   *  null means "use the budget from my profile". Ignored (forced to 0) when
   *  shopping is "inventory_only". */
  budget_override_usd: number | null;
  /** Set only by the "Show me what to buy" fallback after a thin or empty
   *  "Use what I have" result. Means: shopping is allowed, and the goal is the
   *  smallest possible purchase (ideally 1–3 items) that turns what the user
   *  has into a good meal — not a generic grocery run. Absent/false otherwise.
   *  Ignored when shopping is "inventory_only". */
  minimize_purchases?: boolean;
};

export type OrderMethod = "delivery" | "pickup" | "eat_nearby";

/** Approximate TOTAL food budget for one eat-out meal, as a coarse band the
 *  user taps. Deliberately not a number and not the same thing as Cook's
 *  `budget_override_usd`, which caps only the EXTRA money spent on missing
 *  ingredients (food already owned is free). Never reuse one for the other. */
export type MealBudget = "under_15" | "15_to_25" | "25_to_40" | "no_preference";
/** A preset from ORDER_CRAVINGS. Coarser than the cook flow's free-text
 *  craving — see options.ts for why: ordering asks for very little effort. */
export type OrderCravingCategory =
  | "meaty"
  | "warm_comforting"
  | "fresh_light"
  | "sweet"
  | "no_preference";

/** The dynamic context captured on Today for the "I want to order food"
 *  flow. Deliberately smaller than MealContext — only what materially
 *  changes the recommendation. Goal, protein target, and dislikes come from
 *  the profile, the same as cooking. */
export type OrderContext = {
  decision_mode: "order";
  hunger: Hunger;
  craving_category: OrderCravingCategory;
  /** Optional elaboration beyond the category, e.g. "fried chicken". Craving
   *  is one of the few fields free text is allowed for — see CLAUDE.md. */
  craving_note: string | null;
  method: OrderMethod;
  /** What the user wants to spend on this whole meal — see MealBudget. A soft
   *  feasibility signal for both the category flow and nearby; no restaurant
   *  data here can prove a meal fits, so it only ever ranks. */
  meal_budget: MealBudget;
  /** True when this request asked for real nearby places ("Find food near
   *  me") instead of food categories. Only ever a flag: the user's
   *  coordinates are sent with the request and never stored here or anywhere
   *  else — see PRODUCT.md → "Eat out — nearby" → Privacy. Absent/false for
   *  the existing category flow and for sessions saved before it existed. */
  nearby?: boolean;
};

/** A preset from STORE_SNACK_CRAVINGS — see options.ts. Coarser than the cook
 *  flow's free-text craving: this mode is deliberately a single tap. */
export type CravingType = "sweet" | "salty" | "crunchy" | "creamy" | "anything";

/** The dynamic context captured on Today for the "grab a snack" flow —
 *  deliberately the smallest of the three: no store, location, or inventory
 *  data exists behind this product, so there is nothing else to ask. Goal,
 *  protein target, and dislikes come from the profile, same as the other
 *  modes. */
export type StoreSnackContext = {
  decision_mode: "store_snack";
  hunger: Hunger;
  craving_type: CravingType;
};

/** Any of Today's three dynamic contexts, discriminated on decision_mode. */
export type DecisionContext = MealContext | OrderContext | StoreSnackContext;

export type RecommendationRole = "best_match" | "lowest_effort" | "alternative";

/** One of the exactly-three recommendations for the "I can cook" flow.
 *  Every number is an estimate; costs in particular are model guesses with
 *  no grocery-price data behind them. */
export type CookRecommendation = {
  decision_mode: "cook";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits tonight. */
  reason: string;
  estimated_minutes: number;
  /** Approximate value of all ingredients eaten, including ones already owned. */
  estimated_meal_cost_usd: number;
  /** Approximate money to spend tonight on missing ingredients. The budget
   *  constraint applies to this one. Can exceed meal cost (a whole bottle of
   *  soy sauce costs more than the splash the meal uses). */
  estimated_extra_cost_usd: number;
  estimated_calories: number;
  estimated_protein_g: number;
  ingredients_on_hand: string[];
  ingredients_needed: string[];
  equipment: string[];
  steps: string[];
  /** Only ever set in "Use what I have" mode, when what's available can't
   *  reasonably make a satisfying full meal — one short user-facing sentence
   *  saying so. Null otherwise (and on sessions saved before this field
   *  existed). */
  inventory_note: string | null;
  /** Dish + key ingredients for image lookup, e.g. "chicken spinach rice
   *  bowl" — never a URL or anything else image-related from the model. See
   *  PLAN.md → NEXT → "Recipe visualization". Cook-only for now: order and
   *  store-snack recommendations will likely need a different image source
   *  (a menu photo, a product photo) rather than sharing this contract.
   *  Nullable for sessions saved before this field existed. */
  image_query: string | null;
};

/** One of the exactly-three recommendations for the "I want to order food"
 *  flow. A meal *category*, not a recipe: no steps, no ingredients, no
 *  equipment. No cost fields either — there is no real menu-price data
 *  behind them, unlike the cook flow's ingredient-cost estimates. */
export type OrderRecommendation = {
  decision_mode: "order";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits right now. */
  reason: string;
  /** What to type into whatever delivery/takeout app the user already has.
   *  Plain food descriptions, never a restaurant name — no restaurant data
   *  exists behind this product. */
  search_terms: string[];
  /** The suggested order in plain language: protein, sides, extras, sauce. */
  order_notes: string;
  /** Optional, and only when it genuinely helps — one realistic tweak, never
   *  a list of prohibitions. See PRODUCT.md → "Order Food" coaching
   *  philosophy: this is harm reduction, not diet enforcement. */
  modification: string | null;
  estimated_calories: number;
  estimated_protein_g: number;
};

/** One of the exactly-three recommendations for the "grab a snack" flow — a
 *  ready-to-buy item, not a recipe or a search term for a delivery app. No
 *  cost fields: there is no real grocery-price data behind this product,
 *  same reasoning as the order flow's missing menu prices. */
export type StoreSnackRecommendation = {
  decision_mode: "store_snack";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits the craving right now. */
  reason: string;
  /** Guidance for walking around a grocery/convenience/drug store — a
   *  category and rough spec ("single-serve Greek yogurt with 12–20g
   *  protein"), never an exact SKU or a claim about live inventory. */
  what_to_look_for: string;
  /** Optional second option if the first isn't found. Null when there's no
   *  natural substitute worth naming. */
  backup: string | null;
  estimated_calories: number;
  estimated_protein_g: number;
};

/** How much the provider says a place costs, coarsest possible. Only set when
 *  the provider actually returned one — never inferred. */
export type PlacePriceLevel = "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";

/** One of up to three recommendations for "Find food near me": a real place
 *  from that request's provider results, never a model invention. The model
 *  supplies only `place_id`, `reason`, and `look_for`; every other field is
 *  copied from the provider's candidate server-side (see output.ts), so the
 *  UI never renders a place name the model made up.
 *
 *  Deliberately has no menu-item, price, calorie, or protein fields: a places
 *  provider is not a menu database. `look_for` is a *strategy* ("a grilled
 *  chicken or rice-bowl style option"), never a claim that an item exists.
 *  `decision_mode: "nearby"` exists only at this level — the session's
 *  context stays `decision_mode: "order"` with `nearby: true`. */
export type NearbyRecommendation = {
  decision_mode: "nearby";
  role: RecommendationRole;
  /** The place's name. Named `title` like every other recommendation so
   *  generic code (feedback, previous-set exclusions) needs no special case. */
  title: string;
  place_id: string;
  /** One or two user-facing sentences on why this place fits right now. */
  reason: string;
  /** What kind of food to look for there. Guidance, not a menu claim. */
  look_for: string;
  /** The provider's short type label, e.g. "Mediterranean restaurant". */
  category: string | null;
  address: string | null;
  /** Approximate straight-line distance from where the user was when they
   *  searched, in meters, rounded. Never routing/walking time. Null when it
   *  couldn't be computed. */
  distance_m: number | null;
  /** true = the provider says it is open now; null = unknown. (Places known
   *  to be closed are removed before ranking, so never false here.) */
  open_now: boolean | null;
  price_level: PlacePriceLevel | null;
  /** https link that opens this exact place in Google Maps. */
  maps_url: string;
};

export type Recommendation =
  | CookRecommendation
  | OrderRecommendation
  | StoreSnackRecommendation
  | NearbyRecommendation;

/** The constraints a cook recommendation set was generated under, echoed back
 *  so the caller can see which budget and equipment were actually applied. */
export type CookConstraints = {
  decision_mode: "cook";
  max_minutes: number;
  /** Maximum additional spend tonight — never an amount the meal is expected
   *  to use. Forced to 0 when no_shopping is true, regardless of any override
   *  or profile default. */
  budget_usd: number;
  budget_source: "profile" | "override";
  equipment: string[];
  no_cooking: boolean;
  /** True when the user chose "Use what I have" — every recommendation must
   *  need zero additional purchases, not merely stay under a low budget. */
  no_shopping: boolean;
  avoid: string[];
};

/** The constraints an order recommendation set was generated under. Ordering
 *  has no real time/budget/equipment limits to enforce — the only hard
 *  constraint is what the user won't eat. */
export type OrderConstraints = {
  decision_mode: "order";
  avoid: string[];
};

/** The constraints a store-snack recommendation set was generated under. Like
 *  ordering, there is no time/budget/equipment limit to enforce — only what
 *  the user won't eat. */
export type StoreSnackConstraints = {
  decision_mode: "store_snack";
  avoid: string[];
};

/** The hard constraints a nearby-places recommendation set was generated
 *  under: none carried today. Hard constraints are allergies and dietary
 *  restrictions (PRODUCT.md → "Hard constraints vs. soft preferences"), and
 *  the Profile has no such field yet — that is a separate NOW item in
 *  PLAN.md. Disliked foods are soft preferences, so they are deliberately NOT
 *  here; they travel as `soft_preferences.disliked_foods`. When the dedicated
 *  field exists, it becomes a member of this type. */
export type NearbyConstraints = {
  decision_mode: "nearby";
};

export type ActiveConstraints = CookConstraints | OrderConstraints | StoreSnackConstraints | NearbyConstraints;

/** Body of a successful POST /api/recommend. Exactly three — except in cook
 *  mode with no_shopping ("Use what I have"), where the user's current foods
 *  and Kitchen staples may support fewer, down to zero (insufficient_inventory
 *  becomes true), and inventing missing ingredients to reach three is the
 *  bug this exception exists to prevent. */
export type RecommendSuccess = {
  recommendations: Recommendation[];
  /** True only for strict "Use what I have" (cook, no_shopping) with zero
   *  recommendations: the user's current foods and Kitchen staples don't
   *  reasonably add up to a meal. Always false otherwise. Not persisted on
   *  the decision_sessions row — a restored empty session shows a generic
   *  version of this same message instead. */
  insufficient_inventory: boolean;
  nutrition_is_estimate: true;
  constraints: ActiveConstraints;
  model: string;
  /** The decision_sessions row this set was stored under. Selecting a
   *  recommendation writes chosen_index back onto this same row. */
  session_id: string;
};

export type RecommendErrorCode =
  | "llm_not_configured"
  | "places_not_configured"
  | "places_unavailable"
  | "invalid_location"
  | "unauthenticated"
  | "invalid_context"
  | "profile_unavailable"
  | "malformed_output"
  | "constraint_violation"
  | "model_refused"
  | "truncated_output"
  | "rate_limited"
  | "upstream_timeout"
  | "upstream_error"
  | "session_save_failed";

export type RecommendFailure = {
  error: { code: RecommendErrorCode; message: string; details?: string[] };
};

/** Raised in the browser, before any request, when the device can't give us a
 *  location. Never sent by the server. */
export type LocationErrorCode =
  | "location_unsupported"
  | "location_denied"
  | "location_unavailable"
  | "location_timeout";

/** What Today's UI shows for a failed request: a server failure or a
 *  browser-side location failure. */
export type RecommendUiError = {
  code: RecommendErrorCode | LocationErrorCode;
  message: string;
  details?: string[];
};

/** A location for one nearby search. Held in memory for the request only. */
export type SearchLocation = { latitude: number; longitude: number };

/** The part of a decision_sessions row Today needs to resume the flow: which
 *  context produced which three recommendations, and where to write
 *  chosen_index. Deliberately excludes chosen_index itself — that maps to UI
 *  selection state, not the identity of the recommendation set — and excludes
 *  model/constraints, which are not persisted on the row. Used both for a
 *  freshly generated set and for one restored from the database. Works for
 *  either decision mode; context and recommendations always agree on mode. */
export type ActiveSession = {
  session_id: string;
  context: DecisionContext;
  /** Three, or 0–3 for a strict "Use what I have" request — see RecommendSuccess. */
  recommendations: Recommendation[];
};
