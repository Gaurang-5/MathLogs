import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketplaceHome from './MarketplaceHome';

const settle = () => new Promise(resolve => setTimeout(resolve, 350));

const item = {
  id: 'exact-apex', name: 'Exact Apex', slug: 'exact-apex', teacherName: 'Apex Teacher',
  phone: null, whatsappPhone: null, city: 'Muzaffarnagar', area: 'Gandhi Colony', address: '',
  tagline: '', aboutUs: '', logoUrl: null, googleMapsUrl: null, googleRating: null,
  googleReviewCount: 0, classesOffered: ['Class 9'], subjectsOffered: ['Mathematics'],
  isExclusive: false, isVerified: true, avgRating: 0, reviewCount: 0,
};

const landing = {
  valid: true,
  indexable: true,
  canonicalPath: '/coaching/muzaffarnagar/areas/gandhi-colony/classes/class-9/subjects/mathematics',
  title: 'Class 9 Mathematics in Gandhi Colony, Muzaffarnagar | MathLogs',
  description: 'Compare real coaching listings.',
  heading: 'Best Class 9 Mathematics in Gandhi Colony, Muzaffarnagar',
  introduction: 'Explore active listings.',
  filters: { city: 'Muzaffarnagar', area: 'Gandhi Colony', className: 'Class 9', subject: 'Mathematics' },
  breadcrumbs: [
    { name: 'Coaching in Muzaffarnagar', path: '/coaching' },
    { name: 'Gandhi Colony', path: '/coaching/muzaffarnagar/areas/gandhi-colony' },
  ],
  relatedLinks: [{ label: 'Class 9 coaching', path: '/coaching/muzaffarnagar/classes/class-9' }],
  items: [item],
  total: 1,
};

describe('MarketplaceHome routed landings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
  });

  async function renderLanding(responseData = landing) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: responseData }) }));
    await act(async () => root.render(
      <MemoryRouter initialEntries={[landing.canonicalPath]}>
        <Routes>
          <Route path="/coaching/muzaffarnagar/areas/:areaSlug/classes/:classSlug/subjects/:subjectSlug" element={<MarketplaceHome />} />
        </Routes>
      </MemoryRouter>,
    ));
    await act(async () => { await settle(); });
  }

  it('renders authoritative heading, breadcrumbs, active facets and exact listings', async () => {
    await renderLanding();
    expect(fetch).toHaveBeenCalledWith('/api/marketplace/landing?areaSlug=gandhi-colony&classSlug=class-9&subjectSlug=mathematics');
    expect(container.querySelector('h1')?.textContent).toBe(landing.heading);
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')?.textContent).toContain('Gandhi Colony');
    expect(container.textContent).toContain('Class 9');
    expect(container.textContent).toContain('Mathematics');
    expect(container.textContent).toContain('Exact Apex');
  });

  it('offers a broad-marketplace recovery link for an empty combination', async () => {
    await renderLanding({ ...landing, indexable: false, items: [], total: 0 });
    const recovery = Array.from(container.querySelectorAll('a')).find(link => link.textContent?.includes('all coaching'));
    expect(recovery?.getAttribute('href')).toBe('/coaching');
  });
});
