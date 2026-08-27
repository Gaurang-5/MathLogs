import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TeacherButton,
  TeacherFeedback,
  TeacherPage,
  TeacherSurface,
} from '.';

describe('teacher UI primitives', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
  });

  async function render(node: React.ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(node));
  }

  it('gives each teacher page one explicit title and action region', async () => {
    await render(
      <TeacherPage title="Batches" actions={<button>Add batch</button>}>
        <p>Body</p>
      </TeacherPage>,
    );

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe('Batches');
    expect(container.querySelector('[data-teacher-page]')).not.toBeNull();
    expect(container.querySelector('[data-teacher-page-actions]')?.textContent).toBe('Add batch');
  });

  it('makes icon-only actions discoverable and touch sized', async () => {
    await render(
      <TeacherButton icon={<span aria-hidden>+</span>} iconOnlyLabel="Add batch" />,
    );

    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Add batch');
    expect(button?.className).toContain('teacher-interactive');
    expect(button?.className).toContain('min-h-11');
    expect(button?.className).toContain('min-w-11');
  });

  it('uses semantic roles for interactive surfaces and errors', async () => {
    await render(
      <>
        <TeacherSurface interactive as="button">Open details</TeacherSurface>
        <TeacherFeedback kind="error" title="Could not load" />
      </>,
    );

    expect(container.querySelector('button')?.textContent).toBe('Open details');
    expect(container.querySelector('button')?.className).toContain('teacher-interactive');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  });
});
