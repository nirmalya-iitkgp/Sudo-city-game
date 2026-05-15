/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Block, Node, Rect } from '../types';

// Deterministic random numbers based on a seed
export function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// 1. BSP Algorithm
export function partition(
  rect: Rect, 
  level: number, 
  maxLevel: number, 
  minSize: number, 
  rng: () => number,
  blocks: Block[] = []
): Block[] {
  const isLeaf = level >= maxLevel || (rect.width < minSize * 2 && rect.height < minSize * 2);
  
  const block: Block = {
    ...rect,
    level,
    isLeaf,
    locked: false,
    id: generateId(),
    type: level === 0 ? 'Infrastructure' : (rng() > 0.7 ? 'Industrial' : (rng() > 0.4 ? 'Commercial' : 'Residential')),
    stability: 0.5 + rng() * 0.5,
    lSystemString: 'F',
    lSystemDepth: Math.floor(rng() * 3) + 1,
  };

  if (isLeaf) {
    blocks.push(block);
    return blocks;
  }

  // Choose split axis
  const splitHorizontally = rect.width / rect.height < 1.2 ? rng() > 0.5 : rect.width < rect.height;
  
  let split = 0;
  if (splitHorizontally) {
    split = minSize + rng() * (rect.height - 2 * minSize);
    if (split < minSize || (rect.height - split) < minSize) {
      blocks.push({ ...block, isLeaf: true });
      return blocks;
    }
    partition({ ...rect, height: split }, level + 1, maxLevel, minSize, rng, blocks);
    partition({ ...rect, y: rect.y + split, height: rect.height - split }, level + 1, maxLevel, minSize, rng, blocks);
  } else {
    split = minSize + rng() * (rect.width - 2 * minSize);
    if (split < minSize || (rect.width - split) < minSize) {
      blocks.push({ ...block, isLeaf: true });
      return blocks;
    }
    partition({ ...rect, width: split }, level + 1, maxLevel, minSize, rng, blocks);
    partition({ ...rect, x: rect.x + split, width: rect.width - split }, level + 1, maxLevel, minSize, rng, blocks);
  }

  return blocks;
}

// 2. L-Systems Logic
export function evolveLSystem(axiom: string, iterations: number): string {
  let current = axiom;
  // Rule: F -> F[+F]F[-F]F (controlled branching)
  // Rule: X -> F[+X][-X]FX (taller, angular branching for business)
  const rules: { [key: string]: string } = {
    'F': 'F[+F]F[-F]F',
    'X': 'F[+X][-X]FX',
    'Y': 'F[+Y][-Y]FY[+F][-F]'
  };

  for (let i = 0; i < iterations; i++) {
    let next = '';
    for (let char of current) {
      next += rules[char] || char;
    }
    current = next;
    if (current.length > 400) break; 
  }
  return current;
}

// 3. Stable Marriage (Gale-Shapley)
export function matchNodes(homes: Node[], jobs: Node[]): { [key: string]: string } {
  // Simple version: Each home wants the closest job
  // Each job wants the closest home
  if (homes.length === 0 || jobs.length === 0) return {};

  const matches: { [key: string]: string } = {}; // homeId -> jobId
  const jobMatches: { [key: string]: string } = {}; // jobId -> homeId
  
  const freeHomes = [...homes];
  
  const hPrefs = homes.map(h => {
    return {
      id: h.id,
      prefs: [...jobs].sort((a, b) => {
        const distA = Math.hypot(h.x - a.x, h.y - a.y);
        const distB = Math.hypot(h.x - b.x, h.y - b.y);
        return distA - distB;
      }).map(j => j.id)
    };
  });

  const jPrefsMap = new Map(jobs.map(j => {
    return [j.id, [...homes].sort((a, b) => {
      const distA = Math.hypot(j.x - a.x, j.y - a.y);
      const distB = Math.hypot(j.x - b.x, j.y - b.y);
      return distA - distB;
    }).map(h => h.id)];
  }));

  const hPrefsMap = new Map(hPrefs.map(p => [p.id, p.prefs]));
  const hNextProposal = new Map(homes.map(h => [h.id, 0]));

  while (freeHomes.length > 0) {
    const h = freeHomes.shift()!;
    const hPref = hPrefsMap.get(h.id)!;
    const proposalIndex = hNextProposal.get(h.id)!;
    
    if (proposalIndex >= hPref.length) continue;

    const jId = hPref[proposalIndex];
    hNextProposal.set(h.id, proposalIndex + 1);

    const currentMatch = jobMatches[jId];
    if (!currentMatch) {
      jobMatches[jId] = h.id;
      matches[h.id] = jId;
    } else {
      const jPref = jPrefsMap.get(jId)!;
      if (jPref.indexOf(h.id) < jPref.indexOf(currentMatch)) {
        jobMatches[jId] = h.id;
        matches[h.id] = jId;
        freeHomes.push(homes.find(x => x.id === currentMatch)!);
        delete matches[currentMatch];
      } else {
        freeHomes.push(h);
      }
    }
  }

  return matches;
}

// 4. Pathfind following edges (ACO simplified)
// We'll define a set of "Waypoints" which are block corners
// Phero values increase on frequently used edges
export function getBlockCorners(block: Block): {x: number, y: number}[] {
  return [
    { x: block.x, y: block.y },
    { x: block.x + block.width, y: block.y },
    { x: block.x + block.width, y: block.y + block.height },
    { x: block.x, y: block.y + block.height },
  ];
}
