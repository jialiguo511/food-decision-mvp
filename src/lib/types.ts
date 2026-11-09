// Shared types. The LLM prompt and the UI both speak this vocabulary.

export type Goal = "fat_loss" | "muscle_gain" | "maintain" | "general_health";
export type FridgeSize = "mini" | "standard" | "large";
export type Hunger = "light" | "normal" | "very_hungry";
export type Effort = "minimal" | "some" | "happy_to_cook";

/** "Sex used for the calculation" — the Mifflin–St Jeor equation has one
 *  constant per value. Used for nothing else. */
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "lightly_active" | "moderately_active" | "very_active";

/** Optional context the user chose to share. It never drives the recommender
 *  directly — a condition can only SUGGEST a NutritionPriority, which the user
 *  then confirms (see nutritionPriorities.ts). Deliberately three common ones;
 *  complex medical nutrition needs are not supported. */
export type HealthCondition = "high_blood_pressure" | "prediabetes_or_diabetes" | "high_cholesterol";

/** What the user has confirmed they want to limit. This — not a condition — is
 *  what the recommender reads: strong guidance, not a hard constraint. */
export type NutritionPriority = "lower_sodium" | "limit_added_sugar" | "lower_saturated_fat";

/** A dietary pattern the user follows — a HARD constraint in every mode (see
 *  PRODUCT.md → hard constraints). Stored in profiles.prefs, not a column. */
export type DietaryPattern = "vegetarian" | "vegan" | "pescatarian" | "halal" | "kosher";

/** A profiles row, as the app reads it. A field that has a column default in
 *  the database (goal, budget, cook minutes, fridge, equipment) is `null` here
 *  unless the USER set it — the stored column value alone proves nothing,
 *  because the database fills it in on its own. See lib/profileProvenance.ts. */
export type Profile = {
  id: string;
  display_name: string | null;
  /** null = the user hasn't chosen a goal. Read as "Eat better" internally. */
  goal: Goal | null;
  /** Manual protein target; null = use the suggestion (or the default). */
  protein_target_g: number | null;
  /** Manual calorie target; null = use the suggestion (none for "Eat better"). */
  daily_calorie_target_kcal: number | null;
  /** The most the user usually spends on missing ingredients; null = not set. */
  budget_per_meal_usd: number | null;
  fridge_size: FridgeSize | null;
  /** null = not set. */
  default_cook_minutes: number | null;
  cuisines: string[];
  /** Soft preference — a very strong ranking penalty, never a safety rule. */
  dislikes: string[];
  /** Safety constraint — a hard, non-negotiable exclusion in every mode. Kept
   *  strictly separate from dislikes. Only ever entered by the user. */
  allergies: string[];
  /** Optional context. Kept separate from nutrition_priorities on purpose. */
  health_conditions: HealthCondition[];
  /** Confirmed by the user; the only one of the two the recommender sees. */
  nutrition_priorities: NutritionPriority[];
  /** What the user can cook with. null = never told us — NOT "none": the
   *  recommender assumes no appliance at all until they answer. */
  equipment: string[] | null;
  /** Hard constraint. Empty = no dietary pattern stated. */
  dietary_patterns: DietaryPattern[];
  /** Free-text "Other" pattern, in the user's words. */
  dietary_other: string | null;
  /** Explicit, optional body inputs for the energy/protein estimates. Stored
   *  in metric only. All null until the user enters them. */
  sex: Sex | null;
  age_years: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** What the Profile form edits and saves: the stored fields, raw. Nullable
 *  targets mean "use the calculated suggestion" — a suggestion is never
 *  written here, so it can never overwrite a manual value. No id — that comes
 *  from the session. */
export type ProfileFormValues = Omit<Profile, "id" | "created_at" | "updated_at" | "prefs">;

/** What the recommender sees: ProfileFormValues with the targets RESOLVED
 *  (manual value, else calculated suggestion, else today's default) and no
 *  body inputs — it needs the targets, not the measurements. */
export type ProfileInput = Omit<
  ProfileFormValues,
  "protein_target_g" | "sex" | "age_years" | "height_cm" | "weight_kg" | "activity_level" | "health_conditions" | "goal"
> & { protein_target_g: number; goal: Goal };

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
   *  The app always sends the number the user chose (their usual, last time's,
   *  or a pick). null only appears on sessions saved before that, and on the
   *  server means "the profile budget if the user set one, else the system
   *  fallback". Ignored (forced to 0) when shopping is "inventory_only". */
  budget_override_usd: number | null;
  /** Set only by the "Show me what to buy" fallback after a thin or empty
   *  "Use what I have" result. Means: shopping is allowed, and the goal is the
   *  smallest possible purchase (ideally 1–3 items) that turns what the user
   *  has into a good meal — not a generic grocery run. Absent/false otherwise.
   *  Ignored when shopping is "inventory_only". */
  minimize_purchases?: boolean;
};

