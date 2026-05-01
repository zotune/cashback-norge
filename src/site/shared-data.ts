import {
  EB_PER_TRUMF_KR,
  FREE_CARDS,
  MERCHANT_ALIASES,
  PREMIUM_CARDS,
  PROVIDER_NAMES,
  PROVIDER_TIPS,
  SUPPORT_LINKS,
} from "../shared/provider-data";

// Expose shared data as globals for the inline site script
Object.assign(window, {
  SHARED: {
    EB_PER_TRUMF_KR,
    PROVIDER_NAMES,
    PROVIDER_TIPS,
    FREE_CARDS,
    PREMIUM_CARDS,
    SUPPORT_LINKS,
    MERCHANT_ALIASES,
  },
});
