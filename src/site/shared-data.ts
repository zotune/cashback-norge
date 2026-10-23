import {
  FREE_CARDS,
  MERCHANT_ALIASES,
  PREMIUM_CARDS,
  PROVIDER_NAMES,
  PROVIDER_TIPS,
  SUPPORT_LINKS,
} from "../shared/provider-data";
import {
  calculateCashback,
  calculateCashbackMaxKr,
  EB_PER_TRUMF_KR,
  formatBreakdownWithAmounts,
  formatCompactRewardLabel,
  formatKr,
  formatRewardLabel,
  getMaxRewardPercent,
} from "../shared/reward-calculation";
import { QUICK_FILTERS, matchesOfferQuickFilters } from "../shared/offer-filters";
import { createCardBenefitGroup, getCardBenefitOffers, watchCardBenefitDate } from "../shared/card-benefits";

// Expose shared data as globals for the inline site script
Object.assign(window, {
  SHARED: {
    EB_PER_TRUMF_KR,
    PROVIDER_NAMES,
    PROVIDER_TIPS,
    FREE_CARDS,
    createCardBenefitGroup,
    getCardBenefitOffers,
    watchCardBenefitDate,
    PREMIUM_CARDS,
    SUPPORT_LINKS,
    MERCHANT_ALIASES,
    QUICK_FILTERS,
    matchesOfferQuickFilters,
    calculateCashback,
    calculateCashbackMaxKr,
    formatBreakdownWithAmounts,
    formatCompactRewardLabel,
    formatKr,
    formatRewardLabel,
    getMaxRewardPercent,
  },
});
