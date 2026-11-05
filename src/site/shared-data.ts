import { formatTooltipHtml } from "../shared/tooltip-content";
import {
  FREE_CARDS,
  INSTABANK_AD,
  MERCHANT_ALIASES,
  PREMIUM_CARDS,
  PROVIDER_NAMES,
  PROVIDER_TIPS,
  PROVIDER_WELCOME_BONUSES,
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
import { getOfferCampaignLabel, getVisibleOfferKey } from "../shared/offer-context";
import { getCardBenefitOffers, getFreeCards, watchCardBenefitDate } from "../shared/card-benefits";
import { getSupportAdvertisementText, getSupportAdvertisementTooltipParts, selectSupportAdvertisement } from "../shared/support-advertisements";

// Expose shared data as globals for the inline site script
Object.assign(window, {
  SHARED: {
    EB_PER_TRUMF_KR,
    PROVIDER_NAMES,
    PROVIDER_TIPS,
    FREE_CARDS,
    PROVIDER_WELCOME_BONUSES,
    getCardBenefitOffers,
    getFreeCards,
    watchCardBenefitDate,
    INSTABANK_AD,
    selectSupportAdvertisement,
    getSupportAdvertisementText,
    getSupportAdvertisementTooltipParts,
    formatTooltipHtml,
    PREMIUM_CARDS,
    SUPPORT_LINKS,
    MERCHANT_ALIASES,
    QUICK_FILTERS,
    matchesOfferQuickFilters,
    getOfferCampaignLabel,
    getVisibleOfferKey,
    calculateCashback,
    calculateCashbackMaxKr,
    formatBreakdownWithAmounts,
    formatCompactRewardLabel,
    formatKr,
    formatRewardLabel,
    getMaxRewardPercent,
  },
});