/**
 * The Cook answers as the form holds them. The three "stable" answers — time,
 * effort, shopping — and the budget are `null` until the user has answered or a
 * REAL earlier answer (their Profile, or a past session) fills them in. A
 * MealContext (what is sent and stored) can only be built from a form whose
 * answers are all there — see lib/recommend/cookForm.ts — so a system fallback
 * can never be sent, stored, or later remembered as the user's choice.
 */
export type CookForm = Omit<MealContext, "cook_minutes" | "effort" | "shopping"> & {
  cook_minutes: number | null;
  effort: Effort | null;
  shopping: CookShopping | null;
};

export type OrderMethod = "delivery" | "pickup" | "eat_nearby";

/** Approximate TOTAL food budget for one eat-out meal, as a coarse band the
 *  user taps. Deliberately not a number and not the same thing as Cook's
 *  `budget_override_usd`, which caps only the EXTRA money spent on missing
 *  ingredients (food already owned is free). Never reuse one for the other. */
export type MealBudget = "under_15" | "15_to_25" | "25_to_40" | "no_preference";

/** How far the user would go for "Eat nearby". Asked only for that method — it
 *  never applies to delivery or pickup. Coarse on purpose: the app maps each
 *  choice to a search radius and a distance-fit curve (places/config.ts →
 *  TRAVEL_SEARCH), so the user never sees a number. */
export type TravelWillingness = "walkable" | "nearby" | "worth_a_trip" | "no_preference";
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
  /** How far the user would go — only meaningful when `method` is
   *  "eat_nearby" or "pickup" and only ever read by the nearby flow (search
   *  radius and distance fit). Delivery is treated as "no_preference". Absent on
   *  sessions saved before it existed; that also means "no_preference". */
  travel_willingness: TravelWillingness;
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

/**
 * The person said more than one way of eating is fine — "I can buy things or make
 * something", "you decide", "just something" — so the decision they need help with
 * includes WHICH way. That is not a missing mode: it is a request whose answer
 * may mix Cook / Get food / Snack cards (still at most three, one model call).
 * Only built from a typed sentence; the step-by-step flow still asks for one mode.
 *
 * Everything here is either STATED by the person or an explicit "not stated":
 * unknown time, effort, budget and foods stay null / empty and are never turned
 * into a confirmed condition. Nothing is assumed about what is in their kitchen,
 * and nothing about where they are (no real-places search happens in this mode).
 */
export type OpenContext = {
  decision_mode: "open";
  /** Stated, else "normal" (the same neutral starting point every flow uses). */
  hunger: Hunger;
  /** Which ways of eating the person allows. Both true when they said nothing
   *  against either; cook false for "I don't want to cook". (A person who allows
   *  ONLY cooking is a single-mode Cook request, not this.) */
  ways: { cook: boolean; buy: boolean };
  /** A cooking-time limit they stated, else null — no limit is assumed. */
  minutes: number | null;
  effort: Effort | null;
  /** Money they said they would spend buying ingredients to cook, else null. */
  extra_spend_usd: number | null;
  /** Rough budget for a bought meal, as they said it; "no_preference" when not said. */
  meal_budget: MealBudget;
  /** Only foods they named as available right now. Unknown is NOT "none": a recipe
   *  needing anything else lists it as something to buy. */
  ingredients_on_hand: string[];
  craving: string | null;
  /** They said they had just exercised. Context for the recommendation only. */
  after_exercise: boolean;
  /** They said they want more protein (e.g. "I didn't get enough protein"). Their own
   *  words — never a verified shortfall, and no intake gap is inferred or stated. */
  protein_focus: boolean;
  /** They left it to us with no specifics ("just something", "you decide"): every
   *  option should be a low-burden one. The app's reading of the request, shown to
   *  them as assumed. */
  easy_pick: boolean;
  /** They asked for a proper meal, not a snack ("no snacks, a real dinner"). Separate from the WAY:
   *  a meal can be cooked or bought, and cooking is not the same thing as a meal. */
  meal_only: boolean;
};

/** Any of Today's dynamic contexts, discriminated on decision_mode. The first
 *  three are what the step-by-step questions build; `open` comes from a sentence. */
