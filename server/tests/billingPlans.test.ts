import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicPlanCatalogue } from '../src/controllers/planCatalogController';

test('public plan catalogue exposes only the approved products and authoritative paise prices', async () => {
  let body: unknown;
  const response = { json(value: unknown) { body = value; return this; } };
  await getPublicPlanCatalogue({} as never, response as never);

  assert.equal((body as { success: boolean }).success, true);
  assert.deepEqual((body as { data: Array<Record<string, unknown>> }).data.map(plan => ({
    id: plan.id,
    oneTimePricePaise: plan.oneTimePricePaise,
    promotionalPricePaise: plan.promotionalPricePaise,
    monthlyPricePaise: plan.monthlyPricePaise,
    yearlyPricePaise: plan.yearlyPricePaise
  })), [
      { id: 'MARKETPLACE', oneTimePricePaise: 9_900, promotionalPricePaise: 0, monthlyPricePaise: null, yearlyPricePaise: null },
      { id: 'QUIZ', oneTimePricePaise: null, promotionalPricePaise: null, monthlyPricePaise: 24_900, yearlyPricePaise: 249_900 },
      { id: 'ENTERPRISE', oneTimePricePaise: null, promotionalPricePaise: null, monthlyPricePaise: 49_900, yearlyPricePaise: 499_900 }
  ]);
});
