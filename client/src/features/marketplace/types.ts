import type { CoachingItem } from '../../components/CoachingCard';

export type MarketplaceLandingPage = {
  valid: boolean;
  indexable: boolean;
  canonicalPath: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  filters: {
    city: 'Muzaffarnagar';
    area?: string;
    className?: string;
    subject?: string;
  };
  breadcrumbs: Array<{ name: string; path: string }>;
  relatedLinks: Array<{ label: string; path: string }>;
  items: CoachingItem[];
  total: number;
};