export type DecisionContext = MealContext | OrderContext | StoreSnackContext | OpenContext;

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
  /** One short, practical caution tied to the user's confirmed nutrition
   *  priorities (e.g. "the sauce can be salty — keep it on the side"). Null
   *  when they have none set or there is nothing specific to flag; also null on
   *  sessions saved before this field existed. Never an amount or a medical
   *  claim. */
  watch: string | null;
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
  /** One short, practical caution tied to the user's confirmed nutrition
   *  priorities (e.g. "the sauce can be salty — keep it on the side"). Null
   *  when they have none set or there is nothing specific to flag; also null on
   *  sessions saved before this field existed. Never an amount or a medical
   *  claim. */
  watch: string | null;
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
  /** One short, practical caution tied to the user's confirmed nutrition
   *  priorities (e.g. "the sauce can be salty — keep it on the side"). Null
   *  when they have none set or there is nothing specific to flag; also null on
   *  sessions saved before this field existed. Never an amount or a medical
   *  claim. */
  watch: string | null;
  estimated_calories: number;
  estimated_protein_g: number;
};

/** How much the provider says a place costs, coarsest possible. Only set when
 *  the provider actually returned one — never inferred. */
export type PlacePriceLevel = "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";

/** Personal feedback about one real place (a user's own opinion, stored per
 *  user — never a public or verified fact about the place). "exclude" = never
 *  recommend it to this user again until they undo it; "downrank" = rank it
 *  lower but keep it eligible. The action is derived from the reason. */
export type PlaceFeedbackReason = "closed" | "dont_like" | "too_expensive" | "bad_experience" | "other";
export type PlaceFeedbackAction = "exclude" | "downrank";

/** One of up to three recommendations for "Find food near me": a real place
 *  from that request's provider results, never a model invention. The model
 *  supplies only `place_id`, `reason`, and `look_for`; every other field is
 *  copied from the provider's candidate server-side (see output.ts), so the
 *  UI never renders a place name the model made up.
 *
 *  Deliberately has no menu-item, price, calorie, or protein fields: a places
 *  provider is not a menu database. `look_for` is a *strategy* — the shape of
 *  dish to look for plus one simple tweak ("a grilled chicken rice bowl, sauce
 *  on the side") — never a claim that an item exists or is verified.
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
  /** What kind of food to look for there. Guidance, not a menu claim. Null
   *  when the server withheld it because it named one of the user's
   *  allergens (see output.ts) — the place itself is still valid. */
  look_for: string | null;
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
  /** The place's own website when the provider had one; null otherwise (and
   *  on sessions saved before this existed). Not a menu or ordering link. */
  website_url: string | null;
  /** false while `reason` is the rule-written one and `look_for` hasn't been
   *  written yet (the model only adds wording after the places are shown).
   *  Absent = complete: every session saved before this existed. */
  enriched?: boolean;
  /** The provider's reference to a photo of THIS place (never a generated one),
   *  and its credit. Absent / null = none: the card shows a neutral placeholder. */
  photo_name?: string | null;
  photo_author?: string | null;
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
  /** Where the ceiling came from: the user's request ("override"), their saved
   *  Profile budget ("profile"), or the system's internal fallback ("default")
   *  — the last is never shown to the user as theirs. */
  budget_source: "profile" | "override" | "default";
  equipment: string[];
  /** false = the user has never said what they can cook with. Nothing is
   *  assumed then: `equipment` is empty and `no_cooking` is true. */
  equipment_known: boolean;
  no_cooking: boolean;
  /** True when the user chose "Use what I have" — every recommendation must
   *  need zero additional purchases, not merely stay under a low budget. */
  no_shopping: boolean;
  /** Safety constraint — see Profile.allergies. */
  allergies: string[];
  /** Hard constraint — see Profile.dietary_patterns. */
  dietary: DietaryConstraint;
};

/** A dietary pattern, as a hard constraint on every recommendation. `other` is
 *  the user's own words, passed as a description of a food rule. */
export type DietaryConstraint = { patterns: DietaryPattern[]; other: string | null };

/** The constraints an order recommendation set was generated under. Ordering
 *  has no real time/budget/equipment limits to enforce — the only hard
 *  constraint is the user's allergies. */
export type OrderConstraints = {
  decision_mode: "order";
  allergies: string[];
  dietary: DietaryConstraint;
};

/** The constraints a store-snack recommendation set was generated under. Like
 *  ordering, there is no time/budget/equipment limit to enforce — only the
 *  user's allergies. */
export type StoreSnackConstraints = {
  decision_mode: "store_snack";
  allergies: string[];
  dietary: DietaryConstraint;
};

/** The hard constraints a nearby-places recommendation set was generated
 *  under: the user's allergies. Places data has no menu or allergen content, so
 *  these can only steer away from places whose type centers on an allergen and
 *  from dishes to look for — the product never claims a place is safe. Disliked
 *  foods are soft preferences and travel as `soft_preferences.disliked_foods`. */
