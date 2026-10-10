import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoachingProfile from './CoachingProfile';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const profile = {
  id: 'adl', name: 'ADL Accountancy Classes', slug: 'adl-accountancy-classes', teacherName: 'Abhishek Grover',
  phone: null, whatsappPhone: null, city: 'Muzaffarnagar', area: 'Gandhi Colony', address: '',
  tagline: '', aboutUs: '', logoUrl: null, googleMapsUrl: null, subjectsOffered: ['Accountancy'],
  classesOffered: ['Class 11', 'Class 12'], isExclusive: true, isVerified: true, batches: [],
  avgRating: 0, reviewCount: 0, ratingBreakdown: {}, reviews: [],
};

describe('CoachingProfile marketplace SEO', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: profile }) }));
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

  it('uses the exact coaching name and exposes real breadcrumb and facet links', async () => {
    await act(async () => root.render(
      <MemoryRouter initialEntries={['/coaching/adl-accountancy-classes']}>
        <Routes><Route path="/coaching/:slug" element={<CoachingProfile />} /></Routes>
      </MemoryRouter>,
    ));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });

    expect(document.title).toBe('ADL Accountancy Classes in Gandhi Colony, Muzaffarnagar | Classes & Contact');
    expect(container.querySelector('h1')?.textContent).toBe('ADL Accountancy Classes');
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')?.textContent).toContain('ADL Accountancy Classes');
    const hrefs = Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/coaching/muzaffarnagar/areas/gandhi-colony');
    expect(hrefs).toContain('/coaching/muzaffarnagar/classes/class-11');
    expect(hrefs).toContain('/coaching/muzaffarnagar/subjects/accountancy');
  });
});
