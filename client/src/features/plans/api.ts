import { api } from '../../utils/api';
import { validatePlanCatalogue } from './planViewModel';
import type { PlanProduct } from './types';

export async function loadPlanCatalogue(): Promise<PlanProduct[]> {
  const response = await api.get<{ success: boolean; data: unknown }>('/plans');
  if (!response?.success) throw new Error('PLAN_CATALOGUE_UNAVAILABLE');
  return validatePlanCatalogue(response.data);
}