export type NearbyConstraints = {
  decision_mode: "nearby";
  allergies: string[];
  dietary: DietaryConstraint;
};

/** The hard constraints an open (cross-way) set was generated under. Allergies and
 *  the dietary pattern apply to every card; `cook` is present only when cooking is
 *  allowed, and holds the cooking limits that apply to Cook cards. Limits the person
 *  never stated are null and are not enforced — none is invented. */
export type OpenConstraints = {
  decision_mode: "open";
  ways: { cook: boolean; buy: boolean };
  /** A proper meal was asked for: no snack cards. Independent of `ways`. */
  meal_only: boolean;
  allergies: string[];
  dietary: DietaryConstraint;
  cook: {
    max_minutes: number | null;
    budget_usd: number | null;
    equipment: string[];
    equipment_known: boolean;
    no_cooking: boolean;
  } | null;
};

export type ActiveConstraints = CookConstraints | OrderConstraints | StoreSnackConstraints | NearbyConstraints | OpenConstraints;

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
  /** Which of these cards are already in the user's Saved. Absent = unknown
   *  (treated as nothing saved). */
  saved?: SavedState;
  /** Signature of the nutrition targets these cards were made under (see
   *  targetsSignature). Lets Home notice that the user's targets changed since,
   *  and re-score the cards on screen. Absent when nothing personal applied. */
  targets_sig?: string;
  /** Nearby only: true while the places are shown with rule-written reasons and
   *  the model is still to add its wording (POST /api/recommend/enrich). */
  enrichment_pending?: boolean;
  /** Nearby only: every place shown in this DECISION so far — this set and every
   *  earlier "Show me 3 more" batch. The browser sends it back with the next
   *  "more" so none comes round again. A fresh question starts a new list. Being
   *  shown is not a preference: this is never read as dislike. */
  shown_place_ids?: string[];
};

/** "Show me 3 more" found nothing new: every place the search returns has
 *  already been shown (or is excluded). Nothing is stored — the cards on screen
 *  stay — and the search was not widened to find something. */
export type RecommendNoMore = { no_more: true; shown_place_ids: string[] };

/** What of a set of cards is already in the user's Saved: indexes of Cook
 *  recipe cards (matched by content), and ids of nearby places. */
export type SavedState = { recipeIndexes: number[]; placeIds: string[] };

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
  | "session_save_failed"
  /** Today's allowance of suggestion requests is used up. */
  | "daily_limit"
  /** Today's allowance of nearby searches is used up (food ideas by type still work). */
  | "nearby_limit"
  /** The allowance couldn't be checked, so paid calls are held back. */
  | "usage_unavailable"
  /** Suggestions are switched off, or the whole beta is out of today's capacity. Not the person's doing. */
  | "service_paused"
  /** Same, for nearby search only (food ideas by type still work). */
  | "nearby_paused";

/** Which of the person's rules a rejected set broke — an enumeration, never text, so it is
 *  safe to show and to log. Derived from the validator's findings (violationKinds). */
export type ViolationKind = "allergy" | "diet" | "equipment" | "no_cook" | "time" | "budget" | "inventory" | "ways";

export type RecommendFailure = {
  error: { code: RecommendErrorCode; message: string; details?: string[]; /** constraint_violation only. */ reasons?: ViolationKind[] };
};

/** Raised in the browser, before any request, when the device can't give us a
 *  location. Never sent by the server. */
export type LocationErrorCode =
  | "location_unsupported"
  | "location_denied"
  | "location_unavailable"
  | "location_timeout";

/** A request that failed before the server's own answer could be read: the
 *  connection dropped, or what came back wasn't the app's JSON (e.g. a host's
 *  gateway page). Kept apart from the server's codes so the screen never says
 *  "the AI failed" about a problem in between. */
export type TransportErrorCode = "network_error" | "bad_response";

/** What Today's UI shows for a failed request: a server failure, a
 *  browser-side location failure, or a transport failure. */
export type RecommendUiError = {
  code: RecommendErrorCode | LocationErrorCode | TransportErrorCode;
  message: string;
  details?: string[];
  reasons?: ViolationKind[];
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
  /** Which cards are already saved, read once for the whole set. */
  saved?: SavedState;
  /** See RecommendSuccess.targets_sig. */
  targets_sig?: string;
  /** See RecommendSuccess.shown_place_ids. Restored from the stored session, so a
   *  reload followed by "Show me 3 more" still carries on from the whole decision. */
  shown_place_ids?: string[];
};
