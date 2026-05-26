# Service Category/Subcategory Audit Report
**Date:** 2026-05-26
**Phase:** SC2 — Audit-only (no implementation)

---

## 1. Files Inspected

### Backend — Service & Category Core
| File | Lines | Notes |
|------|-------|-------|
| `backend/src/models/Service.js` | ~60 | Mongoose schema |
| `backend/src/models/ServiceCategory.js` | ~40 | Custom category model |
| `backend/src/controllers/serviceController.js` | ~250 | CRUD + validation |
| `backend/src/controllers/serviceController.test.js` | ~300 | Tests |
| `backend/src/controllers/serviceCategoryController.js` | ~200 | Custom category CRUD |
| `backend/src/controllers/serviceCategoryController.test.js` | ~400 | Tests |
| `backend/src/routes/serviceRoutes.js` | ~30 | Route definitions |
| `backend/src/routes/serviceCategoryRoutes.js` | ~30 | Route definitions |

### Backend — Related Controllers & Routes
| File | Notes |
|------|-------|
| `backend/src/controllers/barberProfileController.js` | Card summary (line ~200-300) filters by serviceCategory |
| `backend/src/controllers/barberProfileController.test.js` | Tests for service category filtering in card summary |
| `backend/src/controllers/bookingController.js` | Service + barber lookup during booking creation |
| `backend/src/controllers/favoriteController.js` | Favorites populate barber services and profession fields |
| `backend/src/controllers/availabilityDebugService.js` | Uses service for availability checks |
| `backend/src/controllers/salonController.js` | Salon profile may list barbers and their services |
| `backend/src/controllers/bookingReadService.js` | Service lookup for booking display |
| `backend/src/routes/barberRoutes.js` | `GET /api/barbers/:id/services` is the main service-by-barber endpoint |
| `backend/src/routes/serviceRoutes.js` | Uses requireBarber from auth middleware |

### Backend — Utilities (Service Category Related)
| File | Notes |
|------|-------|
| `backend/src/utils/barberProfileUtils.js` | `getBarberCardData()` — DB query filter logic for serviceCategory |
| `backend/src/utils/barberCardAvailability.js` | Uses barber services list for slot calculation |
| `backend/src/utils/salonHelpers.js` | Salon public formatting includes barber+service data |
| `backend/src/utils/bookingUtils.js` | Service validation, barber-service ownership check |
| `backend/src/middleware/authMiddleware.js` | `requireBarber`, `protect` middlewares |

### Frontend — Shared Data & API Helpers
| File | Notes |
|------|-------|
| `frontend/src/shared/data/serviceCategories.js` | **EXISTS** — system categories + labels map |
| `frontend/src/shared/data/professions.js` | **EXISTS** — profession taxonomy + barberType/specialty |
| `frontend/src/shared/api/serviceCategories.js` | **EXISTS** — API client for fetching/creating categories |
| `frontend/src/shared/api/professions.js` | API client for professions |

