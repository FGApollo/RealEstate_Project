import { normalizePendingAuthAction } from './pendingAuthAction.js';
import { propertyCategoryName } from '../services/propertyCategory.js';

const ALL_DISCOVERY = '/swipe/' + encodeURIComponent('Tất cả');

export const resolveOnboardingAction = (pending, preferences, fallback = ALL_DISCOVERY) => {
  const intended = pending || normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: fallback });
  if (intended && (intended.type !== 'NAVIGATE' || !intended.returnTo.startsWith('/swipe/')
    || intended.routeState?.activeView === 'saved' || intended.routeState?.selectPropertyId)) return intended;

  const categories = [...new Set((preferences?.preferred_property_types || [])
    .map(propertyCategoryName).filter((category) => category && category !== 'Đất Nền' && category !== 'Tất cả'))];
  if (intended && !categories.length) return intended;
  const category = categories.length === 1 ? categories[0] : 'Tất cả';
  return normalizePendingAuthAction({
    type: 'NAVIGATE',
    returnTo: '/swipe/' + encodeURIComponent(category),
    routeState: {
      ...(intended?.routeState || {}),
      filters: { ...(intended?.routeState?.filters || {}), categories }
    }
  });
};
