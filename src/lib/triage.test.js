import { describe, it, expect } from 'vitest';
import { triageComplaint } from './triageService.js';

describe('triageComplaint', () => {
  it('classifies public safety complaints as high priority', () => {
    const result = triageComplaint('There is a drunk person threatening neighbors and breaking the street lights.');

    expect(result.category).toBe('Public Safety');
    expect(result.priority).toBe('HIGH');
  });

  it('classifies infrastructure complaints as medium priority', () => {
    const result = triageComplaint('The drainage near the school is clogged and the road is flooded.');

    expect(result.category).toBe('Infrastructure');
    expect(result.priority).toBe('MEDIUM');
  });
});