### Frontend — Service-Consuming Components
| File | Notes |
|------|-------|
| `frontend/src/barber/components/ServicesManager.jsx` | **Service create/edit form** (barber's own services) |
| `frontend/src/client/components/BarberCard.jsx` | Card-summary rendering of services |
| `frontend/src/client/components/barbers/BarbersGrid.jsx` | Grid of barber cards (uses BarberCard) |
| `frontend/src/client/components/barber-profile/BarberServicesSection.jsx` | Profile page service list |
| `frontend/src/client/components/booking/ServiceStep.jsx` | **Booking flow** — service selection/filtering |
| `frontend/src/client/components/booking/BookingPage.jsx` | Manages booking steps including ServiceStep |
| `frontend/src/client/pages/FavoritesPage.jsx` | Favorites list with service summary |
| `frontend/src/client/utils/favoriteHelpers.js` | Favorite API + formatting helpers |
| `frontend/src/client/components/barber-profile/HeroSection.jsx` | Barber hero with profession/specialty rendering |
| `frontend/src/client/components/barber-profile/GallerySection.jsx` | Portfolio gallery section |
| `frontend/src/pages/BarbersPage.jsx` | "Browse" page with profession/city filtering |
| `frontend/src/pages/HomePage.jsx` | Home page with featured barbers |
| `frontend/src/store/barberStore.js` | Redux/store with barber data (may include service data) |

---

## 2. Current Service Schema (backend/src/models/Service.js)

```js
const serviceSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: [100, "Service name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [5, "Duration must be at least 5 minutes"],
      max: [480, "Duration cannot exceed 480 minutes"],
    },
    active: {
      type: Boolean,
      default: true,
    },
    customCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceCategory",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);
```

**Key observation: There is NO `category` or `subcategory` field on Service today.** The only category-like field is `customCategoryId` which references a `ServiceCategory` document.

---

## 3. Current ServiceCategory Model (backend/src/models/ServiceCategory.js)

```js
const serviceCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, lowcase: true, trim: true },
    label: { type: String, required: true, trim: true },
    ownerType: {
      type: String,
      enum: ["system", "barber", "salon"],
      required: true,
      default: "system",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel",
      default: null,
    },
    ownerModel: {
      type: String,
      enum: ["User", "Salon"],
      default: null,
    },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    source: {
      type: String,
      enum: ["system", "custom"],
      default: "system",
    },
  },
  { timestamps: true }
);
```

System categories are seeded with:
- key: "haircut", "coloring", "nails", "lashes", "skincare", "styling", "massage"
- Labels match keys (title-cased)

---

## 4. Where Are Services Created and Edited?

| Location | File | Route | Method |
|----------|------|-------|--------|
| **Backend** | `serviceController.js` | `POST /api/services` | `createService` |
| **Backend** | `serviceController.js` | `PUT /api/services/:id` | `updateService` |
| **Backend** | `serviceController.js` | `DELETE /api/services/:id` | `deleteService` |
| **Backend** | `serviceController.js` | `GET /api/services/barber/:barberId` | `getServicesByBarber` |
| **Backend** | `serviceRoutes.js` | All routes require `protect` + `requireBarber` for mutations |
| **Frontend** | `ServicesManager.jsx` | The main create/edit form for barbers |
| **Frontend** | `ServicesManager.jsx` | Lists barber's existing services with toggle/delete |

---

## 5. Where Are Services Filtered Today?

| User Story | File | Filter Mechanism |
|------------|------|-----------------|
| **Browse barbers by service category** | `barberProfileController.js` `getBarberCardData()` | `req.query.serviceCategory` filters barbers by matching service name/type using `regex` |
| **Browse barbers by tags** | `barberProfileController.js` `getBarberCardData()` | `req.query.tags` filters users whose services have matching tags |
| **Booking service selection** | `ServiceStep.jsx` | Groups services by `customCategoryId`, then by `customCategoryId.name` |
| **Barber's own service list** | `ServicesManager.jsx` | Simple list grouped by active/inactive; has customCategory dropdown |
| **Favorites page** | `FavoritesPage.jsx` | Lists barbers with their service summary (first 3-5 services) |
| **Barber card** | `BarberCard.jsx` | Shows max 3 service prices/labels |

---

## 6. Where Are Service Categories Displayed Today?

| Component | Usage |
|-----------|-------|
| `ServiceStep.jsx` | **Groups services by category name** during booking. Shows a selectable category filter at top, then sub-filtered services below. |
| `ServicesManager.jsx` | **Dropdown** for `customCategoryId` — includes system + custom categories |
| `serviceController.test.js` | Tests validate `customCategoryId` assignment and population |
| `barberProfileController.test.js` | Tests for `?serviceCategory=haircut` filtering |
| `shared/data/serviceCategories.js` | Defines system categories |

---

## 7. Existing Category/Profession Utilities Found

### `frontend/src/shared/data/serviceCategories.js`
```js
export const SYSTEM_CATEGORIES = [
  { key: "haircut",    label: "Haircut",    icon: "scissors" },
  { key: "coloring",   label: "Coloring",   icon: "palette" },
  { key: "nails",      label: "Nails",      icon: "hand" },
  { key: "lashes",     label: "Lashes",     icon: "eye" },
  { key: "skincare",   label: "Skincare",   icon: "droplet" },
  { key: "styling",    label: "Styling",    icon: "wind" },
  { key: "massage",    label: "Massage",    icon: "spa" },
];

export const getCategoryLabel = (key) => {
  const cat = SYSTEM_CATEGORIES.find(c => c.key === key);
  return cat ? cat.label : key;
};

export const getCategoryIcon = (key) => {
  const cat = SYSTEM_CATEGORIES.find(c => c.key === key);
  return cat ? cat.icon : "help-circle";
};
```

### `frontend/src/shared/data/professions.js`
```js
export const PROFESSIONS = [
  { key: "barber",      label: "Barber",         icon: "scissors" },
  { key: "hairdresser", label: "Hairdresser",     icon: "sparkles" },
  { key: "cosmetologist", label: "Cosmetologist", icon: "wand" },
  { key: "nail_technician", label: "Nail Technician", icon: "hand" },
  { key: "makeup_artist", label: "Makeup Artist", icon: "palette" },
  { key: "esthetician", label: "Esthetician",    icon: "droplet" },
  { key: "massage_therapist", label: "Massage Therapist", icon: "spa" },
  { key: "lash_technician", label: "Lash Technician", icon: "eye" },
  { key: "brow_artist", label: "Brow Artist",    icon: "minus" },
  { key: "stylist",     label: "Stylist",        icon: "shirt" },
];

export const BARBER_TYPES = [
  { key: "unisex", label: "Unisex" },
  { key: "men",    label: "Men's barber" },
  { key: "women",  label: "Women's stylist" },
  { key: "kids",   label: "Kids barber" },
];

export const SPECIALTIES = {
  unisex: "unisex",
  men: "men",
  women: "women",
  kids: "kids",
};
```

### `frontend/src/shared/api/professions.js`
```js
export const fetchProfessions = () => Promise.resolve(PROFESSIONS);
export const fetchBarberTypes = () => Promise.resolve(BARBER_TYPES);
export const getProfessionLabel = (key) => { ... };
export const getBarberTypeLabel = (key) => { ... };
```

### `frontend/src/shared/api/serviceCategories.js`
```js
export const fetchSystemCategories = () => { ... };
export const fetchCategories = (ownerType, ownerId) => { ... };
export const createCategory = (data) => { ... };
export const updateCategory = (id, data) => { ... };
export const deleteCategory = (id) => { ... };
export const getCategoryLabel = (key) => { ... };
export const getCategoryIcon = (key) => { ... };
```

---

## 8. Current Barber/Service Category Filtering (backend/src/utils/barberProfileUtils.js)

In `getBarberCardData()`, service category filtering works as follows:

```js
if (serviceCategory) {
  // Search barbers by service name (not by category field)
  match.services = {
    $elemMatch: {
      name: { $regex: serviceCategory, $options: "i" },
    },
  };
}
```

**This is a text-search on service name, NOT a category field.** E.g., `?serviceCategory=haircut` matches barbers who have a service whose name contains "haircut". This is fragile and incorrect for a proper taxonomy.

---

## 9. Overall Architecture Observations

### Current State
- **Service has NO `category` or `subcategory` field**
- `ServiceCategory` model exists for custom per-barber/salon categories
- System categories are seeded with 7 hardcoded keys
- Frontend `shared/data/serviceCategories.js` has a static list with `getCategoryLabel` / `getCategoryIcon`
- Backend doesn't import or use shared category data — categories exist only in DB via ServiceCategory model
- Service category "filtering" currently uses `$regex` on service name (not a proper category lookup)
- Profession taxonomy (barberType, specialty) is separate from service categories
- A "haircut" professional could list services that don't fit "haircut" — and vice versa

### Professional/Service Category Independence
- **YES, service category can and should be independent from barber profession**
- A "barber" can offer "haircut" and "coloring" services
- A "nail_technician" primarily offers nail services but could also offer lash services
- The profession field (`User.barberType`/`User.profession`) describes the barber
- The Service.category describes what the service IS

---

## 10. API Response Shapes That Would Be Affected

| Endpoint | Change |
|----------|--------|
| `GET /api/services/barber/:barberId` | Each service object gains `category` and `subcategory` fields |
| `POST /api/services` | Body accepts optional `category`/`subcategory` |
| `PUT /api/services/:id` | Body accepts optional `category`/`subcategory` |
| `GET /api/barbers/card-summary` | Card summary service array includes `category`/`subcategory` |
| `GET /api/favorites` | Populated service objects gain `category`/`subcategory` |
| `GET /api/barbers/:id` | Populated services gain `category`/`subcategory` |
| `GET /api/bookings` | Booked service data may include `category`/`subcategory` (if service is populated) |
| `GET /api/salons/:id/public` | Salon barber services gain `category`/`subcategory` |
| `POST /api/bookings` | Booking creation reads service.category for waitlist matching? |
| `GET /api/waitlist` | Waitlist service references gain `category`/`subcategory` |

---

## 11. Old Services Backward Compatibility

- Existing services have `category: undefined` and `subcategory: undefined`
- These must continue to work: create booking, display on profile, card, favorites
- All existing frontend rendering code must handle missing `category`/`subcategory`
- Booking flow must not break for uncategorized services
- All filters must be optional and gracefully handle missing values

---

## 12. Migration/Backfill Plan

Phase SC2 would require:

1. **Add fields** — `category: String` and `subcategory: String` to Service schema (optional, no required index)
2. **Backfill script** — Analyze existing service names against known categories/subcategories:
   - "Men's haircut" → category="haircut", subcategory="mens_cut"
   - "Full highlights" → category="coloring", subcategory="highlights"
   - etc.
3. **No-force migration** — Services without category continue to work. Backfill is best-effort.

---

## 13. Frontend Forms Needing Dropdowns

| Form | Category Dropdown | Subcategory Dropdown |
|------|------------------|---------------------|
| `ServicesManager.jsx` — Create Service | ✅ New `<select>` or dropdown | ✅ Subcategory filters based on category |
| `ServicesManager.jsx` — Edit Service | ✅ Same dropdown (pre-selected) | ✅ Same (pre-selected) |
| `BookingPage.jsx` / `ServiceStep.jsx` | Already has category filter | Add subcategory filter |
| `BarbersPage.jsx` / search | Add category filter (or enhance existing) | Add subcategory filter |
| Admin/service seeding/import | ✅ | ✅ |

---

## 14. Booking/Search Filters Needing Category/Subcategory

| Page | Filter Type |
|------|------------|
| `BarbersPage.jsx` (Browse barbers) | Category dropdown + subcategory dropdown (in addition to existing profession filter) |
| `ServiceStep.jsx` (Booking flow) | Already has category grouping; extend with subcategory grouping |
| `BarberCard.jsx` (Card summary) | Display category badge (or subcategory label) on each service |

---

## 15. Recommended Taxonomy Shape

### Category keys (stable, stored in DB)
```
haircut       → "haircut"
coloring      → "coloring"
nails         → "nails"
lashes        → "lashes"
skincare      → "skincare"
styling       → "styling"
massage       → "massage"
```

### Subcategory keys (stable, stored in DB)
```
haircut:       ["mens_cut", "womens_cut", "kids_cut", "beard", "trim"]
coloring:      ["highlights", "balayage", "full_color", "toning", "roots"]
nails:         ["manicure", "pedicure", "gel", "extensions", "acrylic"]
lashes:        ["classic", "volume", "hybrid", "removal", "lift_tint"]
skincare:      ["facial", "peeling", "mesotherapy", "microneedling", "cleaning"]
styling:       ["blow_dry", "updo", "straightening", "curling", "treatment"]
massage:       ["classic", "sports", "anti_cellulite", "relaxing"]
```

### Shared taxonomy file (in `frontend/src/shared/data/` and optionally mirrored as backend constant)
```js
export const SERVICE_CATEGORIES = {
  haircut: {
    label: "Haircut",
    subcategories: {
      mens_cut:  { label: "Men's Cut" },
      womens_cut:{ label: "Women's Cut" },
      kids_cut:  { label: "Kids' Cut" },
      beard:     { label: "Beard" },
      trim:      { label: "Trim" },
    },
  },
  coloring: {
    label: "Color",
    subcategories: {
      highlights:  { label: "Highlights" },
      balayage:    { label: "Balayage" },
      full_color:  { label: "Full Color" },
      toning:      { label: "Toning" },
      roots:       { label: "Roots Touch-Up" },
    },
  },
  // ... etc
};

export const getCategoryLabel = (key) => SERVICE_CATEGORIES[key]?.label ?? key;
export const getSubcategoryLabel = (catKey, subKey) =>
  SERVICE_CATEGORIES[catKey]?.subcategories[subKey]?.label ?? subKey;
export const getSubcategoriesForCategory = (catKey) =>
  SERVICE_CATEGORIES[catKey]?.subcategories
    ? Object.entries(SERVICE_CATEGORIES[catKey].subcategories).map(([key, val]) => ({
        key,
        label: val.label,
      }))
    : [];
```

---

## 16. Recommended Backend Schema Change

```js
// Add to Service.js schema (optional fields):
category: {
  type: String,
  enum: ["haircut", "coloring", "nails", "lashes", "skincare", "styling", "massage", ""],
  default: "",
},
subcategory: {
  type: String,
  default: "",
},
```

Validation strategy (in `serviceController.js`):
- If `category` is provided, validate it against the allowed enum
- If `subcategory` is provided, validate it's a valid subcategory for the given `category`
- If `category` is empty/undefined, `subcategory` must also be empty/undefined
- Both are optional — existing services without these fields continue untouched

---

## 17. Recommended Frontend Changes

| File | Change |
|------|--------|
| `shared/data/serviceCategories.js` | **MAJOR** — Restructure to include subcategories map, add `getSubcategoryLabel()`, `getSubcategoriesForCategory()` |
| `barber/components/ServicesManager.jsx` | Add category dropdown (required) + subcategory dropdown (conditional on category selection) |
| `client/components/booking/ServiceStep.jsx` | Already groups by category; add subcategory filter chips |
| `client/components/BarberCard.jsx` | Show category badge on each service (optional) |
| `client/components/barber-profile/BarberServicesSection.jsx` | Add category heading grouping |
| `client/pages/BarbersPage.jsx` | Add category + subcategory filters |
| `client/utils/favoriteHelpers.js` | No change needed (renders what's in the service object) |

---

## 18. Backward Compatibility Plan

1. **Service model changes optional** — `category` and `subcategory` have no `required`, no index by default
2. **All existing frontend code** must gracefully handle `service.category === "" || !service.category`
3. **No DB migration required on deploy** — just add fields with `default: ""`
4. **Frontend rendering** — if no category, fall back to displaying service name only
5. **Booking flow** — uncategorized services appear in "Other" or at bottom of list
6. **Card summary** — uncategorized services show as today (name + price)
7. **Filters** — old API clients not sending `category` continue to get all services

---

## 19. Test Plan

| Test Suite | New Tests Needed |
|-----------|-----------------|
| `serviceController.test.js` | Create service with valid category+subcategory |
| `serviceController.test.js` | Create service with invalid category (400) |
| `serviceController.test.js` | Create service with invalid subcategory for category (400) |
| `serviceController.test.js` | Create service with subcategory but no category (400) |
| `serviceController.test.js` | Create service without category (backward compatible) |
| `serviceController.test.js` | Update service to set category+subcategory |
| `serviceController.test.js` | Update service to clear category+subcategory |
| `serviceController.test.js` | GET services includes category+subcategory fields |
| `barberProfileController.test.js` | Card summary still works with category+subcategory on services |
| `barberProfileController.test.js` | Card summary can filter by category (not regex) |
| `bookingController.test.js` | Booking creation with categorized service |
| `bookingController.test.js` | Booking creation with uncategorized service (backward compatible) |
| `ServiceStep.test.jsx` (frontend) | Category+subcategory dropdown renders and selects correctly |
| `ServicesManager.test.jsx` (frontend) | Category dropdown in create/edit form |

---

## 20. Phase SC2 Safest First Patch

### Step 1 : Backend — Add optional fields to Service model

**Files to change:** `backend/src/models/Service.js`

Minimal change:
```js
// Add after `tags` or before `customCategoryId`:
category: {
  type: String,
  enum: SERVICE_CATEGORY_KEYS,
  default: "",
},
subcategory: {
  type: String,
  default: "",
},
```

Define a shared constant (e.g., `backend/src/config/serviceTaxonomy.js`):
```js
export const SERVICE_CATEGORY_KEYS = [
  "haircut", "coloring", "nails", "lashes",
  "skincare", "styling", "massage",
];

export const SERVICE_SUBCATEGORIES = {
  haircut:  ["mens_cut", "womens_cut", "kids_cut", "beard", "trim"],
  coloring: ["highlights", "balayage", "full_color", "toning", "roots"],
  nails:    ["manicure", "pedicure", "gel", "extensions", "acrylic"],
  lashes:   ["classic", "volume", "hybrid", "removal", "lift_tint"],
  skincare: ["facial", "peeling", "mesotherapy", "microneedling", "cleaning"],
  styling:  ["blow_dry", "updo", "straightening", "curling", "treatment"],
  massage:  ["classic", "sports", "anti_cellulite", "relaxing"],
};
```

### Step 2 : Backend — Add validation to serviceController.js

**Files to change:** `backend/src/controllers/serviceController.js`

In `createService` and `updateService`:
```js
const { category, subcategory } = req.body;

if (category && !SERVICE_CATEGORY_KEYS.includes(category)) {
  return res.status(400).json({ message: `Invalid category: ${category}` });
}

if (category && subcategory) {
  const validSubs = SERVICE_SUBCATEGORIES[category];
  if (!validSubs || !validSubs.includes(subcategory)) {
    return res.status(400).json({
      message: `Invalid subcategory "${subcategory}" for category "${category}"`,
    });
  }
} else if (subcategory && !category) {
  return res.status(400).json({
    message: "Subcategory requires a category",
  });
}
```

### Step 3 : Backend — Add tests for validation

**Files to change:** `backend/src/controllers/serviceController.test.js`

### Step 4 : Frontend — Restructure shared taxonomy

**Files to change:** `frontend/src/shared/data/serviceCategories.js`

Add subcategory data and helper functions.

### Step 5 : Frontend — Update ServicesManager dropdowns

**Files to change:** `frontend/src/barber/components/ServicesManager.jsx`

Add category `<select>` + conditional subcategory `<select>`.

### Step 6 : Frontend — Update ServiceStep booking filter

**Files to change:** `frontend/src/client/components/booking/ServiceStep.jsx`

Add subcategory filter chips (below current category grouping).

---

## 21. Risks / Blockers

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Existing regex-based filtering breaks** | Medium | Keep backward-compatible; deprecate regex path after new filtering lands |
| **Shared taxonomy goes out of sync** | Medium | Single source of truth: `shared/data/serviceCategories.js` frontend-side; backend keeps only validation keys |
| **CustomCategoryId conflicts with new category/subcategory** | Low | They serve different purposes: `customCategoryId` is per-barber grouping; `category`/`subcategory` is standardized taxonomy |
| **Frontend forms become complex** | Low | Category dropdown, then conditional subcategory dropdown; standard UX pattern |
| **Existing services without category show at bottom of lists** | Low | Acceptable — they fall into "Other" or remain unfiltered |
| **ServiceCategory model confusion** | Low | Both can coexist; `category`/`subcategory` doesn't replace ServiceCategory |

---

## 22. Summary

1. **Service model currently has NO `category` or `subcategory` field** — only `customCategoryId` (ObjectId ref to ServiceCategory)
2. **Frontend `shared/data/serviceCategories.js` already exists** with `getCategoryLabel`/`getCategoryIcon`
3. **Frontend `shared/data/professions.js` already exists** with `getProfessionLabel`/`getBarberTypeLabel`
4. **Service filtering is regex-based** — `serviceCategory` param does `$regex` on service name
5. **Booking flow groups by category via ServiceCategory model** — not by a Service.category field
6. **Safer approach: add optional category+subcategory string fields** to Service model
7. **Validation must be backward-compatible** — existing services without category continue working
8. **No immediate DB migration required** — deploy schema change, then backfill data optionally
9. **All frontend rendering must handle missing category gracefully**
10. **Test count impact: ~15 new backend tests, ~4 new frontend component tests**
