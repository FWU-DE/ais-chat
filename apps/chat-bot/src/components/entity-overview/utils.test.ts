import { describe, expect, it } from 'vitest';

import {
  applyFavoriteChange,
  filterAndSortEntities,
  isSortOption,
  revertFavoriteChange,
} from './utils';

describe('revertFavoriteChange', () => {
  it('restores the previous flag of an entity that is still listed', () => {
    const entities = [
      { id: 'a', isFavorite: true },
      { id: 'b', isFavorite: true },
    ];

    expect(revertFavoriteChange(entities, { id: 'b', isFavorite: false })).toEqual([
      { id: 'a', isFavorite: true },
      { id: 'b', isFavorite: false },
    ]);
  });

  it('re-adds an entity that was removed from the list', () => {
    const entities = [{ id: 'a', isFavorite: true }];

    expect(revertFavoriteChange(entities, { id: 'b', isFavorite: true })).toEqual([
      { id: 'a', isFavorite: true },
      { id: 'b', isFavorite: true },
    ]);
  });
});

describe('applyFavoriteChange', () => {
  const entities = [
    { id: 'a', isFavorite: true },
    { id: 'b', isFavorite: false },
  ];

  it('updates the favorite flag of the entity', () => {
    expect(applyFavoriteChange(entities, 'b', true, 'all')).toEqual([
      { id: 'a', isFavorite: true },
      { id: 'b', isFavorite: true },
    ]);
  });

  it('removes an unfavorited entity in the favorites tab', () => {
    expect(applyFavoriteChange(entities, 'a', false, 'favorites')).toEqual([
      { id: 'b', isFavorite: false },
    ]);
  });

  it('keeps an unfavorited entity in other tabs', () => {
    expect(applyFavoriteChange(entities, 'a', false, 'mine')).toEqual([
      { id: 'a', isFavorite: false },
      { id: 'b', isFavorite: false },
    ]);
  });
});

function entity(name: string, updatedAt: string, popularity = 0) {
  return { name, updatedAt: new Date(updatedAt), popularity };
}

describe('isSortOption', () => {
  it('accepts the popularity option', () => {
    expect(isSortOption('popularity')).toBe(true);
  });

  it('rejects unknown options', () => {
    expect(isSortOption('popularity-desc')).toBe(false);
  });
});

describe('filterAndSortEntities with popularity', () => {
  it('sorts by popularity descending, so the most popular entity comes first', () => {
    const entities = [
      entity('c', '2026-01-03', 1),
      entity('a', '2026-01-01', 3),
      entity('b', '2026-01-02', 2),
    ];

    const result = filterAndSortEntities(entities, '', 'popularity');

    expect(result.map((e) => e.name)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties by updatedAt descending', () => {
    const entities = [
      entity('old', '2026-01-01', 2),
      entity('new', '2026-01-03', 2),
      entity('middle', '2026-01-02', 2),
    ];

    const result = filterAndSortEntities(entities, '', 'popularity');

    expect(result.map((e) => e.name)).toEqual(['new', 'middle', 'old']);
  });

  it('combines with the search query', () => {
    const entities = [
      entity('Mathe Tutor', '2026-01-01', 1),
      entity('Mathe Helfer', '2026-01-02', 2),
      entity('Geschichte', '2026-01-03', 2),
    ];

    const result = filterAndSortEntities(entities, 'mathe', 'popularity');

    expect(result.map((e) => e.name)).toEqual(['Mathe Helfer', 'Mathe Tutor']);
  });

  it('does not mutate the passed list', () => {
    const entities = [entity('b', '2026-01-01', 1), entity('a', '2026-01-02', 2)];

    filterAndSortEntities(entities, '', 'popularity');

    expect(entities.map((e) => e.name)).toEqual(['b', 'a']);
  });

  it('keeps the existing date sort unchanged', () => {
    const entities = [entity('old', '2026-01-01', 2), entity('new', '2026-01-02', 1)];

    expect(filterAndSortEntities(entities, '', 'date-desc').map((e) => e.name)).toEqual([
      'new',
      'old',
    ]);
  });
});
