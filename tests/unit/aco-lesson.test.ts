import { describe, expect, it } from 'vitest';
import { AcoEngine } from '../../src/engines/aco/engine';
import { createTspInstance } from '../../src/engines/aco/tsp';
import { ACO_CHAPTERS } from '../../src/stories/aco/config';
import {
  ACO_LESSON_CHAPTER_IDS,
  ACO_LESSON_GROWTH_STAGES,
  ACO_LESSON_ONE_ANT_STEPS,
  ACO_LESSON_ONE_ANT_TOUR,
  ACO_LESSON_OPTIMUM_TOUR,
  ACO_LESSON_TOURS,
  bestTourIndexUpTo,
  distinctTourCount,
  enumerationFraction,
  enumerationStep,
  formatSearchTime,
  growthStageAt,
  growthStageIndex,
  oneAntStepIndex,
} from '../../src/stories/aco/lesson';
import { ACO_DEMO_CITIES, ACO_DEMO_CITY_COUNT, ACO_DEMO_SEED } from '../../src/stories/aco/world';

describe('ACO lesson data', () => {
  it('imports without a temporal-dead-zone error and keeps the frozen demo map', () => {
    expect(ACO_DEMO_CITY_COUNT).toBe(5);
    expect(ACO_DEMO_CITIES).toEqual(createTspInstance(ACO_DEMO_SEED, 5).cities);
    expect(ACO_DEMO_CITIES).toEqual(createTspInstance(ACO_DEMO_SEED, 30).cities.slice(0, 5));
  });

  it('enumerates the twelve distinct five-city tours and finds 1.617', () => {
    expect(ACO_LESSON_TOURS).toHaveLength(12);
    expect(ACO_LESSON_OPTIMUM_TOUR.order).toEqual([0, 2, 3, 1, 4]);
    expect(ACO_LESSON_OPTIMUM_TOUR.length).toBeCloseTo(1.6167028754031714, 12);

    const keys = new Set(ACO_LESSON_TOURS.map((tour) => tour.order.join(',')));
    expect(keys.size).toBe(12);

    // Every tour starts at city 0 and visits each other city once.
    for (const tour of ACO_LESSON_TOURS) {
      expect(tour.order[0]).toBe(0);
      expect(new Set(tour.order).size).toBe(5);
    }
  });

  it('continues the scripted one-ant walk into the real engine', () => {
    const engine = new AcoEngine({
      cityCount: 5,
      antCount: 1,
      alpha: 1,
      beta: 2,
      rho: 0.5,
      speed: 1,
      seed: 42,
    });
    engine.stepIteration();
    const firstTour = Array.from(engine.snapshot().ants[0]?.tour ?? []);
    expect(firstTour).toEqual([...ACO_LESSON_ONE_ANT_TOUR]);
    expect(engine.snapshot().bestTour).toEqual([...ACO_LESSON_ONE_ANT_TOUR]);
  });

  it('lets four ants reach the same 1.617 tour brute force found', () => {
    const engine = new AcoEngine({
      cityCount: 5,
      antCount: 4,
      alpha: 1,
      beta: 2,
      rho: 0.5,
      speed: 1,
      seed: 42,
    });
    for (let iteration = 0; iteration < 12; iteration += 1) engine.stepIteration();
    expect(engine.snapshot().bestLength).toBeCloseTo(ACO_LESSON_OPTIMUM_TOUR.length, 12);

    // A tour is a cycle: rotation and direction do not change the route.
    const edges = (tour: readonly number[]): string[] =>
      tour
        .map((city, index) => {
          const next = tour[(index + 1) % tour.length] as number;
          return city < next ? `${city}-${next}` : `${next}-${city}`;
        })
        .sort();
    expect(edges(engine.snapshot().bestTour ?? [])).toEqual(edges(ACO_LESSON_OPTIMUM_TOUR.order));
  });

  it('lets the final ant step return home instead of showing an empty choice', () => {
    expect(ACO_LESSON_ONE_ANT_STEPS).toHaveLength(5);
    const finalStep = ACO_LESSON_ONE_ANT_STEPS.at(-1);
    expect(finalStep?.currentCity).toBe(1);
    expect(finalStep?.chosenCity).toBe(0);
    expect(finalStep?.candidates).toHaveLength(1);
    expect(finalStep?.candidates[0]?.city).toBe(0);
    expect(finalStep?.candidates[0]?.probability).toBeCloseTo(1, 12);

    for (const step of ACO_LESSON_ONE_ANT_STEPS) {
      const total = step.candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
      expect(total).toBeCloseTo(1, 12);
      expect(step.candidates.map((candidate) => candidate.city)).toContain(step.chosenCity);
    }
  });

  it('reports the factorial wall with the documented counts and times', () => {
    expect(ACO_LESSON_GROWTH_STAGES.map((stage) => stage.cityCount)).toEqual([5, 10, 15, 20, 30]);
    expect(distinctTourCount(5)).toBe(12n);
    expect(distinctTourCount(10)).toBe(181_440n);
    expect(ACO_LESSON_GROWTH_STAGES.map((stage) => stage.toursLabel)).toEqual([
      '12',
      '181,440',
      '4.4 × 10¹⁰',
      '6.1 × 10¹⁶',
      '4.4 × 10³⁰',
    ]);
    expect(formatSearchTime(distinctTourCount(5))).toBe('instant');
    expect(formatSearchTime(distinctTourCount(15))).toBe('44 seconds');
    expect(formatSearchTime(distinctTourCount(20))).toBe('about 704 days');
    expect(formatSearchTime(distinctTourCount(30))).toContain('age of the universe');

    for (const stage of ACO_LESSON_GROWTH_STAGES) {
      expect(stage.tours).toBe(distinctTourCount(stage.cityCount));
    }
  });

  it('keeps the lesson caption ids aligned with the guided chapters', () => {
    const guided = [
      'the-problem',
      'try-every-tour',
      'too-many-tours',
      'one-ants-choice',
      'leaving-a-trace',
      'forgetting',
      'two-ants',
      'emergence',
    ];
    expect([...ACO_LESSON_CHAPTER_IDS].sort()).toEqual(guided.sort());
    for (const id of guided) {
      expect(
        ACO_CHAPTERS.some((chapter) => chapter.id === id),
        id,
      ).toBe(true);
    }
  });

  it('clamps every scrub helper at both ends', () => {
    expect(enumerationStep(-1)).toBe(0);
    expect(enumerationStep(1)).toBe(11);
    expect(enumerationFraction(0.5)).toBeCloseTo(0, 12);
    expect(enumerationFraction(1)).toBeCloseTo(0, 12);
    expect(bestTourIndexUpTo(0)).toBe(0);
    expect(bestTourIndexUpTo(11)).toBe(ACO_LESSON_TOURS.indexOf(ACO_LESSON_OPTIMUM_TOUR));

    expect(oneAntStepIndex(-1)).toBe(0);
    expect(oneAntStepIndex(1)).toBe(4);
    expect(growthStageIndex(-1)).toBe(0);
    expect(growthStageIndex(1)).toBe(4);
    expect(growthStageAt(1).cityCount).toBe(30);
  });
});
