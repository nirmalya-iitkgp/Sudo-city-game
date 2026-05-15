/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

export interface Block extends Rect {
  level: number;
  isLeaf: boolean;
  locked: boolean;
  type: 'Residential' | 'Commercial' | 'Industrial' | 'Infrastructure';
  stability: number;
  lSystemString: string;
  lSystemDepth: number;
  corruptedUntil?: number;
}

export interface Node {
  id: string;
  x: number;
  y: number;
  type: 'Home' | 'Job';
  blockId: string;
  matchedId?: string;
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
  pheromone: number;
  distance: number;
}

export interface Drone {
  id: string;
  x: number;
  y: number;
  startNodeId: string;
  targetNodeId: string;
  currentNodeId: string;
  nextNodeId: string | null;
  path: string[]; // History of visited node IDs
  progress: number;
  speed: number;
  isScrambled?: boolean;
}

export interface Virus {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
}

export interface GameState {
  blocks: Block[];
  nodes: Node[];
  edges: Edge[];
  drones: Drone[];
  viruses: Virus[];
  credits: number;
  level: number;
  ticks: number;
  seed: string;
  recentDeliveries: { x: number, y: number, id: string, timer: number }[];
}
