/**
 * @deprecated Prefer `@/api/affiliateAdminModerationApi` (`approveAffiliateApplication`, etc.).
 * Generic POST helper for affiliate admin paths (e.g. resend-link).
 */
export {
  postAffiliateAdminAuthed as callAdminAffiliateMutation,
  approveAffiliateApplication,
  declineAffiliateApplication,
  resendAffiliateReferralEmail,
  AFFILIATE_ADMIN,
} from '@/api/affiliateAdminModerationApi';
